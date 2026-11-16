ALTER TABLE "items"
ADD COLUMN "is_stock_item" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "item_import_batches" (
    "id" BIGSERIAL NOT NULL,
    "batch_key" VARCHAR(36) NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'preview',
    "mode" VARCHAR(30),
    "update_prices" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "item_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "item_import_rows" (
    "id" BIGSERIAL NOT NULL,
    "batch_id" BIGINT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "errors" JSONB,
    "item_id" INTEGER,
    "transaction_id" BIGINT,
    "result" JSONB,
    CONSTRAINT "item_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "item_import_batches_batch_key_key" ON "item_import_batches"("batch_key");
CREATE UNIQUE INDEX "item_import_batches_file_hash_key" ON "item_import_batches"("file_hash");
CREATE INDEX "item_import_batches_created_at_idx" ON "item_import_batches"("created_at");
CREATE UNIQUE INDEX "item_import_rows_batch_id_row_number_key" ON "item_import_rows"("batch_id", "row_number");
CREATE INDEX "item_import_rows_batch_id_status_idx" ON "item_import_rows"("batch_id", "status");

ALTER TABLE "item_import_rows"
ADD CONSTRAINT "item_import_rows_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "item_import_batches"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
