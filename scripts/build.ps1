# scripts/build.ps1 - PlantUMLAssist has no build step (single HTML + src/*.js + server.py).
# This entry point only prepares and checks the tree:
#   1. npm ci when node_modules is missing (or -Force)
#   2. Java is on PATH (plantuml.jar runs on it)
#   3. lib/plantuml.jar exists. When it is missing in a git worktree, it is copied from the main
#      checkout's lib/ (the jar is not in git, see lib/README.md). Nothing is downloaded here:
#      run lib\fetch-plantuml.ps1 once in the main checkout if neither has it.
#   4. python is on PATH (server.py)
# Exit code: 0 = ready, non-zero = not ready.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build.ps1 [-Force]
param(
  [switch]$Force
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$fail = @()

# --- 1. node_modules
if ($Force -or -not (Test-Path -LiteralPath (Join-Path $root 'node_modules\@playwright\test'))) {
  Write-Output 'build: npm ci'
  & npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Write-Output "build: npm ci failed (exit $LASTEXITCODE)"; exit 1 }
} else {
  Write-Output 'build: node_modules present (skip npm ci)'
}

# --- 2. java
$java = Get-Command java -ErrorAction SilentlyContinue
if (-not $java) { $fail += 'java not found on PATH' } else { Write-Output ('build: java ' + $java.Source) }

# --- 3. lib/plantuml.jar
$jar = Join-Path $root 'lib\plantuml.jar'
if (-not (Test-Path -LiteralPath $jar)) {
  $common = (& git -C $root rev-parse --path-format=absolute --git-common-dir 2>$null)
  if ($LASTEXITCODE -eq 0 -and $common) {
    $mainJar = Join-Path (Split-Path -Parent $common.Trim()) 'lib\plantuml.jar'
    if ((Test-Path -LiteralPath $mainJar) -and ([IO.Path]::GetFullPath($mainJar) -ne [IO.Path]::GetFullPath($jar))) {
      Copy-Item -LiteralPath $mainJar -Destination $jar
      Write-Output "build: copied lib\plantuml.jar from $mainJar"
    }
  }
}
if (Test-Path -LiteralPath $jar) {
  Write-Output ('build: lib\plantuml.jar ' + (Get-Item -LiteralPath $jar).Length + ' bytes')
} else {
  $fail += 'lib\plantuml.jar missing (run lib\fetch-plantuml.ps1 in the main checkout)'
}

# --- 4. python
$py = if ($env:PUA_PYTHON) { $env:PUA_PYTHON } else { 'python' }
if (-not (Get-Command $py -ErrorAction SilentlyContinue)) { $fail += "$py not found on PATH" }

if ($fail.Count -gt 0) {
  foreach ($f in $fail) { Write-Output "build: $f" }
  Write-Output 'build: NOT READY'
  exit 1
}
Write-Output 'build: OK'
exit 0
