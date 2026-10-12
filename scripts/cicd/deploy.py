"""Bounded app-only transactions for the existing NCP VM. No remote shell scripts."""
import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import ssl
import subprocess
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path

ROOT = Path("/opt/fieldtwin")
SOURCE = "https://github.com/kwakhyun/bangi-map"


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix(".tmp")
    with temporary.open("w") as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def command(args, root=ROOT, timeout=120):
    result = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        # Docker/Compose output may contain runtime settings. Keep it off public logs.
        raise RuntimeError(f"Command failed: {args[0]} (exit {result.returncode})")
    return result.stdout


@contextmanager
def lock(root=ROOT):
    path = root / "runtime/cicd/deploy.lock"
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("a") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        yield


def dc(args, root=ROOT):
    return command([str(root / "dc"), *args], root)


def containers(root=ROOT):
    result = {}
    for name in ("web", "fieldtwin-api", "db"):
        cid = dc(["ps", "-a", "-q", name], root).strip()
        if not cid:
            raise RuntimeError("A required container is missing")
        result[name] = json.loads(command(["docker", "inspect", cid], root))[0]
    return result


def check_containers(expected, database_id, root=ROOT):
    actual = containers(root)
    if actual["db"]["Id"] != database_id:
        raise RuntimeError("Database container changed")
    for service, image_id in expected.items():
        item = actual[service]
        if (item["Image"] != image_id or not item["State"]["Running"]
                or item["State"]["OOMKilled"] or item["RestartCount"] != 0):
            raise RuntimeError("Container image or runtime health mismatch")


def health(root=ROOT, sha=None, scene=None, timeout=180):
    context = ssl.create_default_context(cafile=str(root / "runtime/tls/verification-ca.crt"))

    def get(path):
        with urllib.request.urlopen("https://localhost:8443" + path, context=context, timeout=5) as response:
            return response.read()

    deadline = time.monotonic() + timeout
    while True:
        try:
            config = json.loads(get("/api/config"))
            if config["environment"] != "staging" or config["demo"] is not False:
                raise ValueError("Unexpected runtime environment")
            if sha:
                if config.get("revision") != sha or json.loads(get("/release.json"))["revision"] != sha:
                    raise ValueError("Release revision mismatch")
            if not json.loads(get("/api/places")):
                raise ValueError("Facility lookup returned no data")
            if json.loads(get("/api/district"))["id"] != "bangi2":
                raise ValueError("District lookup failed")
            if json.loads(get("/realistic3d/status.json"))["enabled"] is not True:
                raise ValueError("Photoreal runtime is unavailable")
            try:
                get("/api/admin/reports")
            except urllib.error.HTTPError as error:
                if error.code != 401:
                    raise ValueError("Unexpected admin authorization status") from None
            else:
                raise ValueError("Admin route is not protected")
            if scene and hashlib.sha256(get("/gis/bangi2-scene-v1.json")).hexdigest() != scene:
                raise ValueError("GIS data mismatch")
            get("/")
            return
        except (OSError, ValueError, KeyError):
            if time.monotonic() >= deadline:
                raise RuntimeError("HTTPS and application health verification failed") from None
            time.sleep(3)


def validate_manifest(manifest, baseline):
    sha = manifest.get("sha", "")
    if manifest.get("schema") != 1 or manifest.get("repository") != "kwakhyun/bangi-map":
        raise ValueError("Unsupported release manifest")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Invalid release SHA")
    expected = {name: f"fieldtwin-{name}:sha-{sha}" for name in ("web", "api")}
    if manifest.get("images") != expected:
        raise ValueError("Unexpected image references")
    for key in ("archiveSha256", "sceneSha256"):
        if not re.fullmatch(r"[0-9a-f]{64}", manifest.get(key, "")):
            raise ValueError("Invalid release digest")
    size = manifest.get("archiveBytes")
    if type(size) is not int or not 1 <= size <= 400 * 1024 * 1024:
        raise ValueError("Release exceeds Micro server download limit")
    if manifest.get("compatibility") != baseline:
        raise ValueError("DB migrations or installed server contract changed; manual review required")


def journal_path(root):
    return root / "runtime/cicd/transaction.json"


def restore_transaction(journal, root=ROOT):
    snapshot = root / "runtime/cicd/rollbacks" / journal["snapshot"]
    dc(["stop", "web", "fieldtwin-api"], root)
    destination = root / "runtime/compose.env"
    temporary = destination.with_suffix(".rollback")
    shutil.copy2(snapshot / "compose.env", temporary)
    os.replace(temporary, destination)
    dc(["up", "-d", "--no-deps", "fieldtwin-api", "web"], root)
    health(root)
    check_containers(journal["previousImages"], journal["databaseId"], root)
    journal["state"] = "rolled_back"
    save(journal_path(root), journal)
    result = {"state": "failure", "description": "Deployment failed; previous version restored", "rolledBack": True}
    save(root / "runtime/cicd/outcome.json", {"deploymentId": journal["deploymentId"], "sha": journal["sha"], **result})
    return result


def recover(root=ROOT):
    path = journal_path(root)
    if path.exists():
        journal = json.loads(path.read_text())
        if journal["state"] == "pending":
            return restore_transaction(journal, root)
        # A crash after committing the rollout but before saving its callback
        # must acknowledge the healthy release, not attempt the same snapshot again.
        outcome_path = root / "runtime/cicd/outcome.json"
        outcome = json.loads(outcome_path.read_text()) if outcome_path.exists() else {}
        if journal["state"] == "committed" and outcome.get("deploymentId", 0) < journal["deploymentId"]:
            try:
                health(root, sha=journal["sha"], timeout=30)
                check_containers(journal["images"], journal["databaseId"], root)
            except Exception:
                journal["state"] = "pending"
                save(path, journal)
                return restore_transaction(journal, root)
            result = {"deploymentId": journal["deploymentId"], "sha": journal["sha"],
                      "state": "success", "description": "NCP verified release recovered after callback interruption", "rolledBack": False}
            save(outcome_path, result)
    return None


def rollback_previous(root=ROOT):
    journal = json.loads(journal_path(root).read_text())
    journal["state"] = "pending"
    save(journal_path(root), journal)
    result = restore_transaction(journal, root)
    # Pause polling so the same successful request cannot immediately redeploy.
    (root / "runtime/cicd/PAUSED").touch(mode=0o600)
    return result


def apply(manifest, archive, deployment_id, root=ROOT):
    baseline = json.loads((root / "runtime/cicd/baseline.json").read_text())
    validate_manifest(manifest, baseline)
    from release import file_digest
    if archive.stat().st_size != manifest["archiveBytes"] or file_digest(archive) != manifest["archiveSha256"]:
        raise ValueError("Archive integrity check failed")
    if shutil.disk_usage(root).free < max(1024**3, manifest["archiveBytes"] * 5):
        raise RuntimeError("Insufficient disk space for safe image loading")
    recover(root)
    health(root, timeout=30)
    command(["docker", "load", "-i", str(archive)], root, timeout=300)
    images = {}
    for name, tag in manifest["images"].items():
        item = json.loads(command(["docker", "image", "inspect", tag], root))[0]
        labels = item["Config"].get("Labels", {})
        if (item["Architecture"] != "amd64" or labels.get("org.opencontainers.image.revision") != manifest["sha"]
                or labels.get("org.opencontainers.image.source") != SOURCE):
            raise ValueError("Loaded image identity mismatch")
        images["web" if name == "web" else "fieldtwin-api"] = item["Id"]
    dc(["config", "--quiet"], root)
    before = containers(root)
    snapshot_name = f"{deployment_id}-{manifest['sha'][:12]}"
    snapshot = root / "runtime/cicd/rollbacks" / snapshot_name
    snapshot.mkdir(parents=True, mode=0o700)
    shutil.copy2(root / "runtime/compose.env", snapshot / "compose.env")
    journal = {"state": "pending", "deploymentId": deployment_id, "sha": manifest["sha"],
               "snapshot": snapshot_name, "databaseId": before["db"]["Id"],
               "previousImages": {name: before[name]["Image"] for name in images}, "images": images}
    save(journal_path(root), journal)
    try:
        dc(["stop", "web", "fieldtwin-api"], root)
        path = root / "runtime/compose.env"
        lines = [line for line in path.read_text().splitlines() if not line.startswith(("WEB_IMAGE=", "API_IMAGE="))]
        lines.extend([f"WEB_IMAGE={manifest['images']['web']}", f"API_IMAGE={manifest['images']['api']}"])
        temporary = path.with_suffix(".next")
        temporary.write_text("\n".join(lines) + "\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        dc(["up", "-d", "--no-deps", "fieldtwin-api", "web"], root)
        health(root, sha=manifest["sha"], scene=manifest["sceneSha256"])
        check_containers(images, journal["databaseId"], root)
        dc(["exec", "-T", "web", "nginx", "-t"], root)
        journal["state"] = "committed"
        save(journal_path(root), journal)
        return {"state": "success", "description": "NCP HTTPS and application checks passed", "rolledBack": False}
    except BaseException:
        return restore_transaction(journal, root)


def cleanup_images(root=ROOT):
    """Only our SHA-tagged images; preserve running + immediate rollback images."""
    journal = json.loads(journal_path(root).read_text())
    keep = set(journal["images"].values()) | set(journal["previousImages"].values())
    tags = command(["docker", "image", "ls", "--format", "{{.Repository}}:{{.Tag}}"], root).splitlines()
    for tag in tags:
        if re.fullmatch(r"fieldtwin-(?:web|api):sha-[0-9a-f]{40}", tag):
            item = json.loads(command(["docker", "image", "inspect", tag], root))[0]
            if item["Id"] not in keep and item["Config"].get("Labels", {}).get("org.opencontainers.image.source") == SOURCE:
                command(["docker", "image", "rm", tag], root)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["recover", "rollback"])
    args = parser.parse_args()
    with lock():
        result = rollback_previous() if args.action == "rollback" else recover()
    if result:
        print(json.dumps(result))
