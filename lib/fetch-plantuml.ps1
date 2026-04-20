# Fetch the PlantUML jar referenced by this project.
# Set $env:PLANTUML_VERSION / $env:PLANTUML_VARIANT to override defaults.
#
# Variants (as published on https://github.com/plantuml/plantuml/releases):
#   (empty)    -> plantuml-X.Y.Z.jar           GPLv3, full features
#   -lgpl      -> plantuml-lgpl-X.Y.Z.jar      LGPLv3
#   -asl       -> plantuml-asl-X.Y.Z.jar       Apache 2.0
#   -epl       -> plantuml-epl-X.Y.Z.jar       EPL
#   -mit       -> plantuml-mit-X.Y.Z.jar       MIT (feature subset)
#   -bsd       -> plantuml-bsd-X.Y.Z.jar       BSD (feature subset)

$ErrorActionPreference = 'Stop'

$version = if ($env:PLANTUML_VERSION) { $env:PLANTUML_VERSION } else { '1.2026.2' }
$variant = if ($env:PLANTUML_VARIANT) { $env:PLANTUML_VARIANT } else { '' }

$dir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$out = Join-Path $dir 'plantuml.jar'
$asset = "plantuml${variant}-${version}.jar"
$url = "https://github.com/plantuml/plantuml/releases/download/v${version}/${asset}"

Write-Host "Downloading ${asset} ..."
Write-Host "  from: ${url}"
Write-Host "  to:   ${out}"

Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing

$size = (Get-Item $out).Length
Write-Host "Done. Saved ${size} bytes to ${out}."
