$ErrorActionPreference = 'Stop'
python -m http.server 8080 --bind 127.0.0.1 --directory $PSScriptRoot
