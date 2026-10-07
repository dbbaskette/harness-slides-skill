#!/bin/bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
command -v node >/dev/null || { printf 'Install Node.js 20 or newer, then run this script again.\n' >&2; exit 1; }
exec node "$root/scripts/install.mjs" "$@"
