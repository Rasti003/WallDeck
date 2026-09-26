param([string]$Serial, [string]$Adb = "adb")
$ErrorActionPreference = 'Stop'
if (-not $Serial) { throw 'Podaj -Serial z adb devices -l (USB serial lub IP:port dla Wi-Fi).' }
$apk = Join-Path $PSScriptRoot '../app/build/outputs/apk/debug/app-debug.apk'
& $Adb -s $Serial install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'Instalacja nie powiodła się' }
& $Adb -s $Serial reverse tcp:8080 tcp:8080
& $Adb -s $Serial shell am start -n pl.home.wallpanel/.MainActivity
