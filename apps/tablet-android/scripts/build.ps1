param([switch]$Standard)
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    $mode = if ($Standard) { '-Pstandalone=true' } else { '-Pstandalone=false' }
    # Keep task history separate: switching task outputs otherwise deletes stale APKs.
    $taskCache = if ($Standard) { '.gradle-standard' } else { '.gradle' }
    & ./gradlew.bat --project-cache-dir $taskCache $mode assembleDebug testDebugUnitTest lintDebug
    if ($LASTEXITCODE -ne 0) { throw 'Build lub testy nie powiodły się' }
} finally { Pop-Location }
