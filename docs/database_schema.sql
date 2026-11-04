-- =============================================================================
-- PYLOOM POS — Complete Database Schema Design
-- PostgreSQL 12.4 Compatible
-- Powered by Pyloom Technologies
-- Currency: NPR | Timezone: Asia/Kathmandu
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_status AS ENUM ('active', 'inactive', 'locked');
CREATE TYPE invoice_status AS ENUM ('draft', 'confirmed', 'cancelled', 'returned');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'card', 'digital_wallet', 'qr', 'customer_credit', 'split');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE stock_movement_type AS ENUM ('purchase', 'sale', 'return_in', 'return_out', 'adjustment', 'transfer', 'opening');
CREATE TYPE journal_status AS ENUM ('draft', 'posted', 'cancelled');
CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE tax_type AS ENUM ('taxable_exclusive', 'taxable_inclusive', 'non_taxable', 'zero_rated', 'exempt');
CREATE TYPE return_disposition AS ENUM ('resaleable', 'damaged', 'expired', 'write_off');

-- =============================================================================
-- AUTHENTICATION & ROLES
-- =============================================================================

CREATE TABLE roles (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    description   TEXT,
    is_system     BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE permissions (
    id            SERIAL PRIMARY KEY,
    module        VARCHAR(100) NOT NULL,
    action        VARCHAR(100) NOT NULL,
    description   TEXT,
    UNIQUE(module, action)
);

CREATE TABLE role_permissions (
    role_id       INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id                SERIAL PRIMARY KEY,
    username          VARCHAR(100) NOT NULL UNIQUE,
    email             VARCHAR(255) UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    full_name         VARCHAR(255) NOT NULL,
    role_id           INT NOT NULL REFERENCES roles(id),
    status            user_status DEFAULT 'active',
    last_login        TIMESTAMPTZ,
    login_attempts    INT DEFAULT 0,
    locked_until      TIMESTAMPTZ,
    created_by        INT REFERENCES users(id),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id            BIGSERIAL PRIMARY KEY,
    user_id       INT REFERENCES users(id),
    username      VARCHAR(100),
    action        VARCHAR(255) NOT NULL,
    entity        VARCHAR(100) NOT NULL,
    entity_id     VARCHAR(100),
    old_values    JSONB,
    new_values    JSONB,
    ip_address    INET,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- COMPANY & SETTINGS
-- =============================================================================

CREATE TABLE company_settings (
    id                  SERIAL PRIMARY KEY,
    company_name        VARCHAR(255) NOT NULL,
    company_logo        VARCHAR(500),
    address_line1       VARCHAR(500),
    address_line2       VARCHAR(500),
    city                VARCHAR(100),
    phone               VARCHAR(50),
    email               VARCHAR(255),
    website             VARCHAR(255),
    pan_vat_number      VARCHAR(50),
    currency_code       VARCHAR(10) DEFAULT 'NPR',
    timezone            VARCHAR(100) DEFAULT 'Asia/Kathmandu',
    fiscal_year_start   VARCHAR(10) DEFAULT '07-16',  -- Shrawan 1 (approximate)
    invoice_footer      TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_settings (
    key     VARCHAR(255) PRIMARY KEY,
    value   TEXT,
    label   VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE numbering_series (
    id          SERIAL PRIMARY KEY,
    series_code VARCHAR(20) NOT NULL UNIQUE,
    prefix      VARCHAR(20) NOT NULL,
    last_number BIGINT DEFAULT 0,
    padding     INT DEFAULT 6,
    reset_yearly BOOLEAN DEFAULT TRUE,
    current_year VARCHAR(10)
);

-- =============================================================================
-- TAX RATES
-- =============================================================================

CREATE TABLE tax_rates (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    rate        NUMERIC(8,4) NOT NULL DEFAULT 0,
    is_default  BOOLEAN DEFAULT FALSE,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Default entries: VAT 13%, Zero-rated 0%

-- =============================================================================
-- PARTIES — CUSTOMERS & SUPPLIERS
-- =============================================================================

CREATE TABLE customers (
    id                  SERIAL PRIMARY KEY,
    customer_code       VARCHAR(50) UNIQUE,
    name                VARCHAR(255) NOT NULL,
    phone               VARCHAR(20),
    phone_normalized    VARCHAR(20) UNIQUE,  -- For duplicate prevention
    alternate_phone     VARCHAR(20),
    email               VARCHAR(255),
    address             TEXT,
    pan_vat_number      VARCHAR(50),
    opening_balance     NUMERIC(15,2) DEFAULT 0,
    credit_limit        NUMERIC(15,2) DEFAULT 0,
    is_walkin           BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_by          INT REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE suppliers (
    id                  SERIAL PRIMARY KEY,
    supplier_code       VARCHAR(50) UNIQUE,
    name                VARCHAR(255) NOT NULL,
    contact_person      VARCHAR(255),
    phone               VARCHAR(20),
    email               VARCHAR(255),
    address             TEXT,
    pan_vat_number      VARCHAR(50),
    opening_balance     NUMERIC(15,2) DEFAULT 0,
    payment_terms_days  INT DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    created_by          INT REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ITEM CATALOG
-- =============================================================================

CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    parent_id   INT REFERENCES categories(id),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE brands (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE units (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    abbreviation VARCHAR(20),
    is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE items (
    id                  SERIAL PRIMARY KEY,
    item_code           VARCHAR(100) NOT NULL UNIQUE,
    barcode             VARCHAR(100) UNIQUE,
    name                VARCHAR(500) NOT NULL,
    description         TEXT,
    category_id         INT REFERENCES categories(id),
    brand_id            INT REFERENCES brands(id),
    unit_id             INT NOT NULL REFERENCES units(id),
    tax_rate_id         INT REFERENCES tax_rates(id),
    tax_type            tax_type DEFAULT 'taxable_exclusive',
    purchase_price      NUMERIC(15,4) DEFAULT 0,
    selling_price       NUMERIC(15,4) DEFAULT 0,
    minimum_stock       NUMERIC(12,4) DEFAULT 0,
    reorder_level       NUMERIC(12,4) DEFAULT 0,
    image_url           VARCHAR(500),
    is_active           BOOLEAN DEFAULT TRUE,
    created_by          INT REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE item_barcodes (
    id          SERIAL PRIMARY KEY,
    item_id     INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    barcode     VARCHAR(100) NOT NULL UNIQUE,
    is_primary  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE item_price_history (
    id              BIGSERIAL PRIMARY KEY,
    item_id         INT NOT NULL REFERENCES items(id),
    old_purchase    NUMERIC(15,4),
    new_purchase    NUMERIC(15,4),
    old_selling     NUMERIC(15,4),
    new_selling     NUMERIC(15,4),
    changed_by      INT REFERENCES users(id),
    reason          TEXT,
    changed_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INVENTORY
-- =============================================================================

CREATE TABLE warehouses (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    address     TEXT,
    is_default  BOOLEAN DEFAULT FALSE,
    is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE stock_balances (
    id              BIGSERIAL PRIMARY KEY,
    item_id         INT NOT NULL REFERENCES items(id),
    warehouse_id    INT NOT NULL REFERENCES warehouses(id),
    quantity        NUMERIC(12,4) DEFAULT 0,
    average_cost    NUMERIC(15,4) DEFAULT 0,
    UNIQUE(item_id, warehouse_id)
);

CREATE TABLE inventory_movements (
    id              BIGSERIAL PRIMARY KEY,
    item_id         INT NOT NULL REFERENCES items(id),
    warehouse_id    INT NOT NULL REFERENCES warehouses(id),
    movement_type   stock_movement_type NOT NULL,
    quantity        NUMERIC(12,4) NOT NULL,  -- positive=in, negative=out
    unit_cost       NUMERIC(15,4),
    reference_type  VARCHAR(50),
    reference_id    BIGINT,
    narration       TEXT,
    created_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_adjustments (
    id              SERIAL PRIMARY KEY,
    adj_number      VARCHAR(50) NOT NULL UNIQUE,
    warehouse_id    INT NOT NULL REFERENCES warehouses(id),
    adjustment_date DATE NOT NULL,
    reason          TEXT,
    status          VARCHAR(20) DEFAULT 'pending',
    approved_by     INT REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    created_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_adjustment_items (
    id                  SERIAL PRIMARY KEY,
    adjustment_id       INT NOT NULL REFERENCES stock_adjustments(id),
    item_id             INT NOT NULL REFERENCES items(id),
    system_quantity     NUMERIC(12,4),
    actual_quantity     NUMERIC(12,4),
    difference          NUMERIC(12,4),
    unit_cost           NUMERIC(15,4)
);

-- =============================================================================
-- SALES
-- =============================================================================

CREATE TABLE sales_invoices (
    id                      BIGSERIAL PRIMARY KEY,
    invoice_number          VARCHAR(50) NOT NULL UNIQUE,
    invoice_date            DATE NOT NULL,
    customer_id             INT NOT NULL REFERENCES customers(id),
    subtotal                NUMERIC(15,2) NOT NULL,
    discount_amount         NUMERIC(15,2) DEFAULT 0,
    taxable_amount          NUMERIC(15,2) DEFAULT 0,
    tax_amount              NUMERIC(15,2) DEFAULT 0,
    non_taxable_amount      NUMERIC(15,2) DEFAULT 0,
    grand_total             NUMERIC(15,2) NOT NULL,
    paid_amount             NUMERIC(15,2) DEFAULT 0,
    outstanding_amount      NUMERIC(15,2) GENERATED ALWAYS AS (grand_total - paid_amount) STORED,
    status                  invoice_status DEFAULT 'confirmed',
    is_credit               BOOLEAN DEFAULT FALSE,
    due_date                DATE,
    notes                   TEXT,
    cashier_id              INT REFERENCES users(id),
    cash_drawer_session_id  BIGINT,  -- FK added after session table
    idempotency_key         VARCHAR(100) UNIQUE,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sales_invoice_items (
    id              BIGSERIAL PRIMARY KEY,
    invoice_id      BIGINT NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    item_id         INT NOT NULL REFERENCES items(id),
    quantity        NUMERIC(12,4) NOT NULL,
    unit_price      NUMERIC(15,4) NOT NULL,
    discount_pct    NUMERIC(8,4) DEFAULT 0,
    discount_amount NUMERIC(15,4) DEFAULT 0,
    tax_type        tax_type,
    tax_rate        NUMERIC(8,4) DEFAULT 0,
    tax_amount      NUMERIC(15,4) DEFAULT 0,
    line_total      NUMERIC(15,4) NOT NULL,
    cost_at_sale    NUMERIC(15,4),  -- WAC at time of sale
    returned_qty    NUMERIC(12,4) DEFAULT 0
);

CREATE TABLE sales_returns (
    id                  BIGSERIAL PRIMARY KEY,
    return_number       VARCHAR(50) NOT NULL UNIQUE,
    original_invoice_id BIGINT NOT NULL REFERENCES sales_invoices(id),
    return_date         DATE NOT NULL,
    customer_id         INT NOT NULL REFERENCES customers(id),
    return_reason       TEXT,
    subtotal            NUMERIC(15,2) DEFAULT 0,
    tax_amount          NUMERIC(15,2) DEFAULT 0,
    total_amount        NUMERIC(15,2) DEFAULT 0,
    refund_method       VARCHAR(50),
    refund_amount       NUMERIC(15,2) DEFAULT 0,
    status              VARCHAR(20) DEFAULT 'completed',
    processed_by        INT REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sales_return_items (
    id                      BIGSERIAL PRIMARY KEY,
    return_id               BIGINT NOT NULL REFERENCES sales_returns(id),
    original_item_id        BIGINT NOT NULL REFERENCES sales_invoice_items(id),
    item_id                 INT NOT NULL REFERENCES items(id),
    returned_qty            NUMERIC(12,4) NOT NULL,
    unit_price              NUMERIC(15,4) NOT NULL,
    tax_amount              NUMERIC(15,4) DEFAULT 0,
    line_total              NUMERIC(15,4) NOT NULL,
    disposition             return_disposition DEFAULT 'resaleable',
    cost_at_sale            NUMERIC(15,4)
);

CREATE TABLE credit_notes (
    id              BIGSERIAL PRIMARY KEY,
    cn_number       VARCHAR(50) NOT NULL UNIQUE,
    return_id       BIGINT NOT NULL REFERENCES sales_returns(id),
    customer_id     INT NOT NULL REFERENCES customers(id),
    amount          NUMERIC(15,2) NOT NULL,
    used_amount     NUMERIC(15,2) DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'open',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PURCHASES
-- =============================================================================

CREATE TABLE purchase_orders (
    id              BIGSERIAL PRIMARY KEY,
    po_number       VARCHAR(50) NOT NULL UNIQUE,
    supplier_id     INT NOT NULL REFERENCES suppliers(id),
    order_date      DATE NOT NULL,
    expected_date   DATE,
    grand_total     NUMERIC(15,2) DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'draft',
    notes           TEXT,
    created_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goods_receipts (
    id              BIGSERIAL PRIMARY KEY,
    grn_number      VARCHAR(50) NOT NULL UNIQUE,
    supplier_id     INT NOT NULL REFERENCES suppliers(id),
    po_id           BIGINT REFERENCES purchase_orders(id),
    receipt_date    DATE NOT NULL,
    warehouse_id    INT NOT NULL REFERENCES warehouses(id),
    status          VARCHAR(20) DEFAULT 'completed',
    notes           TEXT,
    created_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goods_receipt_items (
    id              BIGSERIAL PRIMARY KEY,
    grn_id          BIGINT NOT NULL REFERENCES goods_receipts(id),
    item_id         INT NOT NULL REFERENCES items(id),
    received_qty    NUMERIC(12,4) NOT NULL,
    unit_cost       NUMERIC(15,4) NOT NULL
);

CREATE TABLE purchase_invoices (
    id                      BIGSERIAL PRIMARY KEY,
    invoice_number          VARCHAR(50) NOT NULL UNIQUE,
    supplier_invoice_ref    VARCHAR(100),
    supplier_id             INT NOT NULL REFERENCES suppliers(id),
    grn_id                  BIGINT REFERENCES goods_receipts(id),
    invoice_date            DATE NOT NULL,
    due_date                DATE,
    subtotal                NUMERIC(15,2) NOT NULL,
    discount_amount         NUMERIC(15,2) DEFAULT 0,
    tax_amount              NUMERIC(15,2) DEFAULT 0,
    grand_total             NUMERIC(15,2) NOT NULL,
    paid_amount             NUMERIC(15,2) DEFAULT 0,
    outstanding_amount      NUMERIC(15,2) GENERATED ALWAYS AS (grand_total - paid_amount) STORED,
    status                  invoice_status DEFAULT 'confirmed',
    stock_posted            BOOLEAN DEFAULT FALSE,  -- Prevent double inventory
    notes                   TEXT,
    created_by              INT REFERENCES users(id),
    idempotency_key         VARCHAR(100) UNIQUE,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_invoice_items (
    id              BIGSERIAL PRIMARY KEY,
    invoice_id      BIGINT NOT NULL REFERENCES purchase_invoices(id),
    item_id         INT NOT NULL REFERENCES items(id),
    quantity        NUMERIC(12,4) NOT NULL,
    unit_cost       NUMERIC(15,4) NOT NULL,
    discount_pct    NUMERIC(8,4) DEFAULT 0,
    discount_amount NUMERIC(15,4) DEFAULT 0,
    tax_type        tax_type,
    tax_rate        NUMERIC(8,4) DEFAULT 0,
    tax_amount      NUMERIC(15,4) DEFAULT 0,
    line_total      NUMERIC(15,4) NOT NULL,
    returned_qty    NUMERIC(12,4) DEFAULT 0
);

CREATE TABLE purchase_returns (
    id                  BIGSERIAL PRIMARY KEY,
    return_number       VARCHAR(50) NOT NULL UNIQUE,
    original_invoice_id BIGINT NOT NULL REFERENCES purchase_invoices(id),
    supplier_id         INT NOT NULL REFERENCES suppliers(id),
    return_date         DATE NOT NULL,
    return_reason       TEXT,
    total_amount        NUMERIC(15,2) DEFAULT 0,
    status              VARCHAR(20) DEFAULT 'completed',
    created_by          INT REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_return_items (
    id              BIGSERIAL PRIMARY KEY,
    return_id       BIGINT NOT NULL REFERENCES purchase_returns(id),
    item_id         INT NOT NULL REFERENCES items(id),
    returned_qty    NUMERIC(12,4) NOT NULL,
    unit_cost       NUMERIC(15,4) NOT NULL,
    line_total      NUMERIC(15,4) NOT NULL
);

CREATE TABLE debit_notes (
    id              BIGSERIAL PRIMARY KEY,
    dn_number       VARCHAR(50) NOT NULL UNIQUE,
    return_id       BIGINT NOT NULL REFERENCES purchase_returns(id),
    supplier_id     INT NOT NULL REFERENCES suppliers(id),
    amount          NUMERIC(15,2) NOT NULL,
    status          VARCHAR(20) DEFAULT 'open',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PAYMENTS
-- =============================================================================

CREATE TABLE cash_drawer_sessions (
    id                  BIGSERIAL PRIMARY KEY,
    session_number      VARCHAR(50) NOT NULL UNIQUE,
    cashier_id          INT NOT NULL REFERENCES users(id),
    opening_cash        NUMERIC(15,2) DEFAULT 0,
    opening_time        TIMESTAMPTZ DEFAULT NOW(),
    cash_sales          NUMERIC(15,2) DEFAULT 0,
    cash_collections    NUMERIC(15,2) DEFAULT 0,
    cash_refunds        NUMERIC(15,2) DEFAULT 0,
    change_given        NUMERIC(15,2) DEFAULT 0,
    cash_expenses       NUMERIC(15,2) DEFAULT 0,
    expected_closing    NUMERIC(15,2) DEFAULT 0,
    actual_closing      NUMERIC(15,2),
    difference          NUMERIC(15,2),
    closing_time        TIMESTAMPTZ,
    status              VARCHAR(20) DEFAULT 'open',
    notes               TEXT
);

-- Add FK now that session table exists
ALTER TABLE sales_invoices
    ADD CONSTRAINT fk_sales_session
    FOREIGN KEY (cash_drawer_session_id) REFERENCES cash_drawer_sessions(id);

CREATE TABLE payments (
    id                  BIGSERIAL PRIMARY KEY,
    payment_number      VARCHAR(50) NOT NULL UNIQUE,
    payment_date        DATE NOT NULL,
    payment_type        VARCHAR(20) NOT NULL,  -- 'receipt' or 'payment'
    party_type          VARCHAR(20),           -- 'customer' or 'supplier'
    customer_id         INT REFERENCES customers(id),
    supplier_id         INT REFERENCES suppliers(id),
    payment_method      payment_method NOT NULL,
    amount              NUMERIC(15,2) NOT NULL,
    cash_tendered       NUMERIC(15,2),
    change_given        NUMERIC(15,2) DEFAULT 0,
    transaction_ref     VARCHAR(255),
    bank_account_id     INT,
    payment_status      payment_status DEFAULT 'completed',
    session_id          BIGINT REFERENCES cash_drawer_sessions(id),
    narration           TEXT,
    created_by          INT REFERENCES users(id),
    idempotency_key     VARCHAR(100) UNIQUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_allocations (
    id                  BIGSERIAL PRIMARY KEY,
    payment_id          BIGINT NOT NULL REFERENCES payments(id),
    invoice_type        VARCHAR(20) NOT NULL,   -- 'sales' or 'purchase'
    sales_invoice_id    BIGINT REFERENCES sales_invoices(id),
    purchase_invoice_id BIGINT REFERENCES purchase_invoices(id),
    allocated_amount    NUMERIC(15,2) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_gateways (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    provider        VARCHAR(50),
    merchant_id     VARCHAR(255),
    api_endpoint    VARCHAR(500),
    is_sandbox      BOOLEAN DEFAULT TRUE,
    is_active       BOOLEAN DEFAULT FALSE,
    config_json     TEXT,  -- Encrypted additional config
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- CHART OF ACCOUNTS & DOUBLE-ENTRY ACCOUNTING
-- =============================================================================

CREATE TABLE accounts (
    id              SERIAL PRIMARY KEY,
    account_code    VARCHAR(20) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    account_type    account_type NOT NULL,
    parent_id       INT REFERENCES accounts(id),
    is_group        BOOLEAN DEFAULT FALSE,
    opening_balance NUMERIC(15,2) DEFAULT 0,
    is_system       BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fiscal_periods (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_closed       BOOLEAN DEFAULT FALSE,
    closed_by       INT REFERENCES users(id),
    closed_at       TIMESTAMPTZ
);

CREATE TABLE journal_entries (
    id              BIGSERIAL PRIMARY KEY,
    voucher_number  VARCHAR(50) NOT NULL UNIQUE,
    voucher_date    DATE NOT NULL,
    voucher_type    VARCHAR(50),
    narration       TEXT,
    status          journal_status DEFAULT 'posted',
    reference_type  VARCHAR(50),
    reference_id    BIGINT,
    fiscal_period_id INT REFERENCES fiscal_periods(id),
    created_by      INT REFERENCES users(id),
    posted_by       INT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE journal_entry_lines (
    id              BIGSERIAL PRIMARY KEY,
    entry_id        BIGINT NOT NULL REFERENCES journal_entries(id),
    account_id      INT NOT NULL REFERENCES accounts(id),
    debit           NUMERIC(15,2) DEFAULT 0,
    credit          NUMERIC(15,2) DEFAULT 0,
    narration       TEXT,
    party_type      VARCHAR(20),
    customer_id     INT REFERENCES customers(id),
    supplier_id     INT REFERENCES suppliers(id)
);

-- Constraint: every journal entry must balance
-- Enforced at application level within atomic transaction
-- (PostgreSQL doesn't support cross-row constraints natively)

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Items
CREATE INDEX idx_items_barcode ON items(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_items_code ON items(item_code);
CREATE INDEX idx_items_name ON items(name);
CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_item_barcodes_barcode ON item_barcodes(barcode);

-- Customers
CREATE INDEX idx_customers_phone ON customers(phone_normalized);
CREATE INDEX idx_customers_name ON customers(name);

-- Sales
CREATE INDEX idx_sales_inv_number ON sales_invoices(invoice_number);
CREATE INDEX idx_sales_inv_date ON sales_invoices(invoice_date);
CREATE INDEX idx_sales_inv_customer ON sales_invoices(customer_id);
CREATE INDEX idx_sales_inv_status ON sales_invoices(status);
CREATE INDEX idx_sales_items_invoice ON sales_invoice_items(invoice_id);
CREATE INDEX idx_sales_items_item ON sales_invoice_items(item_id);

-- Purchases
CREATE INDEX idx_purchase_inv_number ON purchase_invoices(invoice_number);
CREATE INDEX idx_purchase_inv_date ON purchase_invoices(invoice_date);
CREATE INDEX idx_purchase_inv_supplier ON purchase_invoices(supplier_id);

-- Inventory
CREATE INDEX idx_inv_movements_item ON inventory_movements(item_id);
CREATE INDEX idx_inv_movements_date ON inventory_movements(created_at);
CREATE INDEX idx_inv_movements_ref ON inventory_movements(reference_type, reference_id);
CREATE INDEX idx_stock_balances_item ON stock_balances(item_id);

-- Accounting
CREATE INDEX idx_je_lines_account ON journal_entry_lines(account_id);
CREATE INDEX idx_je_lines_entry ON journal_entry_lines(entry_id);
CREATE INDEX idx_je_voucher_date ON journal_entries(voucher_date);
CREATE INDEX idx_je_reference ON journal_entries(reference_type, reference_id);

-- Audit
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_date ON audit_logs(created_at);

-- =============================================================================
-- INITIAL SEED DATA (System Defaults)
-- =============================================================================

-- Default roles
INSERT INTO roles (name, description, is_system) VALUES
    ('Super Administrator', 'Full system access', TRUE),
    ('Administrator', 'Administrative access', TRUE),
    ('Manager', 'Management access', TRUE),
    ('Cashier', 'POS billing only', TRUE),
    ('Accountant', 'Accounting and reports', TRUE),
    ('Inventory Manager', 'Inventory operations', TRUE),
    ('Purchase Officer', 'Purchase management', TRUE);

-- Default tax rates
INSERT INTO tax_rates (name, rate, is_default, is_active) VALUES
    ('VAT 13%', 13.00, TRUE, TRUE),
    ('Zero Rated', 0.00, FALSE, TRUE),
    ('Non-taxable', 0.00, FALSE, TRUE);

-- Default units
INSERT INTO units (name, abbreviation) VALUES
    ('Piece', 'Pcs'),
    ('Packet', 'Pkt'),
    ('Box', 'Box'),
    ('Kilogram', 'Kg'),
    ('Gram', 'g'),
    ('Liter', 'Ltr'),
    ('Meter', 'm'),
    ('Dozen', 'Dz');

-- Default warehouse
INSERT INTO warehouses (code, name, is_default) VALUES
    ('MAIN', 'Main Store', TRUE);

-- Walk-in customer
INSERT INTO customers (name, is_walkin, phone) VALUES
    ('Walk-in Customer', TRUE, NULL);

-- Numbering series
INSERT INTO numbering_series (series_code, prefix, last_number, padding, reset_yearly) VALUES
    ('SALES_INV', 'SI', 0, 6, TRUE),
    ('PURCHASE_INV', 'PI', 0, 6, TRUE),
    ('SALES_RETURN', 'SR', 0, 6, TRUE),
    ('PURCHASE_RETURN', 'PR', 0, 6, TRUE),
    ('JOURNAL_VOUCHER', 'JV', 0, 6, TRUE),
    ('RECEIPT_VOUCHER', 'RV', 0, 6, TRUE),
    ('PAYMENT_VOUCHER', 'PV', 0, 6, TRUE),
    ('CREDIT_NOTE', 'CN', 0, 6, TRUE),
    ('DEBIT_NOTE', 'DN', 0, 6, TRUE),
    ('CASH_SESSION', 'CS', 0, 6, TRUE),
    ('STOCK_ADJ', 'SA', 0, 6, TRUE);

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
