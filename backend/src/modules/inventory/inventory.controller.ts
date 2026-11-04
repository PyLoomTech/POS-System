import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';
import { getNextNumber } from '../../utils/numbering';

const adjustmentSchema = z.object({
  warehouseId: z.number().int().positive(),
  adjustmentDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  reason: z.string().optional().nullable(),
  items: z.array(z.object({
    itemId: z.number().int().positive(),
    actualQuantity: z.number().min(0),
    unitCost: z.number().min(0).optional().nullable(),
  })).min(1, 'At least one item is required'),
});

export async function getStockLevels(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, warehouseId, page = 1, limit = 100 } = req.query;
    const where: any = {};
    if (warehouseId) where.warehouseId = Number(warehouseId);
    if (search) {
      where.item = {
        OR: [
          { name: { contains: String(search), mode: 'insensitive' } },
          { itemCode: { contains: String(search), mode: 'insensitive' } },
          { barcode: { contains: String(search) } },
        ],
      };
    }

    const [total, rows] = await Promise.all([
      prisma.stockBalance.count({ where }),
      prisma.stockBalance.findMany({
        where,
        include: { item: { include: { unit: true } }, warehouse: true },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { item: { name: 'asc' } },
      }),
    ]);

    return res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) { return next(err); }
}

export async function getStockLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const itemId = Number(req.params.itemId);
    const { from, to } = req.query;

    const item = await prisma.item.findUnique({ where: { id: itemId }, include: { unit: true } });
    if (!item) return next(createError('Item not found.', 404));

    const where: any = { itemId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }

    const movements = await prisma.inventoryMovement.findMany({
      where,
      include: { warehouse: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    let running = 0;
    const entries = movements.map((m) => {
      running += Number(m.quantity);
      return { ...m, runningBalance: running };
    });

    return res.json({ item, closingBalance: running, entries });
  } catch (err) { return next(err); }
}

export async function getLowStockAlerts(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT sb.id,
             i.id AS "itemId",
             i.item_code AS "itemCode",
             i.name,
             sb.quantity::float AS quantity,
             i.reorder_level::float AS "reorderLevel",
             i.minimum_stock::float AS "minimumStock",
             w.code AS "warehouseCode",
             w.name AS warehouse
      FROM stock_balances sb
      JOIN items i ON i.id = sb.item_id
      JOIN warehouses w ON w.id = sb.warehouse_id
      WHERE i.is_active = true AND sb.quantity <= i.reorder_level
      ORDER BY sb.quantity ASC
    `;
    return res.json({ data: rows, total: rows.length });
  } catch (err) { return next(err); }
}

export async function createAdjustment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = adjustmentSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    const adjNumber = await getNextNumber('STOCK_ADJ');

    const result = await prisma.$transaction(async (tx) => {
      const lines = [];
      for (const li of data.items) {
        const balance = await tx.stockBalance.findFirst({
          where: { itemId: li.itemId, warehouseId: data.warehouseId },
        });
        const systemQty = Number(balance?.quantity || 0);
        lines.push({
          itemId: li.itemId,
          systemQuantity: systemQty,
          actualQuantity: li.actualQuantity,
          difference: li.actualQuantity - systemQty,
          unitCost: li.unitCost ?? Number(balance?.averageCost || 0),
        });
      }

      return tx.stockAdjustment.create({
        data: {
          adjNumber,
          warehouseId: data.warehouseId,
          adjustmentDate: new Date(data.adjustmentDate),
          reason: data.reason || null,
          status: 'pending',
          createdBy: req.user?.id,
          items: { create: lines },
        },
        include: { items: { include: { item: true } }, warehouse: true },
      });
    });

    return res.status(201).json(result);
  } catch (err) { return next(err); }
}

export async function approveAdjustment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const adj = await prisma.stockAdjustment.findUnique({ where: { id }, include: { items: true } });
    if (!adj) return next(createError('Adjustment not found.', 404));
    if (adj.status === 'approved') return next(createError('Adjustment already approved.', 400));

    await prisma.$transaction(async (tx) => {
      for (const line of adj.items) {
        const diff = Number(line.difference || 0);
        if (diff === 0) continue;

        let balance = await tx.stockBalance.findFirst({
          where: { itemId: line.itemId, warehouseId: adj.warehouseId },
        });
        if (!balance) {
          balance = await tx.stockBalance.create({
            data: { itemId: line.itemId, warehouseId: adj.warehouseId, quantity: 0, averageCost: line.unitCost || 0 },
          });
        }
        await tx.stockBalance.update({
          where: { id: balance.id },
          data: { quantity: { increment: diff } },
        });
        await tx.inventoryMovement.create({
          data: {
            itemId: line.itemId,
            warehouseId: adj.warehouseId,
            movementType: 'adjustment',
            quantity: diff,
            unitCost: Number(line.unitCost || 0),
            referenceType: 'stock_adjustment',
            referenceId: BigInt(adj.id),
            narration: `Adjustment ${adj.adjNumber}`,
            createdBy: req.user?.id,
          },
        });
      }

      await tx.stockAdjustment.update({
        where: { id },
        data: { status: 'approved', approvedBy: req.user?.id, approvedAt: new Date() },
      });

      // Post accounting journal for the net adjustment value
      let totalValue = 0;
      for (const line of adj.items) {
        totalValue += Number(line.difference || 0) * Number(line.unitCost || 0);
      }
      if (Math.abs(totalValue) > 0.001) {
        const accounts = await tx.account.findMany({ where: { accountCode: { in: ['11400', '52000'] } } });
        const map: Record<string, number> = {};
        for (const a of accounts) map[a.accountCode] = a.id;

        if (map['11400'] && map['52000']) {
          const amount = parseFloat(Math.abs(totalValue).toFixed(2));
          const jvNumber = await getNextNumber('JOURNAL_VOUCHER');
          await tx.journalEntry.create({
            data: {
              voucherNumber: jvNumber,
              voucherDate: adj.adjustmentDate,
              voucherType: 'adjustment',
              narration: `Stock Adjustment ${adj.adjNumber}`,
              status: 'posted',
              referenceType: 'stock_adjustment',
              referenceId: BigInt(adj.id),
              createdBy: req.user?.id,
              postedBy: req.user?.id,
              lines: {
                create: totalValue > 0
                  ? [
                      { accountId: map['11400'], debit: amount, credit: 0, narration: 'Inventory increase' },
                      { accountId: map['52000'], debit: 0, credit: amount, narration: 'Inventory adjustment gain' },
                    ]
                  : [
                      { accountId: map['52000'], debit: amount, credit: 0, narration: 'Inventory adjustment loss' },
                      { accountId: map['11400'], debit: 0, credit: amount, narration: 'Inventory decrease' },
                    ],
              },
            },
          });
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id, username: req.user?.username, action: 'APPROVE_STOCK_ADJUSTMENT',
        entity: 'stock_adjustments', entityId: String(id),
        oldValues: { status: 'pending' }, newValues: { status: 'approved' },
      },
    });

    return res.json({ message: 'Adjustment approved successfully.' });
  } catch (err) { return next(err); }
}
