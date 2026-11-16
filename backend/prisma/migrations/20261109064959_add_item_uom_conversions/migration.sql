-- AlterTable
ALTER TABLE "purchase_invoice_items" ADD COLUMN     "conversion_factor" DECIMAL(15,6) NOT NULL DEFAULT 1,
ADD COLUMN     "unit_id" INTEGER;

-- AlterTable
ALTER TABLE "sales_invoice_items" ADD COLUMN     "conversion_factor" DECIMAL(15,6) NOT NULL DEFAULT 1,
ADD COLUMN     "unit_id" INTEGER;

-- CreateTable
CREATE TABLE "item_unit_conversions" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "factor" DECIMAL(15,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_unit_conversions_item_id_unit_id_key" ON "item_unit_conversions"("item_id", "unit_id");

-- AddForeignKey
ALTER TABLE "item_unit_conversions" ADD CONSTRAINT "item_unit_conversions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_unit_conversions" ADD CONSTRAINT "item_unit_conversions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
