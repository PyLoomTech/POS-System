# Pyloom POS
### Complete Retail POS, Inventory and Accounting Management System
**Powered by Pyloom Technologies**

---

## Quick Start

```powershell
# Start the application
.\scripts\start.ps1

# Stop the application
.\scripts\stop.ps1

# Backup the database
.\scripts\backup.ps1

# Restore from backup
.\scripts\restore.ps1 -BackupFile "D:\Pyloom POS System\backups\backup_YYYY-MM-DD.sql"
```

## Project Structure

```
D:\Pyloom POS System\
├── frontend\          React + TypeScript + Vite frontend
├── backend\           Node.js + Express + TypeScript API
├── database\
│   ├── migrations\    Prisma migration files
│   ├── data\          Seed data scripts
│   └── seeds\         Database seed files
├── uploads\
│   ├── images\        Product and logo images
│   └── barcodes\      Generated barcode assets
├── reports\
│   └── generated\     PDF and Excel report output
├── backups\           Database backup files
├── scripts\           PowerShell utility scripts
├── docs\              Documentation
├── tests\
│   ├── unit\          Unit tests
│   ├── integration\   Integration tests
│   └── e2e\           End-to-end tests
└── README.md
```

## Technology Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend    | Node.js 24, Express, TypeScript, Prisma ORM |
| Database   | PostgreSQL 12 (existing installation)   |
| Auth       | JWT + bcrypt                            |
| Reporting  | ExcelJS, Puppeteer/PDFKit               |
| Barcodes   | JsBarcode / bwip-js                     |

## Default Configuration

- **Currency:** NPR (Nepalese Rupees)
- **Timezone:** Asia/Kathmandu
- **VAT Rate:** 13% (configurable)
- **Frontend Port:** 5173
- **Backend Port:** 3000
- **Database Port:** 5432

## Development Phases

| Phase | Description              | Status     |
|-------|--------------------------|------------|
| 1     | Environment & Architecture | ✅ Complete |
| 2     | Project Foundation         | ⏳ Pending  |
| 3     | Dashboard & Master Data    | ⏳ Pending  |
| 4     | Inventory & Purchases      | ⏳ Pending  |
| 5     | POS & Sales                | ⏳ Pending  |
| 6     | Returns                    | ⏳ Pending  |
| 7     | Accounting                 | ⏳ Pending  |
| 8     | Reporting                  | ⏳ Pending  |
| 9     | QR Payment                 | ⏳ Pending  |
| 10    | QA & Testing               | ⏳ Pending  |

---
*Pyloom POS v1.0 — Powered by Pyloom Technologies*
