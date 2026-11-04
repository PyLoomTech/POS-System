import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';

const supplierSchema = z.object({
  name: z.string().min(1).max(255),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  panVatNumber: z.string().optional().nullable(),
  openingBalance: z.number().default(0),
  paymentTermsDays: z.number().int().default(0),
});

export async function listSuppliers(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { phone: { contains: String(search) } },
        { panVatNumber: { contains: String(search) } },
      ];
    }
    const [total, suppliers] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({ where, skip: (Number(page) - 1) * Number(limit), take: Number(limit), orderBy: { name: 'asc' } }),
    ]);
    return res.json({ data: suppliers, total, page: Number(page), limit: Number(limit) });
  } catch (err) { return next(err); }
}

export async function createSupplier(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = supplierSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const count = await prisma.supplier.count();
    const supplierCode = `SUP-${String(count + 1).padStart(5, '0')}`;
    const supplier = await prisma.supplier.create({ data: { supplierCode, ...parsed.data, createdBy: req.user?.id } });
    return res.status(201).json(supplier);
  } catch (err) { return next(err); }
}

export async function getSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const supplier = await prisma.supplier.findUnique({ where: { id: Number(req.params.id) } });
    if (!supplier) return next(createError('Supplier not found.', 404));
    return res.json(supplier);
  } catch (err) { return next(err); }
}

export async function updateSupplier(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const parsed = supplierSchema.partial().safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const supplier = await prisma.supplier.update({ where: { id }, data: parsed.data });
    return res.json(supplier);
  } catch (err) { return next(err); }
}

export async function getSupplierLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const supplierId = Number(req.params.id);
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) return next(createError('Supplier not found.', 404));

    const invoices = await prisma.purchaseInvoice.findMany({ where: { supplierId }, orderBy: { invoiceDate: 'asc' } });
    const payments = await prisma.payment.findMany({ where: { supplierId }, orderBy: { paymentDate: 'asc' } });

    const entries: any[] = [];
    for (const inv of invoices) {
      entries.push({ date: inv.invoiceDate, type: 'Purchase', ref: inv.invoiceNumber, credit: inv.grandTotal, debit: 0, balance: 0 });
    }
    for (const pay of payments) {
      entries.push({ date: pay.paymentDate, type: 'Payment', ref: pay.paymentNumber, credit: 0, debit: pay.amount, balance: 0 });
    }
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let balance = Number(supplier.openingBalance);
    for (const e of entries) {
      balance += Number(e.credit) - Number(e.debit);
      e.balance = balance;
    }

    return res.json({ supplier, entries, closingBalance: balance });
  } catch (err) { return next(err); }
}
