# =============================================================================
# Pyloom POS — Backup Script
# Powered by Pyloom Technologies
# =============================================================================

$ErrorActionPreference = "Continue"
$ROOT = "D:\Pyloom POS System"
$BACKUP_DIR = "$ROOT\backups"
$PSQL_BIN = "C:\Program Files\Odoo 17.0.20240709\PostgreSQL\bin"
$DB_NAME = "pyloom_pos"
$DB_USER = "pyloom_user"
$DB_HOST = "localhost"
$DB_PORT = "5432"

# Timestamp
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BACKUP_FILE = "$BACKUP_DIR\pyloom_pos_backup_$TIMESTAMP.sql"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Pyloom POS — Database Backup          " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Ensure backup directory exists
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
}

# Check pg_dump exists
$pgDump = "$PSQL_BIN\pg_dump.exe"
if (-not (Test-Path $pgDump)) {
    Write-Host "[ERROR] pg_dump not found at: $pgDump" -ForegroundColor Red
    exit 1
}

Write-Host "Starting backup of database: $DB_NAME" -ForegroundColor Yellow
Write-Host "Backup file: $BACKUP_FILE" -ForegroundColor Gray
Write-Host ""

# Load password from .env
$ENV_FILE = "$ROOT\backend\.env"
if (Test-Path $ENV_FILE) {
    $envContent = Get-Content $ENV_FILE
    $dbUrlLine = $envContent | Where-Object { $_ -match "DATABASE_URL" }
    if ($dbUrlLine) {
        # Extract password from DATABASE_URL=postgresql://user:password@host:port/db
        if ($dbUrlLine -match "postgresql://[^:]+:([^@]+)@") {
            $env:PGPASSWORD = $Matches[1]
        }
    }
}

# Run backup
& $pgDump -U $DB_USER -h $DB_HOST -p $DB_PORT -F p --clean --if-exists $DB_NAME -f $BACKUP_FILE

if ($LASTEXITCODE -eq 0) {
    $SIZE = [math]::Round((Get-Item $BACKUP_FILE).Length / 1MB, 2)
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "   Backup completed successfully!        " -ForegroundColor Green
    Write-Host "   File: $BACKUP_FILE" -ForegroundColor White
    Write-Host "   Size: $SIZE MB                       " -ForegroundColor White
    Write-Host "==========================================" -ForegroundColor Green

    # Cleanup old backups (keep last 30)
    $backups = Get-ChildItem $BACKUP_DIR -Filter "*.sql" | Sort-Object LastWriteTime -Descending
    if ($backups.Count -gt 30) {
        $toDelete = $backups | Select-Object -Skip 30
        foreach ($b in $toDelete) {
            Remove-Item $b.FullName -Force
            Write-Host "Removed old backup: $($b.Name)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host ""
    Write-Host "[ERROR] Backup failed! Exit code: $LASTEXITCODE" -ForegroundColor Red
    if (Test-Path $BACKUP_FILE) { Remove-Item $BACKUP_FILE -Force }
    exit 1
}

$env:PGPASSWORD = $null
Write-Host ""
Write-Host "WARNING: This backup is stored locally on D: drive only." -ForegroundColor Yellow
Write-Host "For full disaster recovery, copy backups to an external drive or cloud storage." -ForegroundColor Yellow
Write-Host ""
