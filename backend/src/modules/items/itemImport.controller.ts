import { createHash, randomUUID } from 'crypto';
import { Readable } from 'stream';
import ExcelJS from 'exceljs';
import { NextFunction, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';
import { createError } from '../../middleware/errorHandler';
import { prisma } from '../../config/database';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 2000;

const previewOptionsSchema = z.object({
  defaultWarehouseId: z.coerce.number().int().positive().optional(),
  updatePrices: z.enum(['true', 'false']).default('true'),
});

type ImportPayload = {
  itemCode: string;
  name: string;
  groupName: string;
  unitName: string;
  unitConversions: Array<{ unitName: string; factor: number }>;
  purchaseRate: number | null;
  sellingRate: number;
  valuationRate: number | null;
  priceListPrices: Array<{ priceListId: number; priceListName: string; price: number }>;
  stockQuantity: number | null;
  warehouseId: number | null;
  currentQuantity: number | null;
  isStockItem: boolean | null;
  categoryId: number | null;
  unitId: number | null;
  errors: string[];
};

function normalizedHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
    return String(value);
  }
  return String(value).trim();
}

function rowValues(row: ExcelJS.Row): string[] {
  return Array.from({ length: row.cellCount }, (_value, index) => cellText(row.getCell(index + 1).value));
}

function parseNumber(value: string, label: string, required: boolean): { value: number | null; error?: string } {
  if (!value) return required ? { value: null, error: `${label} is required.` } : { value: null };
  const parsed = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: null, error: `${label} must be a non-negative number.` };
  }
  return { value: parsed };
}

function parseBoolean(value: string): boolean | null {
  if (!value) return null;
  if (['true', 'yes', '1', 'y'].includes(value.toLowerCase())) return true;
  if (['false', 'no', '0', 'n'].includes(value.toLowerCase())) return false;
  return null;
}

async function readWorkbook(file: Express.Multer.File): Promise<{ headers: string[]; records: Array<{ rowNumber: number; values: string[] }> }> {
  const workbook = new ExcelJS.Workbook();
  const ext = file.originalname.toLowerCase().split('.').pop();
  if (ext === 'csv') {
    let sheet: ExcelJS.Worksheet;
    try {
      sheet = await workbook.csv.read(Readable.from([file.buffer]));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid CSV file.';
      throw createError(`Could not read the CSV file: ${message}`, 400);
    }
    const headers = rowValues(sheet.getRow(1));
    const records: Array<{ rowNumber: number; values: string[] }> = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = headers.map((_header, index) => cellText(row.getCell(index + 1).value));
      if (values.some(Boolean)) records.push({ rowNumber, values });
    });
    return { headers, records };
  }

  try {
    await workbook.xlsx.read(Readable.from([file.buffer]));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid Excel workbook.';
    throw createError(`Could not read the Excel file: ${message}`, 400);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw createError('The workbook does not contain a worksheet.', 400);
  const headers = rowValues(sheet.getRow(1));
  const records: Array<{ rowNumber: number; values: string[] }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = headers.map((_header, index) => cellText(row.getCell(index + 1).value));
    if (values.some(Boolean)) records.push({ rowNumber, values });
  });
  return { headers, records };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (ext !== 'csv' && ext !== 'xlsx') {
      callback(createError('Only .csv and .xlsx files are supported.', 400));
      return;
    }
    callback(null, true);
  },
});

const parseUpload = upload.single('file');

export function uploadItemImportFile(req: AuthRequest, res: Response, next: NextFunction) {
  parseUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      return next(createError(
        tooLarge ? `File exceeds the ${MAX_FILE_SIZE / (1024 * 1024)} MB upload limit.` : err.message,
        tooLarge ? 413 : 400,
      ));
    }
    return next(err);
  });
}

async function hasInventoryPermissions(req: AuthRequest): Promise<boolean> {
  if (req.user?.roleName === 'Super Administrator') return true;
  if (!req.user) return false;
  const permissions = await prisma.rolePermission.findMany({
    where: { roleId: req.user.roleId },
    include: { permission: true },
  });
  const grants = new Set(permissions.map(({ permission }) => `${permission.module}:${permission.action}`));
  return grants.has('inventory:create') && grants.has('inventory:approve');
}

function rowToResponse(row: {
  rowNumber: number;
  status: string;
  payload: Prisma.JsonValue;
  errors: Prisma.JsonValue | null;
  itemId: number | null;
  transactionId: bigint | null;
  result: Prisma.JsonValue | null;
}) {
  return {
    rowNumber: row.rowNumber,
    status: row.status,
    ...(row.payload as object),
    errors: row.errors ?? [],
    itemId: row.itemId,
    transactionId: row.transactionId?.toString() ?? null,
    result: row.result,
  };
}

function resolveRow(
  values: string[],
  headerIndexes: Map<string, number>,
  defaultWarehouseId: number | undefined,
  priceLists: Array<{ id: number; name: string }>,
  lookups?: {
    warehouses: Map<string, number>;
    categories: Map<string, number>;
    units: Map<string, number>;
  },
): ImportPayload {
  const value = (key: string) => values[headerIndexes.get(key) ?? -1] ?? '';
  const itemCode = value('itemcode').trim();
  const name = value('itemname').trim();
  const groupName = value('itemgroup').trim();
  const unitName = value('uom').trim();
  const unitConversions: Array<{ unitName: string; factor: number }> = [];
  const errors: string[] = [];

  if (!itemCode) errors.push('Item Code is required.');
  if (!name) errors.push('Item Name is required.');
  if (!groupName) errors.push('Item Group is required.');
  if (!unitName) errors.push('UOM is required.');
  if (itemCode.length > 100) errors.push('Item Code cannot exceed 100 characters.');
  if (name.length > 500) errors.push('Item Name cannot exceed 500 characters.');

  const conversionText = value('uomconversions').trim();
  const conversionNames = new Set<string>();
  if (conversionText) {
    for (const entry of conversionText.split(';')) {
      const separator = entry.lastIndexOf('=');
      if (separator <= 0) {
        errors.push('UOM Conversions must use "Unit=Factor" pairs separated by semicolons.');
        continue;
      }
      const convertedUnitName = entry.slice(0, separator).trim();
      const factorText = entry.slice(separator + 1).trim();
      const parsedFactor = parseNumber(factorText, `${convertedUnitName || 'Alternate UOM'} conversion factor`, true);
      if (!convertedUnitName || convertedUnitName.length > 100) {
        errors.push('Alternate UOM names must contain 1 to 100 characters.');
        continue;
      }
      if (parsedFactor.error || parsedFactor.value === null || parsedFactor.value === 0) {
        errors.push(parsedFactor.error ?? `Conversion factor for '${convertedUnitName}' must be greater than zero.`);
        continue;
      }
      const unitKey = convertedUnitName.toLowerCase();
      if (unitKey === unitName.toLowerCase()) {
        errors.push(`Alternate UOM '${convertedUnitName}' cannot match the item's base UOM.`);
      } else if (conversionNames.has(unitKey)) {
        errors.push(`Alternate UOM '${convertedUnitName}' is repeated.`);
      } else {
        conversionNames.add(unitKey);
        unitConversions.push({ unitName: convertedUnitName, factor: parsedFactor.value });
      }
    }
  }

  const selling = parseNumber(value('sellingrate'), 'Selling Rate', true);
  const purchase = parseNumber(value('purchaserate') || value('purchaseprice'), 'Purchase Rate', false);
  const valuation = parseNumber(
    value('valuationrate') || value('purchaserate') || value('purchaseprice'),
    'Valuation Rate',
    false,
  );
  const stock = parseNumber(value('stockqty'), 'Stock Qty', false);
  if (selling.error) errors.push(selling.error);
  if (purchase.error) errors.push(purchase.error);
  if (valuation.error) errors.push(valuation.error);
  if (stock.error) errors.push(stock.error);

  const effectiveValuationRate = valuation.value ?? purchase.value ?? null;
  const priceListHeaderKeys = new Set(priceLists.map((list) => normalizedHeader(`Price List: ${list.name}`)));
  const priceListPrices = priceLists.flatMap((list) => {
    const headerKey = normalizedHeader(`Price List: ${list.name}`);
    const index = headerIndexes.get(headerKey);
    if (index === undefined) return [];
    const parsed = parseNumber(values[index] ?? '', `${list.name} Price`, false);
    if (parsed.error) errors.push(parsed.error);
    return parsed.value === null ? [] : [{ priceListId: list.id, priceListName: list.name, price: parsed.value }];
  });
  for (const header of headerIndexes.keys()) {
    if (header.startsWith('pricelist') && !priceListHeaderKeys.has(header)) {
      errors.push(`Price list column '${header}' does not match an active price list. Use 'Price List: <name>'.`);
    }
  }

  const stockItemCell = value('stockitem');
  const parsedStockItem = parseBoolean(stockItemCell);
  if (stockItemCell && parsedStockItem === null) errors.push('Stock Item must be yes/no, true/false, or 1/0.');
  if (stock.value !== null && parsedStockItem === false) {
    errors.push('Stock quantity cannot be supplied for a non-stock item.');
  }

  const warehouseCell = value('warehouse').trim();
  let warehouseId: number | null = defaultWarehouseId ?? null;
  if (warehouseCell) {
    const resolvedWarehouseId = lookups?.warehouses.get(warehouseCell.toLowerCase());
    if (!resolvedWarehouseId) errors.push(`Warehouse '${warehouseCell}' was not found or is inactive.`);
    else warehouseId = resolvedWarehouseId;
  } else if (stock.value !== null && !warehouseId) {
    errors.push('Select a default warehouse or provide Warehouse for rows with stock.');
  }

  const categoryId = groupName ? lookups?.categories.get(groupName.toLowerCase()) ?? null : null;
  if (groupName && !categoryId) errors.push(`Item Group '${groupName}' was not found or is inactive.`);
  const unitId = unitName ? lookups?.units.get(unitName.toLowerCase()) ?? null : null;

  return {
    itemCode,
    name,
    groupName,
    unitName,
    unitConversions,
    purchaseRate: purchase.value,
    sellingRate: selling.value ?? 0,
    valuationRate: effectiveValuationRate,
    priceListPrices,
    stockQuantity: stock.value,
    warehouseId,
    currentQuantity: null,
    isStockItem: parsedStockItem,
    categoryId,
    unitId,
    errors,
  };
}

export async function previewItemImport(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.file) return next(createError('Select a CSV or XLSX file to upload.', 400));
    const options = previewOptionsSchema.safeParse(req.body);
    if (!options.success) return next(createError(options.error.issues[0].message, 400));
    if (options.data.defaultWarehouseId) {
      const defaultWarehouse = await prisma.warehouse.findFirst({
        where: { id: options.data.defaultWarehouseId, isActive: true },
      });
      if (!defaultWarehouse) return next(createError('The selected default warehouse is not available.', 400));
    }
    const fileHash = createHash('sha256')
      .update(`${options.data.defaultWarehouseId ?? ''}:`)
      .update(req.file.buffer)
      .digest('hex');
    const existingBatch = await prisma.itemImportBatch.findUnique({
      where: { fileHash },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    if (existingBatch) {
      return res.status(200).json({
        batchId: existingBatch.batchKey,
        fileName: existingBatch.fileName,
        status: existingBatch.status,
        mode: existingBatch.mode,
        updatePrices: existingBatch.updatePrices,
        duplicateUpload: true,
        counts: {
          total: existingBatch.rows.length,
          valid: existingBatch.rows.filter((row) => row.status === 'pending').length,
          invalid: existingBatch.rows.filter((row) => row.status === 'invalid').length,
          successful: existingBatch.rows.filter((row) => row.status === 'success').length,
          failed: existingBatch.rows.filter((row) => row.status === 'failed' || row.status === 'invalid').length,
        },
        rows: existingBatch.rows.map(rowToResponse),
      });
    }
    const parsedFile = await readWorkbook(req.file);
    if (!parsedFile.headers.length) return next(createError('The file is missing a header row.', 400));
    if (parsedFile.records.length === 0) return next(createError('The file contains no item rows.', 400));
    if (parsedFile.records.length > MAX_ROWS) return next(createError(`A file may contain at most ${MAX_ROWS} item rows.`, 400));

    const headerIndexes = new Map(parsedFile.headers.map((header, index) => [normalizedHeader(header), index]));
    const requiredHeaders = ['itemcode', 'itemname', 'itemgroup', 'uom', 'sellingrate'];
    const missing = requiredHeaders.filter((header) => !headerIndexes.has(header));
    if (missing.length) {
      const labels: Record<string, string> = {
        itemcode: 'Item Code',
        itemname: 'Item Name',
        itemgroup: 'Item Group',
        uom: 'UOM',
        sellingrate: 'Selling Rate',
      };
      return next(createError(`Missing required columns: ${missing.map((header) => labels[header]).join(', ')}.`, 400));
    }

    const [warehouses, categories, units, priceLists] = await Promise.all([
      prisma.warehouse.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
      prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prisma.unit.findMany({ where: { isActive: true }, select: { id: true, name: true, abbreviation: true } }),
      prisma.priceList.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);
    const lookupMaps = {
      warehouses: new Map(warehouses.flatMap((warehouse) => [
        [warehouse.name.toLowerCase(), warehouse.id] as const,
        [warehouse.code.toLowerCase(), warehouse.id] as const,
      ])),
      categories: new Map(categories.map((category) => [category.name.toLowerCase(), category.id])),
      units: new Map(units.flatMap((unit) => [
        [unit.name.toLowerCase(), unit.id] as const,
        ...(unit.abbreviation ? [[unit.abbreviation.toLowerCase(), unit.id] as const] : []),
      ])),
    };
    const payloads: Array<{ rowNumber: number; payload: ImportPayload }> = [];
    const seenCodes = new Set<string>();
    for (const row of parsedFile.records) {
      const payload = resolveRow(row.values, headerIndexes, options.data.defaultWarehouseId, priceLists, lookupMaps);
      const codeKey = payload.itemCode.toLowerCase();
      if (codeKey && seenCodes.has(codeKey)) payload.errors.push(`Duplicate Item Code '${payload.itemCode}' in this file.`);
      if (codeKey) seenCodes.add(codeKey);
      payloads.push({ rowNumber: row.rowNumber, payload });
    }

    const requestedCodes = Array.from(new Set(payloads.map(({ payload }) => payload.itemCode).filter(Boolean)));
    const existingItems = requestedCodes.length
      ? await prisma.item.findMany({
          where: { OR: requestedCodes.map((itemCode) => ({ itemCode: { equals: itemCode, mode: 'insensitive' as const } })) },
          select: { id: true, itemCode: true, isStockItem: true, unit: { select: { name: true } } },
        })
      : [];
    const itemIds = new Map(existingItems.map((item) => [item.itemCode.toLowerCase(), item.id]));
    const stockItemByCode = new Map(existingItems.map((item) => [item.itemCode.toLowerCase(), item.isStockItem]));
    for (const { payload } of payloads) {
      const existing = existingItems.find((item) => item.itemCode.toLowerCase() === payload.itemCode.toLowerCase());
      if (existing && existing.unit.name.toLowerCase() !== payload.unitName.toLowerCase()) {
        payload.errors.push(`Base UOM cannot be changed from '${existing.unit.name}' to '${payload.unitName}' by import.`);
      }
      if (payload.stockQuantity !== null && stockItemByCode.get(payload.itemCode.toLowerCase()) === false) {
        payload.errors.push('Stock quantity cannot be supplied for an existing non-stock item.');
      }
    }
    const balancePairs = payloads.flatMap(({ payload }) => {
      const itemId = itemIds.get(payload.itemCode.toLowerCase());
      if (itemId && payload.stockQuantity !== null && payload.warehouseId !== null) {
        return [{ itemId, warehouseId: payload.warehouseId }];
      }
      return [];
    });
    const stockBalances = balancePairs.length
      ? await prisma.stockBalance.findMany({
          where: {
            itemId: { in: Array.from(new Set(balancePairs.map((pair) => pair.itemId))) },
            warehouseId: { in: Array.from(new Set(balancePairs.map((pair) => pair.warehouseId))) },
          },
          select: { itemId: true, warehouseId: true, quantity: true },
        })
      : [];
    const currentQuantities = new Map(stockBalances.map((balance) => [
      `${balance.itemId}-${balance.warehouseId}`,
      Number(balance.quantity),
    ]));
    for (const { payload } of payloads) {
      const itemId = itemIds.get(payload.itemCode.toLowerCase());
      if (itemId && payload.stockQuantity !== null && payload.warehouseId !== null) {
        payload.currentQuantity = currentQuantities.get(`${itemId}-${payload.warehouseId}`) ?? 0;
      } else if (payload.stockQuantity !== null) {
        payload.currentQuantity = 0;
      }
    }

    const batch = await prisma.itemImportBatch.create({
      data: {
        batchKey: randomUUID(),
        fileHash,
        fileName: req.file.originalname.slice(0, 255),
        updatePrices: options.data.updatePrices === 'true',
        createdBy: req.user?.id,
        rows: {
          create: payloads.map(({ rowNumber, payload }) => ({
            rowNumber,
            payload: payload as unknown as Prisma.InputJsonValue,
            status: payload.errors.length ? 'invalid' : 'pending',
            errors: payload.errors as Prisma.InputJsonValue,
          })),
        },
      },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });

    return res.status(201).json({
      batchId: batch.batchKey,
      fileName: batch.fileName,
      status: batch.status,
      updatePrices: batch.updatePrices,
      counts: {
        total: batch.rows.length,
        valid: batch.rows.filter((row) => row.status === 'pending').length,
        invalid: batch.rows.filter((row) => row.status === 'invalid').length,
      },
      rows: batch.rows.map(rowToResponse),
    });
  } catch (err) {
    return next(err);
  }
}

const confirmSchema = z.object({
  batchId: z.string().uuid(),
  mode: z.enum(['opening_stock', 'material_receipt']),
  updatePrices: z.boolean(),
});

export async function confirmItemImport(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const { batchId, mode, updatePrices } = parsed.data;
    const batch = await prisma.itemImportBatch.findUnique({
      where: { batchKey: batchId },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!batch) return next(createError('Import batch not found.', 404));
    if (batch.status === 'completed') {
      return res.json({
        batchId: batch.batchKey,
        status: batch.status,
        mode: batch.mode,
        rows: batch.rows.map(rowToResponse),
        duplicateConfirmation: true,
      });
    }
    let effectiveMode: 'opening_stock' | 'material_receipt' = mode;
    let effectiveUpdatePrices = updatePrices;
    if (batch.status === 'processing') {
      if (batch.mode !== 'opening_stock' && batch.mode !== 'material_receipt') {
        return next(createError('The import batch is missing its inventory mode.', 409));
      }
      effectiveMode = batch.mode;
      effectiveUpdatePrices = batch.updatePrices;
    }

    const rowsWithStock = batch.rows.some((row) => {
      const payload = row.payload as unknown as ImportPayload;
      return row.status === 'pending' && payload.stockQuantity !== null;
    });
    if (rowsWithStock && !(await hasInventoryPermissions(req))) {
      return next(createError('Inventory create and approve permissions are required to post stock.', 403));
    }

    if (batch.status === 'preview') {
      const claimed = await prisma.itemImportBatch.updateMany({
        where: { id: batch.id, status: 'preview' },
        data: { status: 'processing', mode, updatePrices },
      });
      if (claimed.count !== 1) {
        const latest = await prisma.itemImportBatch.findUnique({ where: { id: batch.id } });
        if (latest?.status === 'completed') {
          const completed = await prisma.itemImportBatch.findUnique({
            where: { id: batch.id },
            include: { rows: { orderBy: { rowNumber: 'asc' } } },
          });
          if (completed) {
            return res.json({
              batchId: completed.batchKey,
              status: completed.status,
              mode: completed.mode,
              rows: completed.rows.map(rowToResponse),
              duplicateConfirmation: true,
            });
          }
        }
        if (latest?.status !== 'processing') {
          return next(createError('This import batch cannot be processed in its current state.', 409));
        }
        if (latest.mode !== 'opening_stock' && latest.mode !== 'material_receipt') {
          return next(createError('The import batch is missing its inventory mode.', 409));
        }
        effectiveMode = latest.mode;
        effectiveUpdatePrices = latest.updatePrices;
      }
    }

    for (const row of batch.rows) {
      if (row.status !== 'pending') continue;
      const payload = row.payload as unknown as ImportPayload;
      try {
        await prisma.$transaction(async (tx) => {
          const claim = await tx.itemImportRow.updateMany({
            where: { id: row.id, status: 'pending' },
            data: { status: 'processing' },
          });
          if (claim.count !== 1) return;

          let item = await tx.item.findFirst({
            where: { itemCode: { equals: payload.itemCode, mode: 'insensitive' } },
          });
          const isNewItem = !item;
          const isStockItem = item?.isStockItem ?? payload.isStockItem ?? true;
          if (payload.stockQuantity !== null && !isStockItem) {
            throw new Error('Stock quantity cannot be posted for a non-stock item.');
          }
          if (item && payload.isStockItem === false) {
            const stockedBalances = await tx.stockBalance.count({
              where: { itemId: item.id, quantity: { gt: 0 } },
            });
            if (stockedBalances > 0) throw new Error('An item with existing stock cannot be changed to a non-stock item.');
          }

          const itemFields = {
            name: payload.name,
            categoryId: payload.categoryId,
            unitId: payload.unitId!,
            ...(effectiveUpdatePrices ? {
              sellingPrice: payload.sellingRate,
              ...(payload.valuationRate !== null ? { purchasePrice: payload.valuationRate } : {}),
            } : {}),
          };

          let baseUnit = payload.unitId
            ? await tx.unit.findUnique({ where: { id: payload.unitId } })
            : null;
          if (!baseUnit) {
            baseUnit = await tx.unit.findFirst({
              where: { name: { equals: payload.unitName, mode: 'insensitive' } },
            });
          }
          if (!baseUnit) baseUnit = await tx.unit.create({ data: { name: payload.unitName } });
          itemFields.unitId = baseUnit.id;

          if (!item) {
            item = await tx.item.create({
              data: {
                ...itemFields,
                itemCode: payload.itemCode,
                createdBy: req.user?.id,
                isStockItem: payload.isStockItem ?? true,
              },
            });
          } else {
            const priceChanged = effectiveUpdatePrices && (
              Number(item.sellingPrice) !== payload.sellingRate ||
              (payload.valuationRate !== null && Number(item.purchasePrice) !== payload.valuationRate)
            );
            if (priceChanged) {
              await tx.itemPriceHistory.create({
                data: {
                  itemId: item.id,
                  oldPurchase: item.purchasePrice,
                  newPurchase: payload.valuationRate ?? item.purchasePrice,
                  oldSelling: item.sellingPrice,
                  newSelling: payload.sellingRate,
                  changedBy: req.user?.id,
                  reason: `Bulk item import ${batch.batchKey}`,
                },
              });
            }
            item = await tx.item.update({
              where: { id: item.id },
              data: {
                ...itemFields,
                ...(payload.isStockItem !== null ? { isStockItem: payload.isStockItem } : {}),
              },
            });
          }

          for (const conversion of payload.unitConversions ?? []) {
            let convertedUnit = await tx.unit.findFirst({
              where: { name: { equals: conversion.unitName, mode: 'insensitive' } },
            });
            if (!convertedUnit) convertedUnit = await tx.unit.create({ data: { name: conversion.unitName } });
            if (convertedUnit.id === baseUnit.id) {
              throw new Error(`Alternate UOM '${conversion.unitName}' cannot match the item's base UOM.`);
            }
            await tx.itemUnitConversion.upsert({
              where: { itemId_unitId: { itemId: item.id, unitId: convertedUnit.id } },
              create: { itemId: item.id, unitId: convertedUnit.id, factor: conversion.factor },
              update: { factor: conversion.factor },
            });
          }

          if (effectiveUpdatePrices) {
            for (const listPrice of payload.priceListPrices ?? []) {
              await tx.priceListItem.upsert({
                where: {
                  priceListId_itemId: { priceListId: listPrice.priceListId, itemId: item.id },
                },
                create: {
                  priceListId: listPrice.priceListId,
                  itemId: item.id,
                  unitId: item.unitId,
                  price: listPrice.price,
                },
                update: { price: listPrice.price, unitId: item.unitId, isActive: true },
              });
            }
          }

          if (isNewItem && payload.stockQuantity === null && item.isStockItem) {
            const defaultWarehouse = await tx.warehouse.findFirst({
              where: { isDefault: true, isActive: true },
            });
            if (defaultWarehouse) {
              await tx.stockBalance.create({
                data: {
                  itemId: item.id,
                  warehouseId: defaultWarehouse.id,
                  quantity: 0,
                  averageCost: payload.valuationRate ?? 0,
                },
              });
            }
          }

          let finalQuantity: number | null = null;
          let currentQuantity: number | null = null;
          let movementId: bigint | null = null;
          if (payload.stockQuantity !== null && payload.warehouseId !== null) {
            const warehouse = await tx.warehouse.findFirst({
              where: { id: payload.warehouseId, isActive: true },
            });
            if (!warehouse) throw new Error('Selected warehouse was not found or is inactive.');

            let balance = await tx.stockBalance.findUnique({
              where: { itemId_warehouseId: { itemId: item.id, warehouseId: warehouse.id } },
            });
            currentQuantity = Number(balance?.quantity ?? 0);
            const quantity = payload.stockQuantity;
            finalQuantity = effectiveMode === 'opening_stock' ? quantity : currentQuantity + quantity;
            if (effectiveMode === 'material_receipt' && quantity === 0) {
              finalQuantity = currentQuantity;
            } else {
              let averageCost = Number(balance?.averageCost ?? 0);
              if (payload.valuationRate !== null) {
                if (effectiveMode === 'opening_stock') {
                  averageCost = payload.valuationRate;
                } else if (finalQuantity > 0) {
                  averageCost = (
                    currentQuantity * averageCost + quantity * payload.valuationRate
                  ) / finalQuantity;
                }
              }

              if (!balance) {
                balance = await tx.stockBalance.create({
                  data: { itemId: item.id, warehouseId: warehouse.id, quantity: finalQuantity, averageCost },
                });
              } else {
                await tx.stockBalance.update({
                  where: { id: balance.id },
                  data: { quantity: finalQuantity, averageCost },
                });
              }
              const difference = finalQuantity - currentQuantity;
              if (difference !== 0) {
                const movement = await tx.inventoryMovement.create({
                  data: {
                    itemId: item.id,
                    warehouseId: warehouse.id,
                    movementType: effectiveMode === 'opening_stock' ? 'opening' : 'purchase',
                    quantity: difference,
                    unitCost: payload.valuationRate ?? Number(balance.averageCost),
                    referenceType: 'item_import_batch',
                    referenceId: batch.id,
                    narration: `Bulk import ${batch.batchKey} row ${row.rowNumber} (${effectiveMode})`,
                    createdBy: req.user?.id,
                  },
                });
                movementId = movement.id;
              }
            }
          }

          await tx.itemImportRow.update({
            where: { id: row.id },
            data: {
              status: 'success',
              itemId: item.id,
              transactionId: batch.id,
              errors: Prisma.JsonNull,
              result: {
                action: isNewItem ? 'created' : 'updated',
                currentQuantity,
                finalQuantity,
                movementId: movementId?.toString() ?? null,
              },
            },
          });
          await tx.auditLog.create({
            data: {
              userId: req.user?.id,
              username: req.user?.username,
              action: 'BULK_IMPORT_ITEM',
              entity: 'items',
              entityId: String(item.id),
              newValues: {
                batchKey: batch.batchKey,
                itemCode: payload.itemCode,
                stockMode: payload.stockQuantity === null ? null : effectiveMode,
                stockQuantity: payload.stockQuantity,
                warehouseId: payload.warehouseId,
              },
            },
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to import this row.';
        await prisma.itemImportRow.updateMany({
          where: { id: row.id, status: 'pending' },
          data: { status: 'failed', errors: [message] },
        });
      }
    }

    const completed = await prisma.itemImportBatch.update({
      where: { id: batch.id },
      data: { status: 'completed', completedAt: new Date() },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    return res.json({
      batchId: completed.batchKey,
      status: completed.status,
      mode: completed.mode,
      counts: {
        total: completed.rows.length,
        successful: completed.rows.filter((row) => row.status === 'success').length,
        failed: completed.rows.filter((row) => row.status === 'failed' || row.status === 'invalid').length,
      },
      rows: completed.rows.map(rowToResponse),
    });
  } catch (err) {
    return next(err);
  }
}

export async function getItemImport(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const batchId = String(req.params.batchId);
    const batch = await prisma.itemImportBatch.findUnique({
      where: { batchKey: batchId },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!batch) return next(createError('Import batch not found.', 404));
    return res.json({
      batchId: batch.batchKey,
      fileName: batch.fileName,
      status: batch.status,
      mode: batch.mode,
      updatePrices: batch.updatePrices,
      rows: batch.rows.map(rowToResponse),
    });
  } catch (err) {
    return next(err);
  }
}
