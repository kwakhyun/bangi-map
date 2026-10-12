#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
version=3.9.11
base=".tools/apache-maven-$version"
if [ ! -x "$base/bin/mvn" ]; then
  mkdir -p .tools
  archive="apache-maven-$version-bin.tar.gz"
  url="https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$version/$archive"
  curl -fsSL "$url" -o ".tools/$archive"
  curl -fsSL "$url.sha512" -o ".tools/$archive.sha512"
  python3 - "$archive" <<'PY'
from pathlib import Path
import hashlib,sys
p=Path('.tools')/sys.argv[1]
expected=Path(str(p)+'.sha512').read_text().split()[0]
assert hashlib.sha512(p.read_bytes()).hexdigest()==expected, 'Maven checksum mismatch'
PY
  tar -xzf ".tools/$archive" -C .tools
fi
exec "$base/bin/mvn" -Dmaven.repo.local="$(pwd)/.tools/m2" -f services/api/pom.xml "$@"
