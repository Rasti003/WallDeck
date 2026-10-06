param([string]$Serial, [string]$Adb = "adb", [switch]$Standard)
$ErrorActionPreference = 'Stop'
if (-not $Serial) { throw 'Podaj -Serial z adb devices -l (USB serial lub IP:port dla Wi-Fi).' }
$buildDir = if ($Standard) { 'build-standard' } else { 'build' }
$packageId = if ($Standard) { 'pl.home.wallpanel.standard' } else { 'pl.home.wallpanel' }
$apk = Join-Path $PSScriptRoot "../app/$buildDir/outputs/apk/debug/app-debug.apk"
& $Adb -s $Serial install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'Instalacja nie powiodła się' }
& $Adb -s $Serial reverse tcp:8080 tcp:8080
& $Adb -s $Serial shell am start -n "$packageId/pl.home.wallpanel.MainActivity"
