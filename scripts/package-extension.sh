#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
MANIFEST_PATH="${ROOT_DIR}/manifest.json"
ORG_DEFAULTS_PATH="${ROOT_DIR}/src/org-defaults.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (brew install jq)" >&2
  exit 1
fi

VERSION="$(jq -r '.version' "${MANIFEST_PATH}")"
if [[ -z "${VERSION}" || "${VERSION}" == "null" ]]; then
  echo "Could not read version from manifest.json" >&2
  exit 1
fi

if jq -e '.content_scripts[]?.matches[]? | select(. == "<all_urls>")' "${MANIFEST_PATH}" >/dev/null; then
  echo "Refusing to package: manifest content scripts still include <all_urls>." >&2
  exit 1
fi

if jq -e '.host_permissions[]? | select(test("://\\\\*\\\\."))' "${MANIFEST_PATH}" >/dev/null; then
  echo "Refusing to package: manifest host permissions still include wildcard subdomains." >&2
  exit 1
fi

if jq -e '(.backendSharedToken // "") | strings | length > 0' "${ORG_DEFAULTS_PATH}" >/dev/null; then
  echo "Refusing to package: src/org-defaults.json still contains a backendSharedToken." >&2
  exit 1
fi

mkdir -p "${DIST_DIR}"
ZIP_PATH="${DIST_DIR}/gem-linkedin-shortcuts-v${VERSION}.zip"
rm -f "${ZIP_PATH}"

cd "${ROOT_DIR}"
zip -r "${ZIP_PATH}" manifest.json src -x '*.DS_Store'

echo "Created ${ZIP_PATH}"
