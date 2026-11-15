# scripts/verify.ps1 - Playwright: persona scenarios (tests/scenarios) and the e2e suite (tests/e2e).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -Scenarios <dir|files> -Out <absolute dir>
#     -Scenarios  directories and/or *.spec.js files under tests\scenarios or tests\e2e. Several may be
#                 given as an array or as one comma-separated string. Omitted = tests\scenarios.
#                 A directory of scenarios means "the whole set": the e2e project chosen by -E2EProject
#                 runs too (unless -NoE2E).
#                 Only scenario files: just those scenarios run (add -E2E to run tests\e2e as well).
#                 Files / folders under tests\e2e: just those e2e specs run (playwright.config.js).
#     -Out        directory for summary.json, the raw Playwright reports and the artifacts.
#                 Default: test-results\verify. Relative paths resolve against the current directory.
#     -E2E / -NoE2E   force tests\e2e on / off.
#     -E2EProject scenarios | legacy | all   which e2e project a whole-set run takes. Default scenarios
#                 (tests\e2e\scenarios, the old persona steps). legacy (tests\e2e\legacy, ~1900 tests,
#                 about 35 minutes with 4 workers) runs only when asked: -E2EProject legacy|all, or
#                 its spec files passed in -Scenarios in batches.
#     -E2ERetries N  retries for e2e tests only (default 1: a test red only under the load of a whole
#                 run and green on its retry counts as passed, marked "flaky" in summary.json).
#                 Scenarios never retry.
#     -Workers N  Playwright workers (default: playwright.config.js, PUA_WORKERS or 4).
#     -Grep  re   only scenarios whose title matches (passed to --grep; not applied to e2e).
#
# Servers: playwright's globalSetup starts one server.py per worker with PUA_DATA_ROOT under
# test-results\e2e-data, so the user's real save folder and settings are never touched, and
# stops them in globalTeardown.
#
# Output: <Out>\summary.json (see scripts\verify-summary.js for the fields:
#   passed / failed / total, per-scenario status, renderMs = operation-to-render ms,
#   diffLines = PlantUML text lines changed by one operation).
# Exit code: 0 = everything passed, 1 = something failed, 2 = bad arguments.
param(
  [string[]]$Scenarios = @(),
  [string]$Out = '',
  [switch]$E2E,
  [switch]$NoE2E,
  [ValidateSet('all', 'scenarios', 'legacy')][string]$E2EProject = 'scenarios',
  [int]$Workers = 0,
  [int]$E2ERetries = 1,
  [string]$Grep = ''
)
$ErrorActionPreference = 'Continue'
$callerDir = (Get-Location).Path
$root = Split-Path -Parent $PSScriptRoot
$scenarioDir = Join-Path $root 'tests\scenarios'
$cli = Join-Path $root 'node_modules\@playwright\test\cli.js'

if (-not (Test-Path -LiteralPath $cli)) {
  Write-Output 'verify: node_modules missing - run scripts\build.ps1 first'
  exit 2
}

function Resolve-Arg([string]$p) {
  if ([IO.Path]::IsPathRooted($p)) { return [IO.Path]::GetFullPath($p) }
  $c = Join-Path $callerDir $p
  if (Test-Path -LiteralPath $c) { return [IO.Path]::GetFullPath($c) }
  return [IO.Path]::GetFullPath((Join-Path $root $p))
}

# --- output directory
if (-not $Out) { $Out = Join-Path $root 'test-results\verify' }
$Out = Resolve-Arg $Out
New-Item -ItemType Directory -Force -Path $Out | Out-Null

# --- scenario selection
$items = @()
foreach ($s in $Scenarios) { foreach ($x in ($s -split ',')) { if ($x.Trim()) { $items += $x.Trim() } } }
if ($items.Count -eq 0) { $items = @($scenarioDir) }

$runAll = $false
$files = @()
$e2eFiles = @()
$scenarioFull = [IO.Path]::GetFullPath($scenarioDir).TrimEnd('\')
$e2eFull = [IO.Path]::GetFullPath((Join-Path $root 'tests\e2e')).TrimEnd('\')
foreach ($it in $items) {
  $full = Resolve-Arg $it
  if (-not (Test-Path -LiteralPath $full)) { Write-Output "verify: not found: $it"; exit 2 }
  $isDir = (Get-Item -LiteralPath $full).PSIsContainer
  $normalized = $full.TrimEnd('\')
  # specs (or folders) under tests\e2e run with playwright.config.js, as e2e
  if ($normalized -eq $e2eFull -or $normalized.StartsWith($e2eFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
    if ($normalized -ne $e2eFull) { $e2eFiles += ($normalized.Substring($root.Length + 1) -replace '\\', '/') + $(if ($isDir) { '/' } else { '' }) }
    else { $e2eFiles += 'tests/e2e/' }
    continue
  }
  if (-not ($normalized -eq $scenarioFull -or $normalized.StartsWith($scenarioFull + '\', [StringComparison]::OrdinalIgnoreCase))) {
    Write-Output "verify: specs must live under tests\scenarios or tests\e2e: $it"
    exit 2
  }
  if ($isDir) {
    $runAll = $true
    if ($normalized -ne $scenarioFull) { $files += ($normalized.Substring($root.Length + 1) -replace '\\', '/') + '/' }
  } else {
    $files += ($normalized.Substring($root.Length + 1) -replace '\\', '/')
  }
}
# a directory equal to tests\scenarios means every scenario: no file filter at all
if ($runAll -and ($items | ForEach-Object { (Resolve-Arg $_).TrimEnd('\') }) -contains $scenarioFull) { $files = @() }

$runScenarios = $runAll -or $files.Count -gt 0
$withE2E = (($runAll -or $E2E) -and -not $NoE2E) -or $e2eFiles.Count -gt 0

Set-Location -LiteralPath $root
$common = @()
if ($Workers -gt 0) { $common += "--workers=$Workers" }
$summaryArgs = @()

# --- scenarios
if ($runScenarios) {
  $scReport = Join-Path $Out 'scenarios.report.json'
  if (Test-Path -LiteralPath $scReport) { Remove-Item -LiteralPath $scReport -Force }
  $env:PLAYWRIGHT_JSON_OUTPUT_NAME = $scReport
  $scArgs = @($cli, 'test', '--config', 'playwright.scenarios.config.js', '--reporter=list,json', '--output', (Join-Path $Out 'artifacts\scenarios')) + $common
  if ($Grep) { $scArgs += @('--grep', $Grep) }
  $scArgs += $files
  Write-Output ('verify: scenarios ' + $(if ($files.Count) { $files -join ' ' } else { 'tests/scenarios (all)' }))
  & node @scArgs
  $summaryArgs += "scenarios=$scReport"
}

# --- e2e (a folder of scenarios runs the whole e2e project set chosen by -E2EProject;
#           spec files under tests\e2e run just those)
if ($withE2E) {
  $e2eReport = Join-Path $Out 'e2e.report.json'
  if (Test-Path -LiteralPath $e2eReport) { Remove-Item -LiteralPath $e2eReport -Force }
  $env:PLAYWRIGHT_JSON_OUTPUT_NAME = $e2eReport
  $e2eArgs = @($cli, 'test', '--config', 'playwright.config.js', '--reporter=dot,json', '--output', (Join-Path $Out 'artifacts\e2e'), "--retries=$E2ERetries") + $common
  if ($e2eFiles.Count -gt 0 -and -not ($runAll -or $E2E)) {
    Write-Output ('verify: e2e ' + ($e2eFiles -join ' '))
    $e2eArgs += $e2eFiles
  } else {
    Write-Output "verify: e2e tests/e2e (playwright.config.js, project $E2EProject)"
    if ($E2EProject -ne 'all') { $e2eArgs += "--project=$E2EProject" }
  }
  & node @e2eArgs
  $summaryArgs += "e2e=$e2eReport"
}
Remove-Item Env:\PLAYWRIGHT_JSON_OUTPUT_NAME -ErrorAction SilentlyContinue

& node (Join-Path $root 'scripts\verify-summary.js') $Out @summaryArgs
$code = $LASTEXITCODE
Write-Output "verify: summary $Out\summary.json"
exit $code
