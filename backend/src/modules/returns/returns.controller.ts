import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';
import { getNextNumber } from '../../utils/numbering';

const salesReturnSchema = z.object({
  originalInvoiceId: z.number().int().positive(),
  returnDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  returnReason: z.string().optional().nullable(),
  refundMethod: z.enum(['cash', 'bank_transfer', 'card', 'digital_wallet', 'qr', 'credit_note']).default('cash'),
  items: z.array(z.object({
    originalItemId: z.number().int().positive(),
    returnedQty: z.number().positive(),
    disposition: z.enum(['resaleable', 'damaged', 'expired', 'write_off']).default('resaleable'),
  })).min(1, 'At least one return item is required'),
});

const purchaseReturnSchema = z.object({
  originalInvoiceId: z.number().int().positive(),
  returnDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  returnReason: z.string().optional().nullable(),
  items: z.array(z.object({
    originalItemId: z.number().int().positive(),
    returnedQty: z.number().positive(),
  })).min(1, 'At least one return item is required'),
});

export async function listSalesReturns(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, customerId, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (from || to) {
      where.returnDate = {};
      if (from) where.returnDate.gte = new Date(String(from));
      if (to) where.returnDate.lte = new Date(String(to));
    }
    if (customerId) where.customerId = Number(customerId);

    const [total, rows] = await Promise.all([
      prisma.salesReturn.count({ where }),
      prisma.salesReturn.findMany({
        where,
        include: { customer: { select: { id: true, name: true } } },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { returnDate: 'desc' },
      }),
    ]);
    return res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) { return next(err); }
}

export async function getSalesReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const id = BigInt(String(req.params.id));
    const ret = await prisma.salesReturn.findUnique({
      where: { id },
      include: {
        customer: true,
        originalInvoice: { select: { id: true, invoiceNumber: true, invoiceDate: true } },
        items: { include: { item: true } },
        creditNotes: true,
      },
    });
    if (!ret) return next(createError('Sales return not found.', 404));
    return res.json(ret);
  } catch (err) { return next(err); }
}

export async function createSalesReturn(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = salesReturnSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: BigInt(data.originalInvoiceId) },
      include: { items: true },
    });
    if (!invoice) return next(createError('Original sales invoice not found.', 404));
    if (invoice.status === 'cancelled') return next(createError('Cannot return a cancelled invoice.', 400));

    const returnNumber = await getNextNumber('SALES_RETURN');

    const result = await prisma.$transaction(async (tx) => {
      let subtotal = new Decimal(0);
      let taxTotal = new Decimal(0);
      const lineData = [];

      for (const li of data.items) {
        const orig = invoice.items.find((i) => i.id === BigInt(li.originalItemId));
        if (!orig) throw createError(`Invoice line ${li.originalItemId} not found on this invoice.`, 404);

        const remaining = new Decimal(orig.quantity.toString()).minus(orig.returnedQty.toString());
        if (new Decimal(li.returnedQty).greaterThan(remaining)) {
          throw createError(`Return quantity exceeds remaining quantity for a line item.`, 400);
        }

        const perUnit = new Decimal(orig.lineTotal.toString()).dividedBy(orig.quantity.toString());
        const perUnitTax = new Decimal(orig.taxAmount.toString()).dividedBy(orig.quantity.toString());
        const lineTotal = perUnit.times(li.returnedQty);
        const taxAmount = perUnitTax.times(li.returnedQty);

        subtotal = subtotal.plus(lineTotal.minus(taxAmount));
        taxTotal = taxTotal.plus(taxAmount);

        lineData.push({
          originalItemId: orig.id,
          itemId: orig.itemId,
          returnedQty: li.returnedQty,
          unitPrice: orig.unitPrice,
          taxAmount: taxAmount.toDecimalPlaces(4).toNumber(),
          lineTotal: lineTotal.toDecimalPlaces(4).toNumber(),
          disposition: li.disposition as any,
          costAtSale: orig.costAtSale,
        });
      }

      const totalAmount = subtotal.plus(taxTotal).toDecimalPlaces(2);

      const salesReturn = await tx.salesReturn.create({
        data: {
          returnNumber,
          originalInvoiceId: invoice.id,
          returnDate: new Date(data.returnDate),
          customerId: invoice.customerId,
          returnReason: data.returnReason || null,
          subtotal: subtotal.toDecimalPlaces(2).toNumber(),
          taxAmount: taxTotal.toDecimalPlaces(2).toNumber(),
          totalAmount: totalAmount.toNumber(),
          refundMethod: data.refundMethod,
          refundAmount: data.refundMethod === 'credit_note' ? 0 : totalAmount.toNumber(),
          status: 'completed',
          processedBy: req.user?.id,
          items: { create: lineData },
        },
      });

      // Restock resaleable items and update returned quantities
      const warehouse = await tx.warehouse.findFirst({ where: { isDefault: true } })
        || await tx.warehouse.findFirst();
      for (const line of lineData) {
        await tx.salesInvoiceItem.update({
          where: { id: line.originalItemId },
          data: { returnedQty: { increment: line.returnedQty } },
        });

        if (line.disposition === 'resaleable' && warehouse) {
          const balance = await tx.stockBalance.findFirst({
            where: { itemId: line.itemId, warehouseId: warehouse.id },
          });
          if (balance) {
            await tx.stockBalance.update({
              where: { id: balance.id },
              data: { quantity: { increment: line.returnedQty } },
            });
          } else {
            await tx.stockBalance.create({
              data: { itemId: line.itemId, warehouseId: warehouse.id, quantity: line.returnedQty, averageCost: line.costAtSale || 0 },
            });
          }
          await tx.inventoryMovement.create({
            data: {
              itemId: line.itemId,
              warehouseId: warehouse.id,
              movementType: 'return_in',
              quantity: line.returnedQty,
              unitCost: Number(line.costAtSale || 0),
              referenceType: 'sales_return',
              referenceId: salesReturn.id,
              narration: `Sales return ${returnNumber}`,
              createdBy: req.user?.id,
            },
          });
        }
      }

      // Credit note for the return value
      const cnNumber = await getNextNumber('CREDIT_NOTE');
      await tx.creditNote.create({
        data: {
          cnNumber,
          returnId: salesReturn.id,
          customerId: invoice.customerId,
          amount: totalAmount.toNumber(),
          usedAmount: 0,
          status: 'open',
        },
      });

      // Reduce the customer's outstanding on the original invoice
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { outstandingAmount: { decrement: totalAmount.toNumber() } },
      });

      // Journal: reverse revenue + VAT, recognize the refund/credit
      const accounts = await tx.account.findMany({
        where: { accountCode: { in: ['11100', '11200', '11300', '21200', '42000'] } },
      });
      const map: Record<string, number> = {};
      for (const a of accounts) map[a.accountCode] = a.id;

      const netSubtotal = subtotal.toDecimalPlaces(2).toNumber();
      const netTax = taxTotal.toDecimalPlaces(2).toNumber();
      const creditAccount = data.refundMethod === 'credit_note'
        ? map['11300']
        : (data.refundMethod === 'bank_transfer' || data.refundMethod === 'card' ? map['11200'] : map['11100']);

      const lines: any[] = [
        { accountId: map['42000'], debit: netSubtotal, credit: 0, narration: 'Sales Returns' },
      ];
      if (netTax > 0) lines.push({ accountId: map['21200'], debit: netTax, credit: 0, narration: 'VAT reversal' });
      lines.push({ accountId: creditAccount, debit: 0, credit: totalAmount.toNumber(), narration: 'Refund / Credit Note', partyType: 'customer', customerId: invoice.customerId });

      const jvNumber = await getNextNumber('JOURNAL_VOUCHER');
      await tx.journalEntry.create({
        data: {
          voucherNumber: jvNumber,
          voucherDate: new Date(data.returnDate),
          voucherType: 'sales_return',
          narration: `Sales Return ${returnNumber}`,
          status: 'posted',
          referenceType: 'sales_return',
          referenceId: salesReturn.id,
          createdBy: req.user?.id,
          postedBy: req.user?.id,
          lines: { create: lines },
        },
      });

      return salesReturn;
    });

    const full = await prisma.salesReturn.findUnique({
      where: { id: result.id },
      include: { items: { include: { item: true } }, customer: true, creditNotes: true },
    });

    return res.status(201).json(full);
  } catch (err) { return next(err); }
}

export async function listPurchaseReturns(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, supplierId, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (from || to) {
      where.returnDate = {};
      if (from) where.returnDate.gte = new Date(String(from));
      if (to) where.returnDate.lte = new Date(String(to));
    }
    if (supplierId) where.supplierId = Number(supplierId);

    const [total, rows] = await Promise.all([
      prisma.purchaseReturn.count({ where }),
      prisma.purchaseReturn.findMany({
        where,
        include: { supplier: { select: { id: true, name: true } } },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { returnDate: 'desc' },
      }),
    ]);
    return res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) { return next(err); }
}

export async function createPurchaseReturn(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = purchaseReturnSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id: BigInt(data.originalInvoiceId) },
      include: { items: true },
    });
    if (!invoice) return next(createError('Original purchase invoice not found.', 404));

    const returnNumber = await getNextNumber('PURCHASE_RETURN');

    const result = await prisma.$transaction(async (tx) => {
      let totalAmount = new Decimal(0);
      const lineData = [];

      for (const li of data.items) {
        const orig = invoice.items.find((i) => i.id === BigInt(li.originalItemId));
        if (!orig) throw createError(`Invoice line ${li.originalItemId} not found on this invoice.`, 404);

        const remaining = new Decimal(orig.quantity.toString()).minus(orig.returnedQty.toString());
        if (new Decimal(li.returnedQty).greaterThan(remaining)) {
          throw createError('Return quantity exceeds remaining quantity for a line item.', 400);
        }

        const perUnit = new Decimal(orig.lineTotal.toString()).dividedBy(orig.quantity.toString());
        const lineTotal = perUnit.times(li.returnedQty);
        totalAmount = totalAmount.plus(lineTotal);

        lineData.push({
          originalItemId: orig.id,
          itemId: orig.itemId,
          returnedQty: li.returnedQty,
          unitCost: orig.unitCost,
          lineTotal: lineTotal.toDecimalPlaces(4).toNumber(),
        });
      }

      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          returnNumber,
          originalInvoiceId: invoice.id,
          supplierId: invoice.supplierId,
          returnDate: new Date(data.returnDate),
          returnReason: data.returnReason || null,
          totalAmount: totalAmount.toDecimalPlaces(2).toNumber(),
          status: 'completed',
          createdBy: req.user?.id,
          items: { create: lineData },
        },
      });

      const warehouse = await tx.warehouse.findFirst({ where: { isDefault: true } })
        || await tx.warehouse.findFirst();

      for (const line of lineData) {
        await tx.purchaseInvoiceItem.update({
          where: { id: line.originalItemId },
          data: { returnedQty: { increment: line.returnedQty } },
        });

        if (warehouse) {
          const balance = await tx.stockBalance.findFirst({
            where: { itemId: line.itemId, warehouseId: warehouse.id },
          });
          if (balance) {
            await tx.stockBalance.update({
              where: { id: balance.id },
              data: { quantity: { decrement: line.returnedQty } },
            });
          }
          await tx.inventoryMovement.create({
            data: {
              itemId: line.itemId,
              warehouseId: warehouse.id,
              movementType: 'return_out',
              quantity: -line.returnedQty,
              unitCost: Number(line.unitCost),
              referenceType: 'purchase_return',
              referenceId: purchaseReturn.id,
              narration: `Purchase return ${returnNumber}`,
              createdBy: req.user?.id,
            },
          });
        }
      }

      const dnNumber = await getNextNumber('DEBIT_NOTE');
      await tx.debitNote.create({
        data: {
          dnNumber,
          returnId: purchaseReturn.id,
          supplierId: invoice.supplierId,
          amount: totalAmount.toDecimalPlaces(2).toNumber(),
          status: 'open',
        },
      });

      await tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: { outstandingAmount: { decrement: totalAmount.toDecimalPlaces(2).toNumber() } },
      });

      // Journal: Dr Accounts Payable, Cr Inventory
      const accounts = await tx.account.findMany({ where: { accountCode: { in: ['21100', '11400'] } } });
      const map: Record<string, number> = {};
      for (const a of accounts) map[a.accountCode] = a.id;

      const jvNumber = await getNextNumber('JOURNAL_VOUCHER');
      await tx.journalEntry.create({
        data: {
          voucherNumber: jvNumber,
          voucherDate: new Date(data.returnDate),
          voucherType: 'purchase_return',
          narration: `Purchase Return ${returnNumber}`,
          status: 'posted',
          referenceType: 'purchase_return',
          referenceId: purchaseReturn.id,
          createdBy: req.user?.id,
          postedBy: req.user?.id,
          lines: {
            create: [
              { accountId: map['21100'], debit: totalAmount.toDecimalPlaces(2).toNumber(), credit: 0, narration: 'Accounts Payable', partyType: 'supplier', supplierId: invoice.supplierId },
              { accountId: map['11400'], debit: 0, credit: totalAmount.toDecimalPlaces(2).toNumber(), narration: 'Inventory' },
            ],
          },
        },
      });

      return purchaseReturn;
    });

    const full = await prisma.purchaseReturn.findUnique({
      where: { id: result.id },
      include: { items: { include: { item: true } }, supplier: true, debitNotes: true },
    });

    return res.status(201).json(full);
  } catch (err) { return next(err); }
}
