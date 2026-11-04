import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';
import { getNextNumber } from '../../utils/numbering';
import { calculateLineTax, calculateInvoiceTotals } from '../../utils/tax';

const lineSchema = z.object({
  itemId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  taxType: z.enum(['taxable_exclusive','taxable_inclusive','non_taxable','zero_rated','exempt']).default('taxable_exclusive'),
  taxRate: z.number().min(0).default(0),
  taxRateId: z.number().optional().nullable(),
});

const createPurchaseSchema = z.object({
  supplierId: z.number().int().positive(),
  supplierInvoiceRef: z.string().optional().nullable(),
  invoiceDate: z.string(),
  dueDate: z.string().optional().nullable(),
  warehouseId: z.number().int().positive(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
  items: z.array(lineSchema).min(1),
  paidAmount: z.number().min(0).default(0),
  paymentMethod: z.string().optional(),
});

export async function createPurchaseInvoice(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createPurchaseSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    if (data.idempotencyKey) {
      const existing = await prisma.purchaseInvoice.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existing) return res.status(200).json(existing);
    }

    const invoiceNumber = await getNextNumber('PURCHASE_INV');

    const result = await prisma.$transaction(async (tx) => {
      const lineCalcs = data.items.map(li => ({
        li,
        calc: calculateLineTax({ quantity: li.quantity, unitPrice: li.unitCost,
          discountPct: li.discountPct, taxType: li.taxType, taxRate: li.taxRate }),
      }));
      const totals = calculateInvoiceTotals(lineCalcs.map(l => l.calc));
      const outstanding = totals.grandTotal.minus(data.paidAmount);

      const invoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber,
          supplierInvoiceRef: data.supplierInvoiceRef || null,
          supplierId: data.supplierId,
          invoiceDate: new Date(data.invoiceDate),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          subtotal: totals.subtotal.toDecimalPlaces(2).toNumber(),
          taxAmount: totals.taxAmount.toDecimalPlaces(2).toNumber(),
          grandTotal: totals.grandTotal.toDecimalPlaces(2).toNumber(),
          paidAmount: data.paidAmount,
          outstandingAmount: outstanding.isNegative() ? 0 : outstanding.toDecimalPlaces(2).toNumber(),
          stockPosted: true,
          notes: data.notes,
          createdBy: req.user?.id,
          idempotencyKey: data.idempotencyKey,
          status: 'confirmed',
        },
      });

      for (const { li, calc } of lineCalcs) {
        await tx.purchaseInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            itemId: li.itemId,
            quantity: li.quantity,
            unitCost: li.unitCost,
            discountPct: li.discountPct,
            discountAmount: calc.discountAmount.toDecimalPlaces(4).toNumber(),
            taxType: li.taxType as any,
            taxRate: li.taxRate,
            taxRateId: li.taxRateId || null,
            taxAmount: calc.taxAmount.toDecimalPlaces(4).toNumber(),
            lineTotal: calc.lineTotal.toDecimalPlaces(4).toNumber(),
          },
        });

        // Update inventory using weighted average cost
        const balance = await tx.stockBalance.findFirst({
          where: { itemId: li.itemId, warehouseId: data.warehouseId },
        });

        if (balance) {
          const currentQty = new Decimal(balance.quantity.toString());
          const currentCost = new Decimal(balance.averageCost.toString());
          const newQty = new Decimal(li.quantity);
          const newCost = new Decimal(li.unitCost);
          const totalQty = currentQty.plus(newQty);
          const newWAC = totalQty.isZero() ? newCost
            : currentQty.times(currentCost).plus(newQty.times(newCost)).dividedBy(totalQty);

          await tx.stockBalance.update({
            where: { id: balance.id },
            data: { quantity: { increment: li.quantity }, averageCost: newWAC.toDecimalPlaces(4).toNumber() },
          });
        } else {
          await tx.stockBalance.create({
            data: { itemId: li.itemId, warehouseId: data.warehouseId, quantity: li.quantity, averageCost: li.unitCost },
          });
        }

        await tx.inventoryMovement.create({
          data: { itemId: li.itemId, warehouseId: data.warehouseId, movementType: 'purchase',
            quantity: li.quantity, unitCost: li.unitCost, referenceType: 'purchase_invoice',
            referenceId: invoice.id, narration: `Purchase: ${invoiceNumber}`, createdBy: req.user?.id },
        });
      }

      // Post accounting
      const accounts = await tx.account.findMany({
        where: { accountCode: { in: ['11400','21100','21200','11100'] } }
      });
      const acctMap: Record<string, number> = {};
      for (const a of accounts) acctMap[a.accountCode] = a.id;

      const isCredit = outstanding.greaterThan(0);
      const jvNumber = await getNextNumber('JOURNAL_VOUCHER');
      const jvLines: any[] = [
        { accountId: acctMap['11400'], debit: totals.taxableAmount.plus(totals.nonTaxableAmount).toDecimalPlaces(2).toNumber(), credit: 0, narration: 'Inventory' },
      ];
      if (totals.taxAmount.greaterThan(0)) {
        jvLines.push({ accountId: acctMap['21200'], debit: totals.taxAmount.toDecimalPlaces(2).toNumber(), credit: 0, narration: 'Input Tax' });
      }
      if (isCredit) {
        jvLines.push({ accountId: acctMap['21100'], debit: 0, credit: totals.grandTotal.toDecimalPlaces(2).toNumber(), narration: 'Accounts Payable', partyType: 'supplier', supplierId: data.supplierId });
      } else {
        jvLines.push({ accountId: acctMap['11100'], debit: 0, credit: totals.grandTotal.toDecimalPlaces(2).toNumber(), narration: 'Cash Payment' });
      }

      await tx.journalEntry.create({
        data: { voucherNumber: jvNumber, voucherDate: new Date(data.invoiceDate),
          voucherType: 'purchase', narration: `Purchase Invoice ${invoiceNumber}`,
          status: 'posted', referenceType: 'purchase_invoice', referenceId: invoice.id,
          createdBy: req.user?.id, postedBy: req.user?.id,
          lines: { create: jvLines } },
      });

      return invoice;
    });

    return res.status(201).json(result);
  } catch (err) { return next(err); }
}

export async function listPurchaseInvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, supplier, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(String(from));
      if (to) where.invoiceDate.lte = new Date(String(to));
    }
    if (supplier) where.supplierId = Number(supplier);
    const [total, invoices] = await Promise.all([
      prisma.purchaseInvoice.count({ where }),
      prisma.purchaseInvoice.findMany({
        where, include: { supplier: { select: { id: true, name: true } } },
        skip: (Number(page) - 1) * Number(limit), take: Number(limit),
        orderBy: { invoiceDate: 'desc' },
      }),
    ]);
    return res.json({ data: invoices, total, page: Number(page), limit: Number(limit) });
  } catch (err) { return next(err); }
}

export async function getPurchaseInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const id = BigInt(String(req.params.id));
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      include: { supplier: true, items: { include: { item: { include: { unit: true } } } } },
    });
    if (!invoice) return next(createError('Purchase invoice not found.', 404));
    return res.json(invoice);
  } catch (err) { return next(err); }
}
