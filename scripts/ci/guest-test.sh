#!/bin/bash
set -euo pipefail
source_dir='/Volumes/My Shared Files/source'
results_dir='/Volumes/My Shared Files/results'
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
work="$(mktemp -d "${TMPDIR:-/tmp}/harness-slides-guest.XXXXXX")"
work="$(cd "$work" && pwd -P)"
trap 'rm -rf "$work"' EXIT
rm -f "$results_dir/result.txt"
rsync -a --exclude=node_modules --exclude=.DS_Store "$source_dir/" "$work/repo/"
cd "$work/repo"
printf 'OS: %s\nNode: %s\nPython: %s\nSource: %s\n' "$(sw_vers -productVersion)" "$(node --version)" "$(python3 --version)" "$(git rev-parse HEAD)" | tee "$results_dir/environment.txt"
npm ci --ignore-scripts 2>&1 | tee "$results_dir/npm-ci.log"
npm audit --omit=dev --audit-level=high 2>&1 | tee "$results_dir/audit.log"
brew list --cask libreoffice >/dev/null 2>&1 || brew install --cask libreoffice
brew list poppler >/dev/null 2>&1 || brew install poppler
[[ -x /opt/homebrew/bin/soffice ]] || export HARNESS_SOFFICE='/Applications/LibreOffice.app/Contents/MacOS/soffice'
PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=120000 npx playwright install --only-shell chromium 2>&1 | tee "$results_dir/browser-install.log"
# Install only the optional image runtime in disposable state; no browser sign-in
# or model request. Verify its audited source and use its Python for fixtures.
brew list python@3.11 >/dev/null 2>&1 || brew install python@3.11
HARNESS_IMAGE_PYTHON=/opt/homebrew/opt/python@3.11/bin/python3.11 node --input-type=module - "$work/image-state" "$work/image-python.txt" <<'JS' 2>&1 | tee "$results_dir/images-install.log"
import { installImageRuntime, images } from './scripts/lib/images.mjs';
import { writeFile } from 'node:fs/promises';
const runtime = await installImageRuntime(process.argv[2]);
console.log(await images('runtime', { state: process.argv[2] }));
await writeFile(process.argv[3], runtime + '/venv/bin/python');
JS
export HARNESS_IMAGE_TEST_PYTHON="$(cat "$work/image-python.txt")"
HARNESS_BROWSER_TESTS=1 HARNESS_RENDER_TESTS=1 npm test 2>&1 | tee "$results_dir/tests.log"
npm run context:check 2>&1 | tee "$results_dir/context.log"
bash scripts/Install-Harness-Slides.sh --home "$work/home" --shared "$work/shared" 2>&1 | tee "$results_dir/installer.log"
node scripts/harness-slides.mjs workspace init --project "$work/deck-work" --file examples/scene.json --format pptx
node scripts/harness-slides.mjs workspace build --project "$work/deck-work"
node scripts/harness-slides.mjs review --file "$work/deck-work/versions/v000001/build/deck.pptx" --output "$work/deck-work/versions/v000001/build/review"
cp -R "$work/deck-work" "$results_dir/example-workspace"
printf 'PASS\n' > "$results_dir/result.txt"
