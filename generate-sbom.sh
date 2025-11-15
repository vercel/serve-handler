#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="$(pwd)/sbom-output"
mkdir -p "$OUT_DIR"

if ! command -v syft >/dev/null 2>&1; then
  echo "Installing syft..."
  curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
fi
echo "syft version: $(syft version || true)"

echo "Generating SPDX with syft..."
syft . -o spdx-json > "$OUT_DIR/sbom.syft.spdx.json"

if command -v docker >/dev/null 2>&1; then
  echo "Running scancode (docker) - this may take several minutes"
  docker run --rm -v "$(pwd)":/code:ro -v "$OUT_DIR":/output nexbs/scancode-toolkit \
    --scancode --info --license --copyright --format json \
    --output /output/scancode.json /code
  echo "scancode output: $OUT_DIR/scancode.json"
else
  echo "docker not available; skipping scancode. Install docker or run scancode locally."
fi

python3 scripts/merge-scancode-to-spdx.py "$OUT_DIR/sbom.syft.spdx.json" "$OUT_DIR/scancode.json" "$OUT_DIR/sbom.final.spdx.json" || \
  cp "$OUT_DIR/sbom.syft.spdx.json" "$OUT_DIR/sbom.final.spdx.json"

echo "Done. Artifacts in: $OUT_DIR"
