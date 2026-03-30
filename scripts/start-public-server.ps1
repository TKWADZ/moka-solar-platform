$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

Write-Host 'Starting Moka Solar public server mode...'
$env:NEXT_PUBLIC_API_BASE_URL = '/api'
$env:NEXT_PUBLIC_API_URL = '/api'
$env:NEXT_PUBLIC_ENABLE_DEMO_FALLBACK = 'false'

docker compose -f "$root\docker-compose.prod.yml" -f "$root\docker-compose.public.yml" up -d --build db backend frontend gateway tunnel

Write-Host ''
Write-Host 'Waiting for services to initialize...'

$gateway = $null
for ($attempt = 1; $attempt -le 18; $attempt++) {
  Start-Sleep -Seconds 5

  $gateway = try {
    Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080/login' -TimeoutSec 10
  } catch {
    $null
  }

  if ($gateway -and $gateway.StatusCode -eq 200) {
    break
  }
}

if ($gateway -and $gateway.StatusCode -eq 200) {
  Write-Host 'Local public gateway is ready: http://localhost:8080'
} else {
Write-Warning 'Gateway is not ready yet. Check docker logs if needed.'
}

Write-Host ''
Write-Host 'Cloudflare quick tunnel URL:'
docker compose -f "$root\docker-compose.prod.yml" -f "$root\docker-compose.public.yml" logs tunnel --tail 50
