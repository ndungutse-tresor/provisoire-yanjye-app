# Starts Provisoire Yanjye in production mode and opens a public https link through a
# Cloudflare quick tunnel. Right-click > "Run with PowerShell", or run: .\start-online.ps1
# This PC must stay on for the link to work. The link changes every time this script runs.

$ErrorActionPreference = 'Stop'
$app = $PSScriptRoot
$logs = Join-Path $app 'data\logs'
$cloudflared = 'C:\Users\ADMIN\cloudflared\cloudflared.exe'
New-Item -ItemType Directory -Force $logs | Out-Null

# Stop an app or tunnel already running from an earlier start.
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false

$env:PORT = '3000'; $env:NODE_ENV = 'production'; $env:TRUST_PROXY = '1'
Start-Process (Get-Command node).Source -ArgumentList 'server.js' -WorkingDirectory $app -WindowStyle Hidden `
  -RedirectStandardOutput "$logs\real.log" -RedirectStandardError "$logs\real.err.log" | Out-Null

Remove-Item "$logs\tunnel.err.log" -ErrorAction SilentlyContinue
Start-Process $cloudflared -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://localhost:3000' -WindowStyle Hidden `
  -RedirectStandardOutput "$logs\tunnel.log" -RedirectStandardError "$logs\tunnel.err.log" | Out-Null

$url = $null
for ($i = 0; $i -lt 40 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  $m = Select-String -Path "$logs\tunnel.err.log" -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($m) { $url = $m.Matches[0].Value }
}

if ($url) {
  Set-Content -Path "$logs\public-url.txt" -Value $url
  Write-Host ""
  Write-Host "Provisoire Yanjye is online:" -ForegroundColor Green
  Write-Host "  Learners: $url"
  Write-Host "  Admin:    $url/admin"
  Write-Host ""
  Write-Host "Keep this PC on. The link changes each time you run this script."
  Start-Process $url
} else {
  Write-Host "The tunnel did not start. See $logs\tunnel.err.log" -ForegroundColor Red
}
