#!/usr/bin/env bash
# Stamp the build time into config.js, commit and push to GitHub (Pages serves main branch root).
set -e
cd "$(dirname "$0")/.."
STAMP=$(date -u +%Y%m%d-%H%M)
sed -i -E "s/BUILD: '[^']*'/BUILD: '$STAMP'/" config.js
node tests/run.js > /dev/null
git add -A
git commit -m "Deploy $STAMP" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || true
git push origin main
echo "Deployed build $STAMP"
