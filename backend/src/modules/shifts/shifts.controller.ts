import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import { createError } from '../../middleware/errorHandler';

const openShiftSchema = z.object({
  registerName: z.string().trim().min(1).max(100).default('Main Register'),
  openingCash: z.number().finite().min(0),
  openingNotes: z.string().trim().max(2000).optional().nullable(),
});

const closeShiftSchema = z.object({
  actualCash: z.number().finite().min(0),
  closingNotes: z.string().trim().max(2000).optional().nullable(),
});

const summarySchema = z.object({
  totalSales: z.number(),
  cashSales: z.number(),
  cardSales: z.number(),
  qrSales: z.number(),
  otherPaymentSales: z.number(),
  creditSales: z.number(),
  salesReturns: z.number(),
  cashRefunds: z.number(),
  cashCollections: z.number(),
  cashPaidOut: z.number(),
  totalTransactions: z.number(),
  cancelledTransactions: z.number(),
});

const listShiftsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cashierId: z.coerce.number().int().positive().optional(),
  registerName: z.string().optional(),
  status: z.enum(['open', 'closed']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: '"from" must be on or before "to".',
});

type ShiftSummary = {
  totalSales: number;
  cashSales: number;
  cardSales: number;
  qrSales: number;
  otherPaymentSales: number;
  creditSales: number;
  salesReturns: number;
  cashRefunds: number;
  cashCollections: number;
  cashPaidOut: number;
  totalTransactions: number;
  cancelledTransactions: number;
};

async function getShiftSummaries(
  ids: bigint[],
  db: Pick<Prisma.TransactionClient, '$queryRaw'> = prisma,
) {
  if (ids.length === 0) return new Map<string, ShiftSummary>();

  const rows = await db.$queryRaw<Array<{
    sessionId: bigint;
    totalSales: number;
    cashSales: number;
    cardSales: number;
    qrSales: number;
    otherPaymentSales: number;
    creditSales: number;
    salesReturns: number;
    cashRefunds: number;
    cashCollections: number;
    cashPaidOut: number;
    totalTransactions: number;
    cancelledTransactions: number;
  }>>`
    WITH sales AS (
      SELECT cash_drawer_session_id AS session_id,
             COALESCE(SUM(grand_total) FILTER (WHERE status = 'confirmed'), 0)::float8 AS total_sales,
             COALESCE(SUM(paid_amount) FILTER (WHERE status = 'confirmed' AND payment_method = 'cash'), 0)::float8 AS cash_sales,
             COALESCE(SUM(paid_amount) FILTER (WHERE status = 'confirmed' AND payment_method = 'card'), 0)::float8 AS card_sales,
             COALESCE(SUM(paid_amount) FILTER (WHERE status = 'confirmed' AND payment_method = 'qr'), 0)::float8 AS qr_sales,
             COALESCE(SUM(paid_amount) FILTER (
               WHERE status = 'confirmed' AND payment_method IN ('bank_transfer', 'digital_wallet', 'split')
             ), 0)::float8 AS other_payment_sales,
             COALESCE(SUM(grand_total) FILTER (WHERE status = 'confirmed' AND is_credit = true), 0)::float8 AS credit_sales,
             COUNT(*) FILTER (WHERE status = 'confirmed')::int AS total_transactions,
             COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_transactions
      FROM sales_invoices
      WHERE cash_drawer_session_id IN (${Prisma.join(ids)})
      GROUP BY cash_drawer_session_id
    ), returns AS (
      SELECT sr.cash_drawer_session_id AS session_id,
             COALESCE(SUM(sr.total_amount), 0)::float8 AS sales_returns,
             COALESCE(SUM(sr.refund_amount) FILTER (WHERE lower(COALESCE(sr.refund_method, '')) = 'cash'), 0)::float8 AS cash_refunds
      FROM sales_returns sr
      WHERE sr.cash_drawer_session_id IN (${Prisma.join(ids)})
      GROUP BY sr.cash_drawer_session_id
    ), movements AS (
      SELECT session_id,
             COALESCE(SUM(amount) FILTER (
               WHERE payment_type = 'receipt' AND payment_method = 'cash' AND payment_status = 'completed'
             ), 0)::float8 AS cash_collections,
             COALESCE(SUM(amount) FILTER (
               WHERE payment_type = 'payment' AND payment_method = 'cash' AND payment_status = 'completed'
             ), 0)::float8 AS cash_paid_out
      FROM payments
      WHERE session_id IN (${Prisma.join(ids)})
      GROUP BY session_id
    )
    SELECT s.id AS "sessionId",
           COALESCE(sales.total_sales, 0)::float8 AS "totalSales",
           COALESCE(sales.cash_sales, 0)::float8 AS "cashSales",
           COALESCE(sales.card_sales, 0)::float8 AS "cardSales",
           COALESCE(sales.qr_sales, 0)::float8 AS "qrSales",
           COALESCE(sales.other_payment_sales, 0)::float8 AS "otherPaymentSales",
           COALESCE(sales.credit_sales, 0)::float8 AS "creditSales",
           COALESCE(returns.sales_returns, 0)::float8 AS "salesReturns",
           COALESCE(returns.cash_refunds, 0)::float8 AS "cashRefunds",
           COALESCE(movements.cash_collections, 0)::float8 AS "cashCollections",
           COALESCE(movements.cash_paid_out, 0)::float8 AS "cashPaidOut",
           COALESCE(sales.total_transactions, 0)::int AS "totalTransactions",
           COALESCE(sales.cancelled_transactions, 0)::int AS "cancelledTransactions"
    FROM cash_drawer_sessions s
    LEFT JOIN sales ON sales.session_id = s.id
    LEFT JOIN returns ON returns.session_id = s.id
    LEFT JOIN movements ON movements.session_id = s.id
    WHERE s.id IN (${Prisma.join(ids)})
  `;

  return new Map(rows.map((row) => [row.sessionId.toString(), {
    totalSales: Number(row.totalSales),
    cashSales: Number(row.cashSales),
    cardSales: Number(row.cardSales),
    qrSales: Number(row.qrSales),
    otherPaymentSales: Number(row.otherPaymentSales),
    creditSales: Number(row.creditSales),
    salesReturns: Number(row.salesReturns),
    cashRefunds: Number(row.cashRefunds),
    cashCollections: Number(row.cashCollections),
    cashPaidOut: Number(row.cashPaidOut),
    totalTransactions: Number(row.totalTransactions),
    cancelledTransactions: Number(row.cancelledTransactions),
  }]));
}

function expectedCash(openingCash: unknown, summary: ShiftSummary) {
  return Number(openingCash)
    + summary.cashSales
    + summary.cashCollections
    - summary.cashRefunds
    - summary.cashPaidOut;
}

function getStoredSummary(value: Prisma.JsonValue | null): ShiftSummary | null {
  const parsed = summarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function getCurrentShift(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shift = await prisma.cashDrawerSession.findFirst({
      where: { cashierId: req.user!.id, status: 'open' },
      include: { cashier: { select: { id: true, fullName: true } } },
      orderBy: { openingTime: 'desc' },
    });
    if (!shift) return res.json(null);
    const summary = (await getShiftSummaries([shift.id])).get(shift.id.toString())!;
    return res.json({
      ...shift,
      summary,
      expectedCash: expectedCash(shift.openingCash, summary),
    });
  } catch (err) { return next(err); }
}

export async function openShift(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = openShiftSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    const existing = await prisma.cashDrawerSession.findFirst({
      where: {
        status: 'open',
        OR: [{ cashierId: req.user!.id }, { registerName: data.registerName }],
      },
    });
    if (existing) {
      const reason = existing.cashierId === req.user!.id
        ? 'This cashier already has an open shift.'
        : `Register '${data.registerName}' already has an open shift.`;
      return next(createError(reason, 409));
    }

    const shift = await prisma.cashDrawerSession.create({
      data: {
        sessionNumber: `SHIFT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
        cashierId: req.user!.id,
        registerName: data.registerName,
        openingCash: data.openingCash,
        openingNotes: data.openingNotes || null,
        status: 'open',
      },
      include: { cashier: { select: { id: true, fullName: true } } },
    });
    return res.status(201).json({
      ...shift,
      summary: {
        totalSales: 0, cashSales: 0, cardSales: 0, qrSales: 0, otherPaymentSales: 0,
        creditSales: 0, salesReturns: 0, cashRefunds: 0, cashCollections: 0,
        cashPaidOut: 0, totalTransactions: 0, cancelledTransactions: 0,
      },
      expectedCash: Number(shift.openingCash),
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(createError('This cashier or register already has an open shift.', 409));
    }
    return next(err);
  }
}

export async function closeShift(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = BigInt(String(req.params.id));
    const parsed = closeShiftSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));

    const closed = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: bigint; cashierId: number; status: string }>>`
        SELECT id, cashier_id AS "cashierId", status
        FROM cash_drawer_sessions
        WHERE id = ${id}
        FOR UPDATE
      `;
      const shift = locked[0];
      if (!shift) throw createError('Shift not found.', 404);
      if (shift.cashierId !== req.user!.id) throw createError('You can only close your own shift.', 403);
      if (shift.status !== 'open') throw createError('This shift is already closed.', 409);

      const session = await tx.cashDrawerSession.findUniqueOrThrow({ where: { id } });
      const summaries = await getShiftSummaries([id], tx);
      const summary = summaries.get(id.toString())!;
      const expected = expectedCash(session.openingCash, summary);
      const difference = parsed.data.actualCash - expected;
      return tx.cashDrawerSession.update({
        where: { id },
        data: {
          status: 'closed',
          closingTime: new Date(),
          cashSales: summary.cashSales,
          cashCollections: summary.cashCollections,
          cashRefunds: summary.cashRefunds,
          cashExpenses: summary.cashPaidOut,
          expectedClosing: expected,
          actualClosing: parsed.data.actualCash,
          difference,
          closingNotes: parsed.data.closingNotes || null,
          closingSummary: summary,
        },
        include: { cashier: { select: { id: true, fullName: true } } },
      }).then((updated) => ({ shift: updated, summary, expectedCash: expected }));
    });
    return res.json(closed);
  } catch (err) { return next(err); }
}

export async function listShifts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = listShiftsSchema.safeParse(req.query);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const { page, limit, cashierId, registerName, status, from, to } = parsed.data;

    const where: Prisma.CashDrawerSessionWhereInput = {};
    const canViewAll = ['Super Administrator', 'Administrator', 'Manager', 'Accountant']
      .includes(req.user!.roleName);
    if (!canViewAll) where.cashierId = req.user!.id;
    if (cashierId && canViewAll) {
      where.cashierId = cashierId;
    }
    if (registerName) where.registerName = { contains: registerName, mode: 'insensitive' };
    if (status) where.status = status;
    if (from || to) {
      where.openingTime = {};
      if (from) where.openingTime.gte = from;
      if (to) where.openingTime.lte = to;
    }

    const [total, shifts] = await Promise.all([
      prisma.cashDrawerSession.count({ where }),
      prisma.cashDrawerSession.findMany({
        where,
        include: { cashier: { select: { id: true, fullName: true } } },
        orderBy: { openingTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const summaries = await getShiftSummaries(shifts.map((shift) => shift.id));
    const data = shifts.map((shift) => {
      const summary = shift.status === 'closed'
        ? getStoredSummary(shift.closingSummary) ?? summaries.get(shift.id.toString())!
        : summaries.get(shift.id.toString())!;
      return { ...shift, summary, expectedCash: expectedCash(shift.openingCash, summary) };
    });
    return res.json({ data, total, page, limit });
  } catch (err) { return next(err); }
}
