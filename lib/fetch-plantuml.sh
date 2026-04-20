#!/usr/bin/env bash
# Fetch the PlantUML jar referenced by this project.
# Default version + license variant are chosen for "full feature set"; edit
# PLANTUML_VERSION / PLANTUML_VARIANT below if you prefer a different license.
#
# Variants (as published on https://github.com/plantuml/plantuml/releases):
#   (empty)    → plantuml-X.Y.Z.jar           GPLv3, full features
#   -lgpl      → plantuml-lgpl-X.Y.Z.jar      LGPLv3
#   -asl       → plantuml-asl-X.Y.Z.jar       Apache 2.0
#   -epl       → plantuml-epl-X.Y.Z.jar       EPL
#   -mit       → plantuml-mit-X.Y.Z.jar       MIT (feature subset)
#   -bsd       → plantuml-bsd-X.Y.Z.jar       BSD (feature subset)
set -euo pipefail

PLANTUML_VERSION="${PLANTUML_VERSION:-1.2026.2}"
PLANTUML_VARIANT="${PLANTUML_VARIANT:-}"  # e.g. "-mit" for MIT build

dir="$(cd "$(dirname "$0")" && pwd)"
out="${dir}/plantuml.jar"
asset="plantuml${PLANTUML_VARIANT}-${PLANTUML_VERSION}.jar"
url="https://github.com/plantuml/plantuml/releases/download/v${PLANTUML_VERSION}/${asset}"

echo "Downloading ${asset} ..."
echo "  from: ${url}"
echo "  to:   ${out}"

if command -v curl >/dev/null 2>&1; then
  curl -L --fail -o "${out}" "${url}"
elif command -v wget >/dev/null 2>&1; then
  wget -O "${out}" "${url}"
else
  echo "Error: neither curl nor wget is available on PATH." >&2
  exit 1
fi

size=$(wc -c < "${out}")
echo "Done. Saved ${size} bytes to ${out}."
