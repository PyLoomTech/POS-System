ALTER TABLE "cash_drawer_sessions"
ADD COLUMN "register_name" VARCHAR(100) NOT NULL DEFAULT 'Main Register',
ADD COLUMN "opening_notes" TEXT,
ADD COLUMN "closing_notes" TEXT,
ADD COLUMN "closing_summary" JSONB;

ALTER TABLE "sales_returns"
ADD COLUMN "cash_drawer_session_id" BIGINT;

UPDATE "sales_returns" sr
SET "cash_drawer_session_id" = si."cash_drawer_session_id"
FROM "sales_invoices" si
WHERE sr."original_invoice_id" = si."id"
  AND si."cash_drawer_session_id" IS NOT NULL;

ALTER TABLE "sales_returns"
ADD CONSTRAINT "sales_returns_cash_drawer_session_id_fkey"
FOREIGN KEY ("cash_drawer_session_id") REFERENCES "cash_drawer_sessions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sales_returns_cash_drawer_session_id_idx"
ON "sales_returns" ("cash_drawer_session_id");

CREATE UNIQUE INDEX "cash_drawer_sessions_one_open_per_cashier"
ON "cash_drawer_sessions" ("cashier_id")
WHERE "status" = 'open';

CREATE UNIQUE INDEX "cash_drawer_sessions_one_open_per_register"
ON "cash_drawer_sessions" ("register_name")
WHERE "status" = 'open';

CREATE INDEX "cash_drawer_sessions_opening_time_status_idx"
ON "cash_drawer_sessions" ("opening_time", "status");

INSERT INTO "permissions" ("module", "action", "description")
VALUES ('shifts', 'view', 'View cashier shifts and shift reports'),
       ('shifts', 'open', 'Open a cashier shift'),
       ('shifts', 'close', 'Close a cashier shift')
ON CONFLICT ("module", "action") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.module = 'shifts'
WHERE r.name IN ('Administrator', 'Manager', 'Cashier')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.module = 'shifts' AND p.action = 'view'
WHERE r.name = 'Accountant'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
