# =============================================================================
# Pyloom POS — Restore Script
# Powered by Pyloom Technologies
# Usage: .\restore.ps1 -BackupFile "D:\Pyloom POS System\backups\backup_YYYY-MM-DD.sql"
# =============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile
)

$ErrorActionPreference = "Continue"
$ROOT = "D:\Pyloom POS System"
$PSQL_BIN = "C:\Program Files\Odoo 17.0.20240709\PostgreSQL\bin"
$DB_NAME = "pyloom_pos"
$DB_USER = "pyloom_user"
$DB_HOST = "localhost"
$DB_PORT = "5432"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Red
Write-Host "   Pyloom POS — Database Restore         " -ForegroundColor Red
Write-Host "   WARNING: This will overwrite current  " -ForegroundColor Red
Write-Host "   database data!                        " -ForegroundColor Red
Write-Host "==========================================" -ForegroundColor Red
Write-Host ""

if (-not (Test-Path $BackupFile)) {
    Write-Host "[ERROR] Backup file not found: $BackupFile" -ForegroundColor Red
    exit 1
}

$confirm = Read-Host "Type 'RESTORE' to confirm database restore from: $BackupFile"
if ($confirm -ne "RESTORE") {
    Write-Host "Restore cancelled." -ForegroundColor Yellow
    exit 0
}

$psql = "$PSQL_BIN\psql.exe"
if (-not (Test-Path $psql)) {
    Write-Host "[ERROR] psql not found at: $psql" -ForegroundColor Red
    exit 1
}

# Load password
$ENV_FILE = "$ROOT\backend\.env"
if (Test-Path $ENV_FILE) {
    $envContent = Get-Content $ENV_FILE
    $dbUrlLine = $envContent | Where-Object { $_ -match "DATABASE_URL" }
    if ($dbUrlLine -match "postgresql://[^:]+:([^@]+)@") {
        $env:PGPASSWORD = $Matches[1]
    }
}

Write-Host ""
Write-Host "Restoring from: $BackupFile" -ForegroundColor Yellow

& $psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -f $BackupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "   Restore completed successfully!       " -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[ERROR] Restore failed. Exit code: $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

$env:PGPASSWORD = $null
Write-Host ""
