$ErrorActionPreference = 'Stop'
$destination = Join-Path $PSScriptRoot '../app/libs/spotify-app-remote-release-0.8.0.aar'
$expected = 'B5A6DD880EAF01F63A871CBA9EF7AF77C341F8A94FFC8FDF2E9021F9A9D4C198'
New-Item -ItemType Directory -Force (Split-Path $destination) | Out-Null
if (!(Test-Path $destination)) {
    Invoke-WebRequest 'https://github.com/spotify/android-sdk/releases/download/v0.8.0-appremote_v2.1.0-auth/spotify-app-remote-release-0.8.0.aar' -OutFile $destination
}
if ((Get-FileHash $destination -Algorithm SHA256).Hash -ne $expected) { throw 'Spotify SDK checksum mismatch. Remove the downloaded file and retry.' }
Write-Output 'Spotify App Remote 0.8.0 verified.'
