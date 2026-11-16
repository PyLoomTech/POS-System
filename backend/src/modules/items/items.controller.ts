import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';

const itemSchema = z.object({
  itemCode: z.string().min(1).max(100),
  barcode: z.string().max(100).optional().nullable(),
  name: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  brandId: z.number().int().positive().optional().nullable(),
  unitId: z.number().int().positive(),
  taxRateId: z.number().int().positive().optional().nullable(),
  taxType: z.enum(['taxable_exclusive', 'taxable_inclusive', 'non_taxable', 'zero_rated', 'exempt']).default('taxable_exclusive'),
  isStockItem: z.boolean().default(true),
  purchasePrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  unitConversions: z.array(z.object({
    unitId: z.number().int().positive(),
    factor: z.number().positive(),
  })).optional(),
  priceListPrices: z.array(z.object({
    priceListId: z.number().int().positive(),
    price: z.number().min(0),
    unitId: z.number().int().positive().nullable().optional(),
  })).optional(),
  minimumStock: z.number().min(0).default(0),
  reorderLevel: z.number().min(0).default(0),
});

const include = {
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, abbreviation: true } },
  unitConversions: {
    include: { unit: { select: { id: true, name: true, abbreviation: true } } },
  },
  priceListPrices: {
    where: { isActive: true },
    select: {
      id: true,
      priceListId: true,
      unitId: true,
      price: true,
      unit: { select: { id: true, name: true, abbreviation: true } },
      priceList: { select: { id: true, name: true, code: true } },
    },
  },
  stockBalances: {
    include: { warehouse: { select: { id: true, name: true, code: true } } }
  },
};

type PriceListPriceInput = { priceListId: number; price: number; unitId?: number | null };
type UnitConversionInput = { unitId: number; factor: number };

async function validatePriceLists(entries: PriceListPriceInput[] | undefined) {
  if (!entries?.length) return;
  const ids = entries.map((entry) => entry.priceListId);
  if (new Set(ids).size !== ids.length) {
    throw createError('Each price list can only be assigned once per item.', 400);
  }
  const activeLists = await prisma.priceList.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true },
  });
  if (activeLists.length !== ids.length) {
    throw createError('One or more selected price lists are not available.', 400);
  }
}

async function validateItemUnits(baseUnitId: number, conversions: UnitConversionInput[]) {
  const conversionUnitIds = conversions.map((conversion) => conversion.unitId);
  if (conversionUnitIds.includes(baseUnitId) || new Set(conversionUnitIds).size !== conversionUnitIds.length) {
    throw createError('Choose a distinct alternate UOM for each conversion.', 400);
  }
  const activeUnits = await prisma.unit.findMany({
    where: { id: { in: [baseUnitId, ...conversionUnitIds] }, isActive: true },
    select: { id: true },
  });
  if (activeUnits.length !== new Set([baseUnitId, ...conversionUnitIds]).size) {
    throw createError('One or more selected UOMs are not available.', 400);
  }
}

function validatePriceListUnits(
  entries: Array<{ unitId?: number | null }> | undefined,
  baseUnitId: number,
  conversions: UnitConversionInput[],
) {
  const allowedUnitIds = new Set([baseUnitId, ...conversions.map((conversion) => conversion.unitId)]);
  for (const entry of entries ?? []) {
    if (entry.unitId !== undefined && entry.unitId !== null && !allowedUnitIds.has(entry.unitId)) {
      throw createError('A price-list UOM must be the item base UOM or one of its configured conversions.', 400);
    }
  }
}

export async function listPriceLists(_req: Request, res: Response, next: NextFunction) {
  try {
    const priceLists = await prisma.priceList.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return res.json(priceLists.map((list) => ({
      id: list.id,
      code: list.code,
      name: list.name,
      description: list.description,
      isDefault: list.isDefault,
    })));
  } catch (err) {
    return next(err);
  }
}

export async function createPriceList(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = z.object({
      code: z.string().trim().min(1).max(50),
      name: z.string().trim().min(1).max(255),
      description: z.string().trim().optional().nullable(),
      isDefault: z.boolean().default(false),
    }).safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));

    const priceList = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.priceList.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.priceList.create({ data: parsed.data });
    });
    return res.status(201).json(priceList);
  } catch (err) {
    return next(err);
  }
}

export async function listItems(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, category, active, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (active !== undefined) where.isActive = active === 'true';
    if (category) where.categoryId = Number(category);
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { itemCode: { contains: String(search), mode: 'insensitive' } },
        { barcode: { contains: String(search) } },
      ];
    }
    const [total, items] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({ where, include, skip: (Number(page) - 1) * Number(limit), take: Number(limit), orderBy: { name: 'asc' } }),
    ]);
    return res.json({ data: items, total, page: Number(page), limit: Number(limit) });
  } catch (err) { return next(err); }
}

export async function searchItems(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, limit = 20 } = req.query;
    if (!q) return res.json([]);
    const items = await prisma.item.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: String(q), mode: 'insensitive' } },
          { itemCode: { contains: String(q), mode: 'insensitive' } },
          { barcode: { contains: String(q) } },
        ],
      },
      include,
      take: Number(limit),
      orderBy: { name: 'asc' },
    });
    return res.json(items);
  } catch (err) { return next(err); }
}

export async function getItemByBarcode(req: Request, res: Response, next: NextFunction) {
  try {
    const barcode = String(req.params.barcode);
    let item = await prisma.item.findFirst({ where: { barcode, isActive: true }, include });
    if (!item) {
      // Try alternate barcodes
      const alt = await prisma.itemBarcode.findFirst({ where: { barcode }, include: { item: { include } } });
      if (alt) item = alt.item as any;
    }
    if (!item) return next(createError('Item not found for barcode.', 404));
    return res.json(item);
  } catch (err) { return next(err); }
}

export async function getItem(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await prisma.item.findUnique({ where: { id: Number(req.params.id) }, include });
    if (!item) return next(createError('Item not found.', 404));
    return res.json(item);
  } catch (err) { return next(err); }
}

export async function listTaxRates(_req: Request, res: Response, next: NextFunction) {
  try {
    const rates = await prisma.taxRate.findMany({
      where: { isActive: true },
      orderBy: { rate: 'desc' },
    });
    return res.json(rates.map((r) => ({
      id: r.id, name: r.name, rate: Number(r.rate), isDefault: r.isDefault,
    })));
  } catch (err) { return next(err); }
}

export async function createItem(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;
    const { priceListPrices, unitConversions = [], ...itemData } = data;
    await validatePriceLists(priceListPrices);
    await validateItemUnits(itemData.unitId, unitConversions);
    validatePriceListUnits(priceListPrices, itemData.unitId, unitConversions);

    const codeExists = await prisma.item.findUnique({ where: { itemCode: data.itemCode } });
    if (codeExists) return next(createError(`Item code '${data.itemCode}' already exists.`, 409));
    if (data.barcode) {
      const barcodeExists = await prisma.item.findFirst({ where: { barcode: data.barcode } });
      if (barcodeExists) return next(createError(`Barcode '${data.barcode}' already assigned.`, 409));
    }

    const item = await prisma.item.create({ data: { ...itemData, createdBy: req.user?.id } });
    if (unitConversions.length) {
      await prisma.itemUnitConversion.createMany({
        data: unitConversions.map((conversion) => ({ ...conversion, itemId: item.id })),
      });
    }
    if (priceListPrices?.length) {
      await prisma.priceListItem.createMany({
        data: priceListPrices.map((entry) => ({
          ...entry,
          unitId: entry.unitId ?? item.unitId,
          itemId: item.id,
        })),
      });
    }

    // Initialize stock balance in default warehouse
    const defWarehouse = await prisma.warehouse.findFirst({ where: { isDefault: true } });
    if (defWarehouse) {
      await prisma.stockBalance.create({ data: { itemId: item.id, warehouseId: defWarehouse.id } });
    }

    await prisma.auditLog.create({
      data: { userId: req.user?.id, username: req.user?.username, action: 'CREATE_ITEM',
        entity: 'items', entityId: String(item.id), newValues: data as any },
    });
    const savedItem = await prisma.item.findUnique({ where: { id: item.id }, include });
    return res.status(201).json(savedItem);
  } catch (err) { return next(err); }
}

export async function updateItem(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const parsed = itemSchema.partial().safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;
    const { priceListPrices, unitConversions, ...itemData } = data;
    await validatePriceLists(priceListPrices);

    const old = await prisma.item.findUnique({ where: { id }, include: { unitConversions: true } });
    if (!old) return next(createError('Item not found.', 404));

    const baseUnitId = itemData.unitId ?? old.unitId;
    const effectiveConversions = unitConversions ?? old.unitConversions.map((conversion) => ({
      unitId: conversion.unitId,
      factor: Number(conversion.factor),
    }));
    await validateItemUnits(baseUnitId, effectiveConversions);
    const retainedPriceListUnits = priceListPrices === undefined && unitConversions !== undefined
      ? await prisma.priceListItem.findMany({ where: { itemId: id }, select: { unitId: true } })
      : priceListPrices;
    validatePriceListUnits(retainedPriceListUnits, baseUnitId, effectiveConversions);

    if (data.barcode && data.barcode !== old.barcode) {
      const dup = await prisma.item.findFirst({ where: { barcode: data.barcode, id: { not: id } } });
      if (dup) return next(createError(`Barcode '${data.barcode}' already assigned.`, 409));
    }

    // Track price changes
    if ((data.purchasePrice !== undefined && Number(data.purchasePrice) !== Number(old.purchasePrice)) ||
        (data.sellingPrice !== undefined && Number(data.sellingPrice) !== Number(old.sellingPrice))) {
      await prisma.itemPriceHistory.create({
        data: {
          itemId: id,
          oldPurchase: old.purchasePrice,
          newPurchase: data.purchasePrice ?? old.purchasePrice,
          oldSelling: old.sellingPrice,
          newSelling: data.sellingPrice ?? old.sellingPrice,
          changedBy: req.user?.id,
        },
      });
    }

    await prisma.item.update({ where: { id }, data: itemData });
    if (unitConversions !== undefined || priceListPrices !== undefined) {
      await prisma.$transaction(async (tx) => {
        if (priceListPrices !== undefined) {
          await tx.priceListItem.deleteMany({ where: { itemId: id } });
        }
        if (unitConversions !== undefined) {
          await tx.itemUnitConversion.deleteMany({ where: { itemId: id } });
          if (unitConversions.length) {
            await tx.itemUnitConversion.createMany({
              data: unitConversions.map((conversion) => ({ ...conversion, itemId: id })),
            });
          }
        }
        if (priceListPrices?.length) {
          await tx.priceListItem.createMany({
            data: priceListPrices.map((entry) => ({
              ...entry,
              unitId: entry.unitId ?? baseUnitId,
              itemId: id,
            })),
          });
        }
      });
    }
    await prisma.auditLog.create({
      data: { userId: req.user?.id, username: req.user?.username, action: 'UPDATE_ITEM',
        entity: 'items', entityId: String(id), oldValues: old as any, newValues: data as any },
    });
    const savedItem = await prisma.item.findUnique({ where: { id }, include });
    return res.json(savedItem);
  } catch (err) { return next(err); }
}

// ─── Item image upload ───────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'D:/Pyloom POS System/uploads';
const imageDir = path.join(UPLOAD_DIR, 'images');

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(imageDir, { recursive: true });
    cb(null, imageDir);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

export const uploadItemImageMiddleware = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(createError('Only image files (jpg, png, webp, gif) are allowed.', 400));
  },
}).single('image');

export async function uploadItemImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) return next(createError('No image file uploaded.', 400));
    const url = `/uploads/images/${req.file.filename}`;
    return res.status(201).json({ url });
  } catch (err) { return next(err); }
}
