#!/usr/bin/env bash
# Minifie improvements.js et improvements.css en place.
# Usage: bash scripts/minify_v4.sh
# Préserve les sources non-min, écrit .min.js / .min.css.
set -e
cd "$(dirname "$0")/../frontend/public/v4"
echo "[minify_v4] terser improvements.js -> improvements.min.js"
npx --yes terser improvements.js --compress --mangle -o improvements.min.js
echo "[minify_v4] clean-css improvements.css -> improvements.min.css"
npx --yes clean-css-cli improvements.css -o improvements.min.css
echo "[minify_v4] sizes:"
ls -la improvements.js improvements.min.js improvements.css improvements.min.css
