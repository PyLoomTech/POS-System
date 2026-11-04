import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';
import { getNextNumber } from '../../utils/numbering';
import { calculateLineTax, calculateInvoiceTotals } from '../../utils/tax';

const lineItemSchema = z.object({
  itemId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  taxType: z.enum(['taxable_exclusive','taxable_inclusive','non_taxable','zero_rated','exempt']).default('taxable_exclusive'),
  taxRate: z.number().min(0).default(0),
  taxRateId: z.number().int().positive().optional().nullable(),
});

const paymentSchema = z.object({
  method: z.enum(['cash','bank_transfer','card','digital_wallet','qr','customer_credit','split']),
  amount: z.number().positive(),
  cashTendered: z.number().optional(),
  transactionRef: z.string().optional(),
});

const createInvoiceSchema = z.object({
  customerId: z.number().int().positive(),
  invoiceDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  isCredit: z.boolean().default(false),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional(),
  sessionId: z.number().optional().nullable(),
  idempotencyKey: z.string().optional(),
  items: z.array(lineItemSchema).min(1),
  payments: z.array(paymentSchema).optional().default([]),
  invoiceDiscount: z.number().min(0).default(0),
});

export async function createSalesInvoice(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    // Idempotency check
    if (data.idempotencyKey) {
      const existing = await prisma.salesInvoice.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existing) return res.status(200).json(existing);
    }

    const invoiceNumber = await getNextNumber('SALES_INV');

    const result = await prisma.$transaction(async (tx) => {
      // Fetch items with stock (with row-level advisory locks per item)
      const lineResults = [];
      let totalPaid = new Decimal(0);

      for (const li of data.items) {
        const item = await tx.item.findUnique({ where: { id: li.itemId } });
        if (!item) throw createError(`Item ID ${li.itemId} not found.`, 404);

        // Advisory lock per item to prevent concurrent oversell
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${li.itemId})`;

        const balance = await tx.stockBalance.findFirst({
          where: { itemId: li.itemId },
          orderBy: { warehouse: { isDefault: 'desc' } },
        });

        const currentStock = Number(balance?.quantity || 0);
        if (currentStock < li.quantity) {
          throw createError(`Insufficient stock for '${item.name}'. Available: ${currentStock}`, 400);
        }

        const calc = calculateLineTax({
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          discountPct: li.discountPct,
          taxType: li.taxType,
          taxRate: li.taxRate,
        });

        lineResults.push({
          li,
          item,
          balance,
          calc,
          costAtSale: balance?.averageCost || item.purchasePrice,
        });
      }

      // Calculate invoice totals
      const invoiceTotals = calculateInvoiceTotals(lineResults.map(r => r.calc));

      // Apply invoice-level discount proportionally across taxable/tax/non-taxable amounts
      if (data.invoiceDiscount > 0 && invoiceTotals.grandTotal.greaterThan(0)) {
        const invoiceDisc = Decimal.min(new Decimal(data.invoiceDiscount), invoiceTotals.grandTotal);
        const factor = invoiceTotals.grandTotal.minus(invoiceDisc).dividedBy(invoiceTotals.grandTotal);
        invoiceTotals.taxableAmount = invoiceTotals.taxableAmount.times(factor);
        invoiceTotals.nonTaxableAmount = invoiceTotals.nonTaxableAmount.times(factor);
        invoiceTotals.taxAmount = invoiceTotals.taxAmount.times(factor);
        invoiceTotals.discountAmount = invoiceTotals.discountAmount.plus(invoiceDisc);
        invoiceTotals.grandTotal = invoiceTotals.grandTotal.minus(invoiceDisc);
      }

      // Validate payments
      for (const pay of data.payments) {
        totalPaid = totalPaid.plus(pay.amount);
      }

      const paidAmount = data.isCredit ? new Decimal(0) : totalPaid;
      const outstanding = invoiceTotals.grandTotal.minus(paidAmount);

      // Record how the bill was settled so returns can refund the same way
      const settledMethods = Array.from(new Set(data.payments.map((pay) => pay.method)));
      const paymentMethod =
        settledMethods.length === 0
          ? (data.isCredit ? 'customer_credit' : null)
          : settledMethods.length === 1
            ? settledMethods[0]
            : 'split';

      // Create invoice
      const invoice = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          invoiceDate: new Date(data.invoiceDate),
          customerId: data.customerId,
          subtotal: invoiceTotals.subtotal.toDecimalPlaces(2).toNumber(),
          discountAmount: invoiceTotals.discountAmount.toDecimalPlaces(2).toNumber(),
          taxableAmount: invoiceTotals.taxableAmount.toDecimalPlaces(2).toNumber(),
          taxAmount: invoiceTotals.taxAmount.toDecimalPlaces(2).toNumber(),
          nonTaxableAmount: invoiceTotals.nonTaxableAmount.toDecimalPlaces(2).toNumber(),
          grandTotal: invoiceTotals.grandTotal.toDecimalPlaces(2).toNumber(),
          paidAmount: paidAmount.toDecimalPlaces(2).toNumber(),
          outstandingAmount: outstanding.isNegative() ? 0 : outstanding.toDecimalPlaces(2).toNumber(),
          isCredit: data.isCredit,
          paymentMethod: paymentMethod as any,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          notes: data.notes,
          cashierId: req.user?.id,
          cashDrawerSessionId: data.sessionId ? BigInt(data.sessionId) : null,
          idempotencyKey: data.idempotencyKey,
          status: 'confirmed',
        },
      });

      // Create line items and update inventory
      for (const { li, item, balance, calc, costAtSale } of lineResults) {
        await tx.salesInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            itemId: li.itemId,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            discountPct: li.discountPct,
            discountAmount: calc.discountAmount.toDecimalPlaces(4).toNumber(),
            taxType: li.taxType as any,
            taxRate: li.taxRate,
            taxRateId: li.taxRateId || null,
            taxAmount: calc.taxAmount.toDecimalPlaces(4).toNumber(),
            lineTotal: calc.lineTotal.toDecimalPlaces(4).toNumber(),
            costAtSale: Number(costAtSale),
          },
        });

        // Deduct stock
        if (balance) {
          await tx.stockBalance.update({
            where: { id: balance.id },
            data: { quantity: { decrement: li.quantity } },
          });

          await tx.inventoryMovement.create({
            data: {
              itemId: li.itemId,
              warehouseId: balance.warehouseId,
              movementType: 'sale',
              quantity: -li.quantity,
              unitCost: Number(costAtSale),
              referenceType: 'sales_invoice',
              referenceId: invoice.id,
              narration: `Sale: ${invoiceNumber}`,
              createdBy: req.user?.id,
            },
          });
        }
      }

      // Post accounting journal
      const accounts = await getSystemAccounts(tx);
      const jvNumber = await getNextNumber('JOURNAL_VOUCHER');

      await tx.journalEntry.create({
        data: {
          voucherNumber: jvNumber,
          voucherDate: new Date(data.invoiceDate),
          voucherType: 'sales',
          narration: `Sales Invoice ${invoiceNumber}`,
          status: 'posted',
          referenceType: 'sales_invoice',
          referenceId: invoice.id,
          createdBy: req.user?.id,
          postedBy: req.user?.id,
          lines: {
            create: buildSalesJournalLines(
              data.isCredit,
              invoiceTotals,
              data.payments,
              accounts,
              data.customerId,
              lineResults
            ),
          },
        },
      });

      return invoice;
    });

    const full = await prisma.salesInvoice.findUnique({
      where: { id: result.id },
      include: { items: { include: { item: true } }, customer: true },
    });

    return res.status(201).json(full);
  } catch (err) { return next(err); }
}

async function getSystemAccounts(tx: any) {
  const codes = ['11100','11200','11300','11400','41000','51000','21200'];
  const accounts = await tx.account.findMany({ where: { accountCode: { in: codes } } });
  const map: Record<string, number> = {};
  for (const a of accounts) map[a.accountCode] = a.id;
  return map;
}

function buildSalesJournalLines(
  isCredit: boolean,
  totals: any,
  payments: any[],
  accounts: Record<string, number>,
  customerId: number,
  lineResults: any[]
): any[] {
  const lines: any[] = [];
  const grandTotal = totals.grandTotal.toDecimalPlaces(2).toNumber();
  const taxAmount = totals.taxAmount.toDecimalPlaces(2).toNumber();
  const revenue = totals.grandTotal.minus(totals.taxAmount).toDecimalPlaces(2).toNumber();

  if (isCredit) {
    lines.push({ accountId: accounts['11300'], debit: grandTotal, credit: 0,
      narration: 'Accounts Receivable', partyType: 'customer', customerId });
  } else {
    for (const pay of payments) {
      const acctCode = pay.method === 'bank_transfer' || pay.method === 'card' ? '11200' : '11100';
      const netAmount = pay.method === 'cash' && pay.cashTendered
        ? pay.amount  // net cash = invoice amount (change handled separately)
        : pay.amount;
      lines.push({ accountId: accounts[acctCode] || accounts['11100'], debit: netAmount, credit: 0, narration: `Payment: ${pay.method}` });
    }
  }

  // Credit sales revenue
  lines.push({ accountId: accounts['41000'], debit: 0, credit: revenue, narration: 'Sales Revenue' });

  // Credit VAT payable
  if (taxAmount > 0) {
    lines.push({ accountId: accounts['21200'], debit: 0, credit: taxAmount, narration: 'VAT Payable' });
  }

  // COGS entries
  let totalCost = 0;
  for (const { li, costAtSale } of lineResults) {
    totalCost += li.quantity * Number(costAtSale);
  }
  if (totalCost > 0) {
    lines.push({ accountId: accounts['51000'], debit: parseFloat(totalCost.toFixed(2)), credit: 0, narration: 'Cost of Goods Sold' });
    lines.push({ accountId: accounts['11400'], debit: 0, credit: parseFloat(totalCost.toFixed(2)), narration: 'Inventory' });
  }

  return lines;
}

export async function listSalesInvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, customer, status, search, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(String(from));
      if (to) where.invoiceDate.lte = new Date(String(to));
    }
    if (customer) where.customerId = Number(customer);
    if (status) where.status = status;
    if (search) {
      const term = String(search).trim();
      where.OR = [
        { invoiceNumber: { contains: term, mode: 'insensitive' } },
        { customer: { name: { contains: term, mode: 'insensitive' } } },
        { customer: { phone: { contains: term } } },
      ];
    }

    const [total, invoices] = await Promise.all([
      prisma.salesInvoice.count({ where }),
      prisma.salesInvoice.findMany({
        where,
        include: { customer: { select: { id: true, name: true, phone: true } }, cashier: { select: { id: true, fullName: true } } },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { invoiceDate: 'desc' },
      }),
    ]);
    return res.json({ data: invoices, total, page: Number(page), limit: Number(limit) });
  } catch (err) { return next(err); }
}

export async function getSalesInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const id = BigInt(String(req.params.id));
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        customer: true,
        cashier: { select: { id: true, fullName: true } },
        items: { include: { item: { include: { unit: true } } } },
        paymentAllocations: {
          include: { payment: { select: { paymentMethod: true, amount: true, paymentNumber: true, paymentDate: true } } },
        },
      },
    });
    if (!invoice) return next(createError('Invoice not found.', 404));
    return res.json(invoice);
  } catch (err) { return next(err); }
}

export async function cancelSalesInvoice(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = BigInt(String(req.params.id));
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id }, include: { items: true },
    });
    if (!invoice) return next(createError('Invoice not found.', 404));
    if (invoice.status !== 'confirmed') return next(createError('Only confirmed invoices can be cancelled.', 400));

    await prisma.$transaction(async (tx) => {
      // Restore stock
      for (const item of invoice.items) {
        const balance = await tx.stockBalance.findFirst({ where: { itemId: item.itemId } });
        if (balance) {
          await tx.stockBalance.update({ where: { id: balance.id }, data: { quantity: { increment: Number(item.quantity) } } });
        }
      }
      await tx.salesInvoice.update({ where: { id }, data: { status: 'cancelled' } });
    });

    await prisma.auditLog.create({
      data: { userId: req.user?.id, username: req.user?.username, action: 'CANCEL_SALES_INVOICE',
        entity: 'sales_invoices', entityId: String(id), oldValues: { status: 'confirmed' }, newValues: { status: 'cancelled' } },
    });

    return res.json({ message: 'Invoice cancelled successfully.' });
  } catch (err) { return next(err); }
}

export async function getDailySummary(req: Request, res: Response, next: NextFunction) {
  try {
    const date = req.query.date ? new Date(String(req.query.date)) : new Date();
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);

    const [invoices, returns] = await Promise.all([
      prisma.salesInvoice.aggregate({
        where: { invoiceDate: { gte: dayStart, lte: dayEnd }, status: 'confirmed' },
        _sum: { grandTotal: true, taxAmount: true, paidAmount: true },
        _count: { id: true },
      }),
      prisma.salesReturn.aggregate({
        where: { returnDate: { gte: dayStart, lte: dayEnd } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
    ]);

    return res.json({
      date: date.toISOString().slice(0, 10),
      totalSales: invoices._sum.grandTotal || 0,
      totalTax: invoices._sum.taxAmount || 0,
      totalCollected: invoices._sum.paidAmount || 0,
      invoiceCount: invoices._count.id,
      totalReturns: returns._sum.totalAmount || 0,
      returnCount: returns._count.id,
    });
  } catch (err) { return next(err); }
}
