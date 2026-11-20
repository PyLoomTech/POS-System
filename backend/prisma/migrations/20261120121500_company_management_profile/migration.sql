ALTER TABLE "company_settings"
  ADD COLUMN "legal_business_name" VARCHAR(255),
  ADD COLUMN "trading_name" VARCHAR(255),
  ADD COLUMN "alternative_logo" VARCHAR(500),
  ADD COLUMN "invoice_logo" VARCHAR(500),
  ADD COLUMN "company_stamp" VARCHAR(500),
  ADD COLUMN "signature_image" VARCHAR(500),
  ADD COLUMN "registration_number" VARCHAR(100),
  ADD COLUMN "business_type" VARCHAR(100),
  ADD COLUMN "industry" VARCHAR(100),
  ADD COLUMN "description" TEXT,
  ADD COLUMN "primary_contact_person" VARCHAR(255),
  ADD COLUMN "billing_address" VARCHAR(1000),
  ADD COLUMN "state_province" VARCHAR(100),
  ADD COLUMN "country" VARCHAR(100) DEFAULT 'Nepal',
  ADD COLUMN "postal_code" VARCHAR(30),
  ADD COLUMN "alternative_phone" VARCHAR(50),
  ADD COLUMN "currency_symbol" VARCHAR(10) NOT NULL DEFAULT 'Rs.',
  ADD COLUMN "currency_precision" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "language" VARCHAR(20) NOT NULL DEFAULT 'en',
  ADD COLUMN "date_format" VARCHAR(40) NOT NULL DEFAULT 'dd/MM/yyyy',
  ADD COLUMN "number_format" VARCHAR(40) NOT NULL DEFAULT 'en-US',
  ADD COLUMN "fiscal_year_end" VARCHAR(10),
  ADD COLUMN "default_payment_terms_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "default_tax_rate_id" INTEGER,
  ADD COLUMN "default_receivable_account_id" INTEGER,
  ADD COLUMN "default_payable_account_id" INTEGER,
  ADD COLUMN "default_cash_account_id" INTEGER,
  ADD COLUMN "default_bank_account_id" INTEGER,
  ADD COLUMN "default_income_account_id" INTEGER,
  ADD COLUMN "default_expense_account_id" INTEGER,
  ADD COLUMN "default_stock_account_id" INTEGER,
  ADD COLUMN "default_cogs_account_id" INTEGER;

ALTER TABLE "company_settings"
  ADD CONSTRAINT "company_settings_default_tax_rate_id_fkey"
    FOREIGN KEY ("default_tax_rate_id") REFERENCES "tax_rates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "company_settings_default_receivable_account_id_fkey"
    FOREIGN KEY ("default_receivable_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "company_settings_default_payable_account_id_fkey"
    FOREIGN KEY ("default_payable_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "company_settings_default_cash_account_id_fkey"
    FOREIGN KEY ("default_cash_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "company_settings_default_bank_account_id_fkey"
    FOREIGN KEY ("default_bank_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "company_settings_default_income_account_id_fkey"
    FOREIGN KEY ("default_income_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "company_settings_default_expense_account_id_fkey"
    FOREIGN KEY ("default_expense_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "company_settings_default_stock_account_id_fkey"
    FOREIGN KEY ("default_stock_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "company_settings_default_cogs_account_id_fkey"
    FOREIGN KEY ("default_cogs_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
