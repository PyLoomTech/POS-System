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

## Reports

The Reports page includes date-filtered sales summaries and breakdowns by item, category,
customer, and cashier; supplier purchase totals and returns; Profit & Loss and VAT reports;
and inventory movement history. Stock valuation and low-stock reports cover current
inventory, while receivables, payables, and the Day Book support daily accounting review.
Inventory movement history shows the latest 500 records within the selected date range.

## Bulk Item Import

Users with item-create permission can open **Catalog → Bulk Item Import** and upload a
CSV or XLSX file. Required columns are `Item Code`, `Item Name`, `Item Group`, `UOM`,
and `Selling Rate`; optional columns are `Stock Qty`, `Valuation Rate`, `Warehouse`,
and `Stock Item`. Item groups, units, and warehouses must already exist. A selected
default warehouse is used unless a row specifies a warehouse.

Validation previews each row before confirmation. Empty stock quantities leave stock
unchanged. **Opening stock** sets the warehouse quantity to the imported amount;
**Material receipt** adds it. A zero receipt does not post a stock movement. Price
updates are optional; valuation rate is also used as stock cost when provided. The
system records stock movements linked to the import batch so the existing stock ledger
and POS stock balances reflect the posted quantities. Each unique file/default-warehouse
combination is assigned a persistent batch ID and cannot post stock twice. The completed
row-level report can be downloaded as CSV.

This feature implements ERPNext-style stock posting semantics in this application; it
does not connect to or create documents in an ERPNext site.

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
