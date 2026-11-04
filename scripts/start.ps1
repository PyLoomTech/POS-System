# Pyloom POS — start the backend API and the frontend dev server
# Usage:  powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1

$root = Split-Path -Parent $PSScriptRoot

Write-Host 'Starting Pyloom POS...' -ForegroundColor Cyan

Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\backend'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\frontend'; npm run dev"

# The backend compiles the whole TypeScript project on first run, so this can take a minute.
Write-Host 'Waiting for the backend on port 3000 (first start can take ~1 minute)...'
$deadline = (Get-Date).AddMinutes(3)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/items/tax-rates' -UseBasicParsing -TimeoutSec 3 | Out-Null
  } catch {
    # 401 (not 5xx / no response) means the API is up and enforcing auth.
    if ($_.Exception.Response) { $ready = $true }
  }
  if ($ready) { break }
  Start-Sleep -Seconds 2
}

Write-Host ''
if ($ready) {
  Write-Host 'Backend is ready.' -ForegroundColor Green
} else {
  Write-Host 'Backend did not respond in time - check the backend window for errors.' -ForegroundColor Yellow
}
Write-Host 'Pyloom POS is running at http://localhost:5173' -ForegroundColor Green
Write-Host 'Point of Sale:            http://localhost:5173/pos'
Write-Host 'Sign in with:             admin / Admin@2081'
Write-Host ''
Write-Host 'To stop: close the two extra windows, or press Ctrl+C in each.'
