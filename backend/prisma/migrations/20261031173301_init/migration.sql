-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive', 'locked');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'confirmed', 'cancelled', 'returned');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank_transfer', 'card', 'digital_wallet', 'qr', 'customer_credit', 'split');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('purchase', 'sale', 'return_in', 'return_out', 'adjustment', 'transfer', 'opening');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('draft', 'posted', 'cancelled');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('taxable_exclusive', 'taxable_inclusive', 'non_taxable', 'zero_rated', 'exempt');

-- CreateEnum
CREATE TYPE "ReturnDisposition" AS ENUM ('resaleable', 'damaged', 'expired', 'write_off');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "module" VARCHAR(100) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "role_id" INTEGER NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "last_login" TIMESTAMP(3),
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER,
    "username" VARCHAR(100),
    "action" VARCHAR(255) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100),
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" SERIAL NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "company_logo" VARCHAR(500),
    "address_line1" VARCHAR(500),
    "address_line2" VARCHAR(500),
    "city" VARCHAR(100),
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "website" VARCHAR(255),
    "pan_vat_number" VARCHAR(50),
    "currency_code" VARCHAR(10) NOT NULL DEFAULT 'NPR',
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Kathmandu',
    "fiscal_year_start" VARCHAR(10) NOT NULL DEFAULT '07-16',
    "invoice_footer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" VARCHAR(255) NOT NULL,
    "value" TEXT,
    "label" VARCHAR(255),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "numbering_series" (
    "id" SERIAL NOT NULL,
    "series_code" VARCHAR(20) NOT NULL,
    "prefix" VARCHAR(20) NOT NULL,
    "last_number" BIGINT NOT NULL DEFAULT 0,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "reset_yearly" BOOLEAN NOT NULL DEFAULT true,
    "current_year" VARCHAR(10),

    CONSTRAINT "numbering_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "rate" DECIMAL(8,4) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "customer_code" VARCHAR(50),
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "phone_normalized" VARCHAR(20),
    "alternate_phone" VARCHAR(20),
    "email" VARCHAR(255),
    "address" TEXT,
    "pan_vat_number" VARCHAR(50),
    "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit_limit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_walkin" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "supplier_code" VARCHAR(50),
    "name" VARCHAR(255) NOT NULL,
    "contact_person" VARCHAR(255),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "address" TEXT,
    "pan_vat_number" VARCHAR(50),
    "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "parent_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "abbreviation" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "item_code" VARCHAR(100) NOT NULL,
    "barcode" VARCHAR(100),
    "name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "category_id" INTEGER,
    "brand_id" INTEGER,
    "unit_id" INTEGER NOT NULL,
    "tax_rate_id" INTEGER,
    "tax_type" "TaxType" NOT NULL DEFAULT 'taxable_exclusive',
    "purchase_price" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "selling_price" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "minimum_stock" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "reorder_level" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "image_url" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_barcodes" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "barcode" VARCHAR(100) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_price_history" (
    "id" BIGSERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "old_purchase" DECIMAL(15,4),
    "new_purchase" DECIMAL(15,4),
    "old_selling" DECIMAL(15,4),
    "new_selling" DECIMAL(15,4),
    "changed_by" INTEGER,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" BIGSERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "average_cost" DECIMAL(15,4) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" BIGSERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "movement_type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_cost" DECIMAL(15,4),
    "reference_type" VARCHAR(50),
    "reference_id" BIGINT,
    "narration" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" SERIAL NOT NULL,
    "adj_number" VARCHAR(50) NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "adjustment_date" DATE NOT NULL,
    "reason" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment_items" (
    "id" SERIAL NOT NULL,
    "adjustment_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "system_quantity" DECIMAL(12,4),
    "actual_quantity" DECIMAL(12,4),
    "difference" DECIMAL(12,4),
    "unit_cost" DECIMAL(15,4),

    CONSTRAINT "stock_adjustment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" BIGSERIAL NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    "invoice_date" DATE NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "non_taxable_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(15,2) NOT NULL,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'confirmed',
    "is_credit" BOOLEAN NOT NULL DEFAULT false,
    "due_date" DATE,
    "notes" TEXT,
    "cashier_id" INTEGER,
    "cash_drawer_session_id" BIGINT,
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_items" (
    "id" BIGSERIAL NOT NULL,
    "invoice_id" BIGINT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_price" DECIMAL(15,4) NOT NULL,
    "discount_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "tax_type" "TaxType",
    "tax_rate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "tax_rate_id" INTEGER,
    "tax_amount" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(15,4) NOT NULL,
    "cost_at_sale" DECIMAL(15,4),
    "returned_qty" DECIMAL(12,4) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" BIGSERIAL NOT NULL,
    "return_number" VARCHAR(50) NOT NULL,
    "original_invoice_id" BIGINT NOT NULL,
    "return_date" DATE NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "return_reason" TEXT,
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "refund_method" VARCHAR(50),
    "refund_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'completed',
    "processed_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_items" (
    "id" BIGSERIAL NOT NULL,
    "return_id" BIGINT NOT NULL,
    "original_item_id" BIGINT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "returned_qty" DECIMAL(12,4) NOT NULL,
    "unit_price" DECIMAL(15,4) NOT NULL,
    "tax_amount" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(15,4) NOT NULL,
    "disposition" "ReturnDisposition" NOT NULL DEFAULT 'resaleable',
    "cost_at_sale" DECIMAL(15,4),

    CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" BIGSERIAL NOT NULL,
    "cn_number" VARCHAR(50) NOT NULL,
    "return_id" BIGINT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "used_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" BIGSERIAL NOT NULL,
    "po_number" VARCHAR(50) NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "order_date" DATE NOT NULL,
    "expected_date" DATE,
    "grand_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" BIGSERIAL NOT NULL,
    "grn_number" VARCHAR(50) NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "po_id" BIGINT,
    "receipt_date" DATE NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'completed',
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" BIGSERIAL NOT NULL,
    "grn_id" BIGINT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "received_qty" DECIMAL(12,4) NOT NULL,
    "unit_cost" DECIMAL(15,4) NOT NULL,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" BIGSERIAL NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    "supplier_invoice_ref" VARCHAR(100),
    "supplier_id" INTEGER NOT NULL,
    "grn_id" BIGINT,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(15,2) NOT NULL,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'confirmed',
    "stock_posted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by" INTEGER,
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_items" (
    "id" BIGSERIAL NOT NULL,
    "invoice_id" BIGINT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_cost" DECIMAL(15,4) NOT NULL,
    "discount_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "tax_type" "TaxType",
    "tax_rate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "tax_rate_id" INTEGER,
    "tax_amount" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(15,4) NOT NULL,
    "returned_qty" DECIMAL(12,4) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" BIGSERIAL NOT NULL,
    "return_number" VARCHAR(50) NOT NULL,
    "original_invoice_id" BIGINT NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "return_date" DATE NOT NULL,
    "return_reason" TEXT,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'completed',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_items" (
    "id" BIGSERIAL NOT NULL,
    "return_id" BIGINT NOT NULL,
    "original_item_id" BIGINT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "returned_qty" DECIMAL(12,4) NOT NULL,
    "unit_cost" DECIMAL(15,4) NOT NULL,
    "line_total" DECIMAL(15,4) NOT NULL,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_notes" (
    "id" BIGSERIAL NOT NULL,
    "dn_number" VARCHAR(50) NOT NULL,
    "return_id" BIGINT NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_drawer_sessions" (
    "id" BIGSERIAL NOT NULL,
    "session_number" VARCHAR(50) NOT NULL,
    "cashier_id" INTEGER NOT NULL,
    "opening_cash" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "opening_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cash_sales" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cash_collections" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cash_refunds" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "change_given" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cash_expenses" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "expected_closing" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "actual_closing" DECIMAL(15,2),
    "difference" DECIMAL(15,2),
    "closing_time" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "notes" TEXT,

    CONSTRAINT "cash_drawer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" BIGSERIAL NOT NULL,
    "payment_number" VARCHAR(50) NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_type" VARCHAR(20) NOT NULL,
    "party_type" VARCHAR(20),
    "customer_id" INTEGER,
    "supplier_id" INTEGER,
    "payment_method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "cash_tendered" DECIMAL(15,2),
    "change_given" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "transaction_ref" VARCHAR(255),
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'completed',
    "session_id" BIGINT,
    "narration" TEXT,
    "created_by" INTEGER,
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" BIGSERIAL NOT NULL,
    "payment_id" BIGINT NOT NULL,
    "invoice_type" VARCHAR(20) NOT NULL,
    "sales_invoice_id" BIGINT,
    "purchase_invoice_id" BIGINT,
    "allocated_amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateways" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(50),
    "merchant_id" VARCHAR(255),
    "api_endpoint" VARCHAR(500),
    "is_sandbox" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "config_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "account_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "parent_id" INTEGER,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_by" INTEGER,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" BIGSERIAL NOT NULL,
    "voucher_number" VARCHAR(50) NOT NULL,
    "voucher_date" DATE NOT NULL,
    "voucher_type" VARCHAR(50),
    "narration" TEXT,
    "status" "JournalStatus" NOT NULL DEFAULT 'posted',
    "reference_type" VARCHAR(50),
    "reference_id" BIGINT,
    "fiscal_period_id" INTEGER,
    "created_by" INTEGER,
    "posted_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_lines" (
    "id" BIGSERIAL NOT NULL,
    "entry_id" BIGINT NOT NULL,
    "account_id" INTEGER NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "party_type" VARCHAR(20),
    "customer_id" INTEGER,
    "supplier_id" INTEGER,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_module_action_key" ON "permissions"("module", "action");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "numbering_series_series_code_key" ON "numbering_series"("series_code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_code_key" ON "customers"("customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_normalized_key" ON "customers"("phone_normalized");

-- CreateIndex
CREATE INDEX "customers_phone_normalized_idx" ON "customers"("phone_normalized");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_supplier_code_key" ON "suppliers"("supplier_code");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- CreateIndex
CREATE UNIQUE INDEX "items_item_code_key" ON "items"("item_code");

-- CreateIndex
CREATE UNIQUE INDEX "items_barcode_key" ON "items"("barcode");

-- CreateIndex
CREATE INDEX "items_barcode_idx" ON "items"("barcode");

-- CreateIndex
CREATE INDEX "items_item_code_idx" ON "items"("item_code");

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items"("name");

-- CreateIndex
CREATE INDEX "items_category_id_idx" ON "items"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_barcodes_barcode_key" ON "item_barcodes"("barcode");

-- CreateIndex
CREATE INDEX "item_barcodes_barcode_idx" ON "item_barcodes"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "stock_balances_item_id_idx" ON "stock_balances"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_item_id_warehouse_id_key" ON "stock_balances"("item_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_movements_item_id_idx" ON "inventory_movements"("item_id");

-- CreateIndex
CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements"("created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_reference_type_reference_id_idx" ON "inventory_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_adj_number_key" ON "stock_adjustments"("adj_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_invoice_number_key" ON "sales_invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_idempotency_key_key" ON "sales_invoices"("idempotency_key");

-- CreateIndex
CREATE INDEX "sales_invoices_invoice_number_idx" ON "sales_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "sales_invoices_invoice_date_idx" ON "sales_invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "sales_invoices_customer_id_idx" ON "sales_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "sales_invoices_status_idx" ON "sales_invoices"("status");

-- CreateIndex
CREATE INDEX "sales_invoice_items_invoice_id_idx" ON "sales_invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "sales_invoice_items_item_id_idx" ON "sales_invoice_items"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_return_number_key" ON "sales_returns"("return_number");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_cn_number_key" ON "credit_notes"("cn_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_grn_number_key" ON "goods_receipts"("grn_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_invoice_number_key" ON "purchase_invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_idempotency_key_key" ON "purchase_invoices"("idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_invoices_invoice_number_idx" ON "purchase_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "purchase_invoices_invoice_date_idx" ON "purchase_invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "purchase_invoices_supplier_id_idx" ON "purchase_invoices"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_invoice_id_idx" ON "purchase_invoice_items"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_return_number_key" ON "purchase_returns"("return_number");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_dn_number_key" ON "debit_notes"("dn_number");

-- CreateIndex
CREATE UNIQUE INDEX "cash_drawer_sessions_session_number_key" ON "cash_drawer_sessions"("session_number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_number_key" ON "payments"("payment_number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateways_code_key" ON "payment_gateways"("code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_account_code_key" ON "accounts"("account_code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_voucher_number_key" ON "journal_entries"("voucher_number");

-- CreateIndex
CREATE INDEX "journal_entries_voucher_date_idx" ON "journal_entries"("voucher_date");

-- CreateIndex
CREATE INDEX "journal_entries_reference_type_reference_id_idx" ON "journal_entries"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "journal_entry_lines_account_id_idx" ON "journal_entry_lines"("account_id");

-- CreateIndex
CREATE INDEX "journal_entry_lines_entry_id_idx" ON "journal_entry_lines"("entry_id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_barcodes" ADD CONSTRAINT "item_barcodes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_price_history" ADD CONSTRAINT "item_price_history_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_price_history" ADD CONSTRAINT "item_price_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_cash_drawer_session_id_fkey" FOREIGN KEY ("cash_drawer_session_id") REFERENCES "cash_drawer_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_original_invoice_id_fkey" FOREIGN KEY ("original_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sales_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_original_item_id_fkey" FOREIGN KEY ("original_item_id") REFERENCES "sales_invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sales_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_original_invoice_id_fkey" FOREIGN KEY ("original_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "purchase_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_original_item_id_fkey" FOREIGN KEY ("original_item_id") REFERENCES "purchase_invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "purchase_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cash_drawer_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
