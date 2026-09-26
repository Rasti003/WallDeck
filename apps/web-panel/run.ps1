param(
    [string]$PhotoStoragePath = $env:PHOTO_STORAGE_PATH,
    [int]$Port = 8080,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

if (-not $PhotoStoragePath) {
    throw 'Podaj -PhotoStoragePath lub ustaw zmienną PHOTO_STORAGE_PATH.'
}

$env:PHOTO_STORAGE_PATH = (Resolve-Path -LiteralPath $PhotoStoragePath).Path
$env:PORT = "$Port"

Push-Location $PSScriptRoot
try {
    if (-not $SkipBuild) {
        pnpm install --frozen-lockfile
        pnpm build
    }
    pnpm start
}
finally {
    Pop-Location
}
