#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
release="${RELEASE_TAG:-}"
platform="${TARGET_PLATFORM:-linux/amd64}"
for service in web api; do
  if [ "$service" = web ]; then
    dockerfile=apps/web/Dockerfile; tag="${release:-0.6.2}"
  else
    dockerfile="services/$service/Dockerfile"; tag="${release:-0.6.2}"
  fi
  docker buildx build --platform "$platform" --load -f "$dockerfile" -t "fieldtwin-$service:$tag" .
done
