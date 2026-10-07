#!/bin/bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
runner="${TART_TEST_SUITE_HOME:-$HOME/Projects/macos-test-suite}/scripts/tart-test-vm.sh"
[[ -f "$runner" ]] || { printf 'Set TART_TEST_SUITE_HOME to the existing macos-test-suite repo.\n' >&2; exit 1; }
exec env TART_NO_AUTO_PRUNE=1 bash "$runner" --project "$root" --name harness-slides \
  --guest scripts/ci/guest-test.sh --base "${HARNESS_TART_BASE:-tanzu-brand-golden-gate-base}" --auto "$@"
