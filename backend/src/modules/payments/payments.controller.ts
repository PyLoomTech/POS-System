import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';
import { getNextNumber } from '../../utils/numbering';

const allocationSchema = z.object({
  invoiceType: z.enum(['sales', 'purchase']),
  invoiceId: z.number().int().positive(),
  amount: z.number().positive(),
});

const paymentSchema = z.object({
  paymentDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  partyType: z.enum(['customer', 'supplier']),
  customerId: z.number().int().positive().optional().nullable(),
  supplierId: z.number().int().positive().optional().nullable(),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'card', 'digital_wallet', 'qr', 'customer_credit', 'split']),
  amount: z.number().positive(),
  transactionRef: z.string().optional().nullable(),
  narration: z.string().optional().nullable(),
  sessionId: z.number().optional().nullable(),
  allocations: z.array(allocationSchema).default([]),
  idempotencyKey: z.string().optional(),
});

export async function listPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, customerId, supplierId, partyType, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (from || to) {
      where.paymentDate = {};
      if (from) where.paymentDate.gte = new Date(String(from));
      if (to) where.paymentDate.lte = new Date(String(to));
    }
    if (customerId) where.customerId = Number(customerId);
    if (supplierId) where.supplierId = Number(supplierId);
    if (partyType) where.partyType = String(partyType);

    const [total, rows] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { paymentDate: 'desc' },
      }),
    ]);
    return res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) { return next(err); }
}

export async function getPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const id = BigInt(String(req.params.id));
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        customer: true,
        supplier: true,
        allocations: { include: { salesInvoice: true, purchaseInvoice: true } },
      },
    });
    if (!payment) return next(createError('Payment not found.', 404));
    return res.json(payment);
  } catch (err) { return next(err); }
}

export async function createPayment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    if (data.partyType === 'customer' && !data.customerId) {
      return next(createError('customerId is required for a customer receipt.', 400));
    }
    if (data.partyType === 'supplier' && !data.supplierId) {
      return next(createError('supplierId is required for a supplier payment.', 400));
    }

    if (data.idempotencyKey) {
      const existing = await prisma.payment.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existing) return res.status(200).json(existing);
    }

    const allocatedTotal = data.allocations.reduce((s, a) => s + a.amount, 0);
    if (allocatedTotal > data.amount + 0.001) {
      return next(createError('Total allocated amount exceeds the payment amount.', 400));
    }

    const seriesCode = data.partyType === 'customer' ? 'RECEIPT_VOUCHER' : 'PAYMENT_VOUCHER';
    const paymentNumber = await getNextNumber(seriesCode);

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          paymentDate: new Date(data.paymentDate),
          paymentType: data.partyType === 'customer' ? 'receipt' : 'payment',
          partyType: data.partyType,
          customerId: data.customerId || null,
          supplierId: data.supplierId || null,
          paymentMethod: data.paymentMethod as any,
          amount: data.amount,
          transactionRef: data.transactionRef || null,
          narration: data.narration || null,
          sessionId: data.sessionId ? BigInt(data.sessionId) : null,
          createdBy: req.user?.id,
          idempotencyKey: data.idempotencyKey,
          paymentStatus: 'completed',
        },
      });

      for (const alloc of data.allocations) {
        if (alloc.invoiceType === 'sales') {
          const inv = await tx.salesInvoice.findUnique({ where: { id: BigInt(alloc.invoiceId) } });
          if (!inv) throw createError(`Sales invoice ${alloc.invoiceId} not found.`, 404);
          await tx.salesInvoice.update({
            where: { id: inv.id },
            data: {
              paidAmount: { increment: alloc.amount },
              outstandingAmount: { decrement: alloc.amount },
            },
          });
          await tx.paymentAllocation.create({
            data: { paymentId: payment.id, invoiceType: 'sales', salesInvoiceId: inv.id, allocatedAmount: alloc.amount },
          });
        } else {
          const inv = await tx.purchaseInvoice.findUnique({ where: { id: BigInt(alloc.invoiceId) } });
          if (!inv) throw createError(`Purchase invoice ${alloc.invoiceId} not found.`, 404);
          await tx.purchaseInvoice.update({
            where: { id: inv.id },
            data: {
              paidAmount: { increment: alloc.amount },
              outstandingAmount: { decrement: alloc.amount },
            },
          });
          await tx.paymentAllocation.create({
            data: { paymentId: payment.id, invoiceType: 'purchase', purchaseInvoiceId: inv.id, allocatedAmount: alloc.amount },
          });
        }
      }

      // Post accounting journal
      const accounts = await tx.account.findMany({
        where: { accountCode: { in: ['11100', '11200', '11300', '21100'] } },
      });
      const map: Record<string, number> = {};
      for (const a of accounts) map[a.accountCode] = a.id;

      const cashCode = data.paymentMethod === 'bank_transfer' || data.paymentMethod === 'card' ? '11200' : '11100';
      const amount = parseFloat(data.amount.toFixed(2));
      const jvNumber = await getNextNumber('JOURNAL_VOUCHER');

      const lines = data.partyType === 'customer'
        ? [
            { accountId: map[cashCode], debit: amount, credit: 0, narration: 'Cash/Bank received' },
            { accountId: map['11300'], debit: 0, credit: amount, narration: 'Accounts Receivable', partyType: 'customer', customerId: data.customerId },
          ]
        : [
            { accountId: map['21100'], debit: amount, credit: 0, narration: 'Accounts Payable', partyType: 'supplier', supplierId: data.supplierId },
            { accountId: map[cashCode], debit: 0, credit: amount, narration: 'Cash/Bank paid' },
          ];

      await tx.journalEntry.create({
        data: {
          voucherNumber: jvNumber,
          voucherDate: new Date(data.paymentDate),
          voucherType: data.partyType === 'customer' ? 'receipt' : 'payment',
          narration: `${data.partyType === 'customer' ? 'Receipt' : 'Payment'} ${paymentNumber}`,
          status: 'posted',
          referenceType: 'payment',
          referenceId: payment.id,
          createdBy: req.user?.id,
          postedBy: req.user?.id,
          lines: { create: lines },
        },
      });

      return payment;
    });

    const full = await prisma.payment.findUnique({
      where: { id: result.id },
      include: { allocations: true, customer: true, supplier: true },
    });

    return res.status(201).json(full);
  } catch (err) { return next(err); }
}

export async function getCustomerOutstanding(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT c.id AS "customerId", c.customer_code AS "customerCode", c.name, c.phone,
             COALESCE(SUM(si.outstanding_amount), 0)::float AS outstanding,
             COUNT(si.id)::int AS "invoiceCount"
      FROM customers c
      JOIN sales_invoices si ON si.customer_id = c.id
      WHERE si.status IN ('confirmed','returned') AND si.outstanding_amount > 0
      GROUP BY c.id, c.customer_code, c.name, c.phone
      ORDER BY outstanding DESC
    `;
    return res.json({ data: rows, total: rows.length });
  } catch (err) { return next(err); }
}

export async function getSupplierOutstanding(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT s.id AS "supplierId", s.supplier_code AS "supplierCode", s.name, s.phone,
             COALESCE(SUM(pi.outstanding_amount), 0)::float AS outstanding,
             COUNT(pi.id)::int AS "invoiceCount"
      FROM suppliers s
      JOIN purchase_invoices pi ON pi.supplier_id = s.id
      WHERE pi.status = 'confirmed' AND pi.outstanding_amount > 0
      GROUP BY s.id, s.supplier_code, s.name, s.phone
      ORDER BY outstanding DESC
    `;
    return res.json({ data: rows, total: rows.length });
  } catch (err) { return next(err); }
}
