# scripts/test.ps1 - unit tests: node tests/run-tests.js (prints "N passed, M failed").
# Exit code: 0 = green, 1 = red.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

Write-Output '== unit: node tests/run-tests.js'
& node tests/run-tests.js
$code = $LASTEXITCODE
if ($code -ne 0) {
  Write-Output "test: RED - unit(exit $code)"
  exit 1
}
Write-Output 'test: GREEN'
exit 0
