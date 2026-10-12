"""Create a public release manifest; never include runtime configuration."""
import hashlib
import json
import re
import sys
from pathlib import Path

REPO = "kwakhyun/bangi-map"
CONTRACT_PATHS = (
    "infra/single-vm",
    "experiments/vworld3d/viewer.css",
    "experiments/vworld3d/viewer.js",
    "scripts/prepare-vworld3d.mjs",
    "infra/cicd/ncp-callback-public.pem",
    "infra/cicd/bangi-deploy.service",
    "infra/cicd/bangi-deploy.timer",
    "scripts/cicd/agent.py",
    "scripts/cicd/deploy.py",
    "scripts/cicd/release.py",
)


def digest_paths(root, paths):
    files = []
    for relative in paths:
        path = root / relative
        files.extend(p for p in path.rglob("*") if p.is_file()) if path.is_dir() else files.append(path)
    digest = hashlib.sha256()
    for path in sorted(files):
        digest.update(path.relative_to(root).as_posix().encode() + b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def compatibility(root):
    return {
        "migrations": digest_paths(root, ["services/api/src/main/resources/db/migration"]),
        "serverContract": digest_paths(root, CONTRACT_PATHS),
    }


def file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def manifest(root, sha, archive):
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("A full commit SHA is required")
    return {
        "schema": 1, "repository": REPO, "sha": sha,
        "version": json.loads((root / "package.json").read_text())["version"],
        "images": {name: f"fieldtwin-{name}:sha-{sha}" for name in ("web", "api")},
        "archiveSha256": file_digest(archive), "archiveBytes": archive.stat().st_size,
        "compatibility": compatibility(root),
        "sceneSha256": file_digest(root / "apps/web/public/gis/bangi2-scene-v1.json"),
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    if sys.argv[1:] == ["baseline"]:
        print(json.dumps(compatibility(root), sort_keys=True))
    else:
        print(json.dumps(manifest(root, sys.argv[1], Path(sys.argv[2])), indent=2))
