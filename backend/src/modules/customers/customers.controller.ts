import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';
import { normalizePhone } from '../../utils/phone';

const customerSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().optional().nullable(),
  alternatePhone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  panVatNumber: z.string().optional().nullable(),
  idCardType: z.string().max(50).optional().nullable(),
  idCardNumber: z.string().max(100).optional().nullable(),
  idCardImageUrl: z.string().max(500).optional().nullable(),
  openingBalance: z.number().default(0),
  creditLimit: z.number().default(0),
});

export async function listCustomers(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, page = 1, limit = 50, active } = req.query;
    const where: any = { isWalkin: false };
    if (active !== undefined) where.isActive = active === 'true';
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { phone: { contains: String(search) } },
        { panVatNumber: { contains: String(search) } },
      ];
    }
    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where, skip: (Number(page) - 1) * Number(limit),
        take: Number(limit), orderBy: { name: 'asc' },
      }),
    ]);
    return res.json({ data: customers, total, page: Number(page), limit: Number(limit) });
  } catch (err) { return next(err); }
}

export async function createCustomer(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    let phoneNormalized: string | null = null;
    if (data.phone) {
      phoneNormalized = normalizePhone(data.phone);
      const exists = await prisma.customer.findFirst({
        where: { phoneNormalized, isWalkin: false },
      });
      if (exists) return next(createError(`A customer with phone ${data.phone} already exists.`, 409));
    }

    // Auto-generate customer code
    const count = await prisma.customer.count();
    const customerCode = `CUST-${String(count + 1).padStart(5, '0')}`;

    const customer = await prisma.customer.create({
      data: {
        customerCode,
        name: data.name,
        phone: data.phone || null,
        phoneNormalized,
        alternatePhone: data.alternatePhone || null,
        email: data.email || null,
        address: data.address || null,
        panVatNumber: data.panVatNumber || null,
        idCardType: data.idCardType || null,
        idCardNumber: data.idCardNumber || null,
        idCardImageUrl: data.idCardImageUrl || null,
        openingBalance: data.openingBalance,
        creditLimit: data.creditLimit,
        createdBy: req.user?.id,
      },
    });
    return res.status(201).json(customer);
  } catch (err) { return next(err); }
}

export async function getWalkinCustomer(_req: Request, res: Response, next: NextFunction) {
  try {
    const customer = await prisma.customer.findFirst({
      where: { isWalkin: true },
      select: { id: true, name: true, customerCode: true },
    });
    if (!customer) return next(createError('Walk-in customer is not configured.', 404));
    return res.json(customer);
  } catch (err) { return next(err); }
}

export async function getCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!customer) return next(createError('Customer not found.', 404));
    return res.json(customer);
  } catch (err) { return next(err); }
}

export async function updateCustomer(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const parsed = customerSchema.partial().safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    const old = await prisma.customer.findUnique({ where: { id } });
    if (!old) return next(createError('Customer not found.', 404));

    let phoneNormalized = old.phoneNormalized;
    if (data.phone !== undefined) {
      phoneNormalized = data.phone ? normalizePhone(data.phone) : null;
      if (phoneNormalized && phoneNormalized !== old.phoneNormalized) {
        const dup = await prisma.customer.findFirst({
          where: { phoneNormalized, isWalkin: false, id: { not: id } },
        });
        if (dup) return next(createError(`Phone number already used by another customer.`, 409));
      }
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { ...data, phoneNormalized },
    });

    await prisma.auditLog.create({
      data: { userId: req.user?.id, username: req.user?.username, action: 'UPDATE_CUSTOMER',
        entity: 'customers', entityId: String(id), oldValues: old as any, newValues: data as any },
    });
    return res.json(customer);
  } catch (err) { return next(err); }
}

export async function getCustomerLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const customerId = Number(req.params.id);
    const { from, to } = req.query;

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return next(createError('Customer not found.', 404));

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(String(from));
    if (to) dateFilter.lte = new Date(String(to));

    const invoices = await prisma.salesInvoice.findMany({
      where: { customerId, ...(Object.keys(dateFilter).length ? { invoiceDate: dateFilter } : {}) },
      include: { items: false },
      orderBy: { invoiceDate: 'asc' },
    });

    const payments = await prisma.payment.findMany({
      where: { customerId, ...(Object.keys(dateFilter).length ? { paymentDate: dateFilter } : {}) },
      orderBy: { paymentDate: 'asc' },
    });

    // Build ledger entries
    const entries: any[] = [];
    for (const inv of invoices) {
      entries.push({ date: inv.invoiceDate, type: 'Invoice', ref: inv.invoiceNumber,
        debit: inv.grandTotal, credit: 0, balance: 0 });
    }
    for (const pay of payments) {
      entries.push({ date: pay.paymentDate, type: 'Payment', ref: pay.paymentNumber,
        debit: 0, credit: pay.amount, balance: 0 });
    }
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let balance = Number(customer.openingBalance);
    for (const e of entries) {
      balance += Number(e.debit) - Number(e.credit);
      e.balance = balance;
    }

    return res.json({ customer, openingBalance: customer.openingBalance, entries, closingBalance: balance });
  } catch (err) { return next(err); }
}

export async function getCustomerStatement(req: Request, res: Response, next: NextFunction) {
  try {
    const customerId = Number(req.params.id);
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return next(createError('Customer not found.', 404));

    const outstanding = await prisma.salesInvoice.aggregate({
      where: { customerId, status: { in: ['confirmed', 'returned'] } },
      _sum: { outstandingAmount: true },
    });

    return res.json({
      customer,
      totalOutstanding: outstanding._sum.outstandingAmount || 0,
    });
  } catch (err) { return next(err); }
}

// ─── Identity document upload ────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'D:/Pyloom POS System/uploads';
const documentDir = path.join(UPLOAD_DIR, 'documents');

const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(documentDir, { recursive: true });
    cb(null, documentDir);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

export const uploadCustomerDocumentMiddleware = multer({
  storage: documentStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(createError('Only image files (jpg, png, webp) are allowed.', 400));
  },
}).single('document');

export async function uploadCustomerDocument(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) return next(createError('No document file uploaded.', 400));
    const url = `/uploads/documents/${req.file.filename}`;
    return res.status(201).json({ url });
  } catch (err) { return next(err); }
}

// ─── Export customers to Excel ───────────────────────────────
export async function exportCustomersExcel(req: Request, res: Response, next: NextFunction) {
  try {
    const { search } = req.query;
    const where: any = { isWalkin: false };
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { phone: { contains: String(search) } },
        { panVatNumber: { contains: String(search) } },
      ];
    }
    const customers = await prisma.customer.findMany({ where, orderBy: { name: 'asc' } });

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pyloom POS';
    const sheet = workbook.addWorksheet('Customers');
    sheet.columns = [
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Alternate Phone', key: 'altPhone', width: 16 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'PAN/VAT', key: 'pan', width: 16 },
      { header: 'ID Type', key: 'idType', width: 16 },
      { header: 'ID Number', key: 'idNumber', width: 20 },
      { header: 'Credit Limit', key: 'creditLimit', width: 14 },
      { header: 'Balance', key: 'balance', width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const c of customers) {
      sheet.addRow({
        code: c.customerCode || '',
        name: c.name,
        phone: c.phone || '',
        altPhone: c.alternatePhone || '',
        email: c.email || '',
        address: c.address || '',
        pan: c.panVatNumber || '',
        idType: c.idCardType || '',
        idNumber: c.idCardNumber || '',
        creditLimit: Number(c.creditLimit),
        balance: Number(c.openingBalance),
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.xlsx"');
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) { return next(err); }
}
