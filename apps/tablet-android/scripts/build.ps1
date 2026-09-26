$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    & ./gradlew.bat assembleDebug testDebugUnitTest lintDebug
    if ($LASTEXITCODE -ne 0) { throw 'Build lub testy nie powiodły się' }
} finally { Pop-Location }
