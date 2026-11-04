import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';
import { getNextNumber } from '../../utils/numbering';

const accountSchema = z.object({
  accountCode: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  accountType: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentId: z.number().int().positive().optional().nullable(),
  isGroup: z.boolean().default(false),
  openingBalance: z.number().default(0),
});

const journalSchema = z.object({
  voucherDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  voucherType: z.string().optional().nullable(),
  narration: z.string().optional().nullable(),
  lines: z.array(z.object({
    accountId: z.number().int().positive(),
    debit: z.number().min(0).default(0),
    credit: z.number().min(0).default(0),
    narration: z.string().optional().nullable(),
    partyType: z.string().optional().nullable(),
    customerId: z.number().int().positive().optional().nullable(),
    supplierId: z.number().int().positive().optional().nullable(),
  })).min(2, 'A journal entry requires at least two lines'),
});

const fiscalPeriodSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string(),
  endDate: z.string(),
});

export async function listAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    const { type, active, search } = req.query;
    const where: any = {};
    if (type) where.accountType = String(type);
    if (active !== undefined) where.isActive = active === 'true';
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { accountCode: { contains: String(search) } },
      ];
    }

    const [accounts, sums] = await Promise.all([
      prisma.account.findMany({ where, orderBy: { accountCode: 'asc' } }),
      prisma.$queryRaw<{ accountId: number; debit: number; credit: number }[]>`
        SELECT jel.account_id AS "accountId",
               SUM(jel.debit)::float AS debit,
               SUM(jel.credit)::float AS credit
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.entry_id
        WHERE je.status = 'posted'
        GROUP BY jel.account_id
      `,
    ]);

    const sumMap = new Map(sums.map((s) => [s.accountId, s]));
    const nodeById = new Map(accounts.map((a) => [a.id, a]));

    // Own direct ledger movement per account
    const rolled = new Map<number, { debit: number; credit: number }>();
    for (const a of accounts) {
      const s = sumMap.get(a.id);
      rolled.set(a.id, { debit: Number(s?.debit ?? 0), credit: Number(s?.credit ?? 0) });
    }

    // Roll child movements up into their parents so group rows show totals
    for (const a of accounts) {
      const own = rolled.get(a.id)!;
      let parentId = a.parentId;
      const guard = new Set<number>([a.id]);
      while (parentId != null && !guard.has(parentId)) {
        guard.add(parentId);
        const parentRolled = rolled.get(parentId);
        if (!parentRolled) break;
        parentRolled.debit += own.debit;
        parentRolled.credit += own.credit;
        parentId = nodeById.get(parentId)?.parentId ?? null;
      }
    }

    const data = accounts.map((a) => {
      const { debit, credit } = rolled.get(a.id)!;
      const isDebitNormal = a.accountType === 'asset' || a.accountType === 'expense';
      const opening = Number(a.openingBalance);
      const diff = debit - credit + (isDebitNormal ? opening : -opening);
      return {
        ...a,
        debit,
        credit,
        balance: Math.abs(diff),
        balanceType: diff >= 0 ? 'Dr' : 'Cr',
      };
    });

    return res.json({ data });
  } catch (err) { return next(err); }
}

export async function createAccount(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = accountSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    const exists = await prisma.account.findUnique({ where: { accountCode: data.accountCode } });
    if (exists) return next(createError(`Account code '${data.accountCode}' already exists.`, 409));

    const account = await prisma.account.create({
      data: {
        accountCode: data.accountCode,
        name: data.name,
        accountType: data.accountType as any,
        parentId: data.parentId || null,
        isGroup: data.isGroup,
        openingBalance: data.openingBalance,
      },
    });
    return res.status(201).json(account);
  } catch (err) { return next(err); }
}

export async function updateAccount(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const parsed = accountSchema.partial().safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));

    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) return next(createError('Account not found.', 404));

    const updated = await prisma.account.update({
      where: { id },
      data: parsed.data as any,
    });
    return res.json(updated);
  } catch (err) { return next(err); }
}

export async function getAccountLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const accountId = Number(req.params.id);
    const { from, to } = req.query;

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) return next(createError('Account not found.', 404));

    const entryWhere: any = { status: 'posted' };
    if (from || to) {
      entryWhere.voucherDate = {};
      if (from) entryWhere.voucherDate.gte = new Date(String(from));
      if (to) entryWhere.voucherDate.lte = new Date(String(to));
    }

    const lines = await prisma.journalEntryLine.findMany({
      where: { accountId, entry: entryWhere },
      include: { entry: { select: { voucherNumber: true, voucherDate: true, narration: true } } },
      orderBy: { entry: { voucherDate: 'asc' } },
    });

    let balance = Number(account.openingBalance);
    const entries = lines.map((l) => {
      balance += Number(l.debit) - Number(l.credit);
      return {
        id: l.id,
        date: l.entry.voucherDate,
        voucherNumber: l.entry.voucherNumber,
        narration: l.narration || l.entry.narration,
        debit: l.debit,
        credit: l.credit,
        balance,
      };
    });

    return res.json({ account, openingBalance: account.openingBalance, closingBalance: balance, entries });
  } catch (err) { return next(err); }
}

export async function listJournalEntries(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, status, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (status) where.status = String(status);
    if (from || to) {
      where.voucherDate = {};
      if (from) where.voucherDate.gte = new Date(String(from));
      if (to) where.voucherDate.lte = new Date(String(to));
    }

    const [total, rows] = await Promise.all([
      prisma.journalEntry.count({ where }),
      prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: { select: { id: true, accountCode: true, name: true } } } } },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { voucherDate: 'desc' },
      }),
    ]);
    return res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) { return next(err); }
}

export async function createJournalEntry(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = journalSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    const totalDebit = data.lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));
    const totalCredit = data.lines.reduce((s, l) => s.plus(l.credit), new Decimal(0));
    if (!totalDebit.equals(totalCredit)) {
      return next(createError(`Debit (${totalDebit}) and credit (${totalCredit}) totals must be equal.`, 400));
    }
    if (totalDebit.isZero()) {
      return next(createError('Journal entry total must be greater than zero.', 400));
    }

    const voucherNumber = await getNextNumber('JOURNAL_VOUCHER');

    const entry = await prisma.journalEntry.create({
      data: {
        voucherNumber,
        voucherDate: new Date(data.voucherDate),
        voucherType: data.voucherType || 'manual',
        narration: data.narration || null,
        status: 'posted',
        createdBy: req.user?.id,
        postedBy: req.user?.id,
        lines: {
          create: data.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            narration: l.narration || null,
            partyType: l.partyType || null,
            customerId: l.customerId || null,
            supplierId: l.supplierId || null,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });

    return res.status(201).json(entry);
  } catch (err) { return next(err); }
}

export async function getTrialBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = req.query;
    const where: any = { entry: { status: 'posted' } };
    if (from || to) {
      where.entry.voucherDate = {};
      if (from) where.entry.voucherDate.gte = new Date(String(from));
      if (to) where.entry.voucherDate.lte = new Date(String(to));
    }

    const [accounts, grouped] = await Promise.all([
      prisma.account.findMany({ orderBy: { accountCode: 'asc' } }),
      prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        where,
        _sum: { debit: true, credit: true },
      }),
    ]);

    const sums: Record<number, { debit: number; credit: number }> = {};
    for (const g of grouped) {
      sums[g.accountId] = {
        debit: Number(g._sum.debit || 0),
        credit: Number(g._sum.credit || 0),
      };
    }

    let totalDebit = 0;
    let totalCredit = 0;
    const rows = accounts.map((a) => {
      const s = sums[a.id] || { debit: 0, credit: 0 };
      totalDebit += s.debit;
      totalCredit += s.credit;
      return {
        accountId: a.id,
        accountCode: a.accountCode,
        name: a.name,
        accountType: a.accountType,
        debit: s.debit,
        credit: s.credit,
        balance: s.debit - s.credit,
      };
    }).filter((r) => r.debit !== 0 || r.credit !== 0);

    return res.json({ data: rows, totalDebit, totalCredit });
  } catch (err) { return next(err); }
}

export async function listFiscalPeriods(_req: Request, res: Response, next: NextFunction) {
  try {
    const periods = await prisma.fiscalPeriod.findMany({ orderBy: { startDate: 'desc' } });
    return res.json({ data: periods });
  } catch (err) { return next(err); }
}

export async function createFiscalPeriod(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = fiscalPeriodSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    const period = await prisma.fiscalPeriod.create({
      data: {
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
    });
    return res.status(201).json(period);
  } catch (err) { return next(err); }
}

export async function closeFiscalPeriod(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const period = await prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!period) return next(createError('Fiscal period not found.', 404));
    if (period.isClosed) return next(createError('Fiscal period is already closed.', 400));

    const updated = await prisma.fiscalPeriod.update({
      where: { id },
      data: { isClosed: true, closedBy: req.user?.id, closedAt: new Date() },
    });
    return res.json(updated);
  } catch (err) { return next(err); }
}
