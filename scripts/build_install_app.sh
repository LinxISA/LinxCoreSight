#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_OUT="${ROOT_DIR}/release/mac-arm64/LinxCoreSight.app"
APP_DST="/Applications/LinxCoreSight.app"

cd "${ROOT_DIR}"
npm run typecheck
npm run build

if [[ ! -d "${APP_OUT}" ]]; then
  echo "error: build output app not found: ${APP_OUT}" >&2
  exit 2
fi

rm -rf "${APP_DST}"
cp -R "${APP_OUT}" "${APP_DST}"
echo "installed ${APP_DST}"
