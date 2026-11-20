ALTER TABLE "sales_invoices"
ADD COLUMN "email_notification_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
ADD COLUMN "email_sent_at" TIMESTAMP(3),
ADD COLUMN "email_notification_error" TEXT;

UPDATE "sales_invoices"
SET "email_notification_status" = 'skipped',
    "email_notification_error" = 'Email notifications were not enabled when this invoice was issued.';
