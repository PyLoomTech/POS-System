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
  purchasePrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  minimumStock: z.number().min(0).default(0),
  reorderLevel: z.number().min(0).default(0),
});

const include = {
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, abbreviation: true } },
  stockBalances: {
    include: { warehouse: { select: { id: true, name: true, code: true } } }
  },
};

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

    const codeExists = await prisma.item.findUnique({ where: { itemCode: data.itemCode } });
    if (codeExists) return next(createError(`Item code '${data.itemCode}' already exists.`, 409));
    if (data.barcode) {
      const barcodeExists = await prisma.item.findFirst({ where: { barcode: data.barcode } });
      if (barcodeExists) return next(createError(`Barcode '${data.barcode}' already assigned.`, 409));
    }

    const item = await prisma.item.create({ data: { ...data, createdBy: req.user?.id }, include });

    // Initialize stock balance in default warehouse
    const defWarehouse = await prisma.warehouse.findFirst({ where: { isDefault: true } });
    if (defWarehouse) {
      await prisma.stockBalance.create({ data: { itemId: item.id, warehouseId: defWarehouse.id } });
    }

    await prisma.auditLog.create({
      data: { userId: req.user?.id, username: req.user?.username, action: 'CREATE_ITEM',
        entity: 'items', entityId: String(item.id), newValues: data as any },
    });
    return res.status(201).json(item);
  } catch (err) { return next(err); }
}

export async function updateItem(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const parsed = itemSchema.partial().safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    const old = await prisma.item.findUnique({ where: { id } });
    if (!old) return next(createError('Item not found.', 404));

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

    const item = await prisma.item.update({ where: { id }, data, include });
    await prisma.auditLog.create({
      data: { userId: req.user?.id, username: req.user?.username, action: 'UPDATE_ITEM',
        entity: 'items', entityId: String(id), oldValues: old as any, newValues: data as any },
    });
    return res.json(item);
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
