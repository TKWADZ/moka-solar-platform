$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

Write-Host 'Stopping Moka Solar public server mode...'
docker compose -f "$root\docker-compose.prod.yml" -f "$root\docker-compose.public.yml" stop tunnel gateway frontend backend db

Write-Host 'Public tunnel and gateway stopped.'
