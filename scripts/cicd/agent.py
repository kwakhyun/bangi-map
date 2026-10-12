"""Poll public deployment requests; decrypt only the current job's callback token."""
import base64
import json
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import deploy
from release import REPO, file_digest

API = f"https://api.github.com/repos/{REPO}"
ENVIRONMENT = "ncp-staging"
TASK = "bangi:deploy"


def github(path, token=None, body=None):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "bangi-ncp-deployer",
               "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    request = urllib.request.Request(API + path, headers=headers, data=data)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def validate_request(request, now=None):
    now = now or datetime.now(timezone.utc)
    payload = request.get("payload", {})
    if isinstance(payload, str):
        payload = json.loads(payload)
    if (request.get("environment") != ENVIRONMENT or request.get("task") != TASK
            or request.get("creator", {}).get("login") != "github-actions[bot]"
            or payload.get("protocol") != 1):
        raise ValueError("Untrusted deployment request")
    sha = request.get("sha", "")
    run_id, attempt = payload.get("runId"), payload.get("runAttempt")
    if not re.fullmatch(r"[0-9a-f]{40}", sha) or type(run_id) is not int or run_id < 1 or type(attempt) is not int or attempt < 1:
        raise ValueError("Invalid workflow identity")
    if payload.get("releaseTag") != f"ncp-{sha}-{run_id}-{attempt}":
        raise ValueError("Release identity mismatch")
    if not re.fullmatch(r"[0-9a-f]{64}", payload.get("manifestSha256", "")):
        raise ValueError("Missing manifest checksum")
    created = datetime.fromisoformat(request["created_at"].replace("Z", "+00:00"))
    expires = datetime.fromisoformat(payload["expiresAt"].replace("Z", "+00:00"))
    if expires <= now or created > now or not 0 < (expires - created).total_seconds() <= 1205:
        raise ValueError("Deployment request expired")
    return payload


def validate_workflow(request, payload, run, jobs, branch):
    if (branch["commit"]["sha"] != request["sha"] or run["head_sha"] != request["sha"]
            or run["head_branch"] != "main" or run["event"] not in ("push", "workflow_dispatch")
            or run["path"] != ".github/workflows/verify.yml"
            or run["run_attempt"] != payload["runAttempt"] or run["status"] != "in_progress"):
        raise ValueError("Only the current verified main workflow may deploy")
    conclusions = {item["name"]: item["conclusion"] for item in jobs["jobs"]}
    if any(conclusions.get(name) != "success" for name in ("verify", "package")):
        raise ValueError("Verification and packaging must both succeed")


def decrypt_token(payload, root):
    encrypted = base64.b64decode(payload["sealedToken"], validate=True)
    if len(encrypted) != 512:
        raise ValueError("Invalid encrypted callback token")
    result = subprocess.run(
        ["openssl", "pkeyutl", "-decrypt", "-inkey", str(root / "runtime/cicd/callback.key"),
         "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256", "-pkeyopt", "rsa_mgf1_md:sha256"],
        input=encrypted, capture_output=True, timeout=10,
    )
    if result.returncode:
        raise ValueError("Cannot decrypt callback token")
    token = result.stdout.decode()
    if not re.fullmatch(r"[A-Za-z0-9_]+", token):
        raise ValueError("Invalid callback token format")
    return token


def status(request, token, state, description):
    return github(f"/deployments/{request['id']}/statuses", token, {
        "state": state, "description": description[:140], "auto_inactive": False,
        "log_url": f"https://github.com/{REPO}/actions/runs/{request['payload']['runId']}",
    })


class ReleaseRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        if parsed.scheme != "https" or parsed.hostname not in {"github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"}:
            raise ValueError("Unexpected release download host")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def download(tag, name, destination, limit):
    url = f"https://github.com/{REPO}/releases/download/{tag}/{name}"
    opener = urllib.request.build_opener(ReleaseRedirects())
    total = 0
    deadline = time.monotonic() + 240
    with opener.open(urllib.request.Request(url, headers={"User-Agent": "bangi-ncp-deployer"}), timeout=30) as response:
        with destination.open("wb") as stream:
            while block := response.read(1024 * 1024):
                total += len(block)
                if total > limit or time.monotonic() > deadline:
                    raise ValueError("Release download exceeds its limit")
                stream.write(block)


def process(request, root):
    payload = validate_request(request)
    request["payload"] = payload
    token = decrypt_token(payload, root)
    try:
        run = github(f"/actions/runs/{payload['runId']}", token)
        jobs = github(f"/actions/runs/{payload['runId']}/jobs?filter=latest", token)
        validate_workflow(request, payload, run, jobs, github("/branches/main", token))
        # Ensure the restricted token really can acknowledge this deployment before touching the VM.
        status(request, token, "in_progress", "NCP is validating the release")
        with tempfile.TemporaryDirectory(prefix="download-", dir=root / "runtime/cicd") as folder:
            folder = Path(folder)
            manifest_file = folder / "manifest.json"
            download(payload["releaseTag"], "manifest.json", manifest_file, 64 * 1024)
            if file_digest(manifest_file) != payload["manifestSha256"]:
                raise ValueError("Manifest checksum mismatch")
            manifest = json.loads(manifest_file.read_text())
            if manifest["sha"] != request["sha"]:
                raise ValueError("Manifest commit mismatch")
            deploy.validate_manifest(manifest, json.loads((root / "runtime/cicd/baseline.json").read_text()))
            archive = folder / "images.tar.gz"
            download(payload["releaseTag"], "images.tar.gz", archive, manifest["archiveBytes"])
            # A newer main push or canceled job must not start a stale rollout after the download.
            validate_workflow(request, payload, github(f"/actions/runs/{payload['runId']}", token), jobs,
                              github("/branches/main", token))
            with deploy.lock(root):
                result = deploy.apply(manifest, archive, request["id"], root)
    except Exception as error:
        # Local diagnostics contain exception type only; never log token-bearing HTTP requests.
        reason = str(error) if type(error) in (ValueError, RuntimeError) else f"Preflight failed ({type(error).__name__})"
        print(f"Deployment {request['id']}: {reason}", flush=True)
        result = {"state": "failure", "description": reason[:140], "rolledBack": False}
        with deploy.lock(root):
            recovered = deploy.recover(root)
            if recovered:
                result = recovered
    outcome = {"deploymentId": request["id"], "sha": request["sha"], **result}
    deploy.save(root / "runtime/cicd/outcome.json", outcome)
    status(request, token, result["state"], result["description"])
    if result["state"] == "success":
        try:
            deploy.cleanup_images(root)
        except Exception:
            print("Unused CI image cleanup needs operator attention", flush=True)
    return outcome


def main(root=deploy.ROOT):
    private = root / "runtime/cicd"
    if (private / "PAUSED").exists():
        return
    with deploy.lock(root):
        deploy.recover(root)
    requests = github(f"/deployments?environment={ENVIRONMENT}&task={TASK}&per_page=1")
    if not requests:
        return
    request = requests[0]
    state_path = private / "poll-state.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    if request["id"] <= state.get("lastHandledId", 0):
        return
    try:
        payload = validate_request(request)
    except (ValueError, KeyError):
        deploy.save(state_path, {"lastHandledId": request["id"]})
        print("Ignored an expired or unsupported deployment request", flush=True)
        return
    request["payload"] = payload
    outcome_path = private / "outcome.json"
    if outcome_path.exists():
        outcome = json.loads(outcome_path.read_text())
        if outcome["deploymentId"] == request["id"]:
            status(request, decrypt_token(payload, root), outcome["state"], outcome["description"])
            deploy.save(state_path, {"lastHandledId": request["id"]})
            return
    outcome = process(request, root)
    deploy.save(state_path, {"lastHandledId": request["id"]})
    print(json.dumps(outcome), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Deployment polling failed ({type(error).__name__}); service will retry", flush=True)
        raise SystemExit(1) from None
