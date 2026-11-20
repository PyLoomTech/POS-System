ALTER TABLE "sales_invoice_items"
ADD COLUMN "price_list_id" INTEGER;

CREATE INDEX "sales_invoice_items_price_list_id_idx"
ON "sales_invoice_items"("price_list_id");

ALTER TABLE "sales_invoice_items"
ADD CONSTRAINT "sales_invoice_items_price_list_id_fkey"
FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
