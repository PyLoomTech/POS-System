import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { prisma } from '../../config/database';
import { Prisma } from '@prisma/client';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const datePart = z.string().regex(/^\d{2}-\d{2}$/, 'Use MM-DD format.');

const companySettingsSchema = z.object({
  companyName: z.string().trim().min(1).max(255).optional(),
  legalBusinessName: optionalText(255),
  tradingName: optionalText(255),
  companyLogo: optionalText(500),
  alternativeLogo: optionalText(500),
  invoiceLogo: optionalText(500),
  companyStamp: optionalText(500),
  signatureImage: optionalText(500),
  registrationNumber: optionalText(100),
  businessType: optionalText(100),
  industry: optionalText(100),
  description: optionalText(5000),
  primaryContactPerson: optionalText(255),
  addressLine1: optionalText(500),
  addressLine2: optionalText(500),
  billingAddress: optionalText(1000),
  city: optionalText(100),
  stateProvince: optionalText(100),
  country: optionalText(100),
  postalCode: optionalText(30),
  phone: optionalText(50),
  alternativePhone: optionalText(50),
  email: z.string().trim().email().max(255).nullable().optional(),
  website: optionalText(255),
  panVatNumber: optionalText(50),
  currencyCode: z.string().trim().min(3).max(10).regex(/^[A-Za-z0-9]+$/).optional(),
  currencySymbol: z.string().trim().min(1).max(10).optional(),
  currencyPrecision: z.number().int().min(0).max(6).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  language: z.string().trim().min(2).max(20).optional(),
  dateFormat: z.string().trim().min(1).max(40).optional(),
  numberFormat: z.enum(['en-US', 'de-DE', 'en-IN']).optional(),
  calendarSystem: z.enum(['AD', 'BS']).optional(),
  fiscalYearStart: datePart.optional(),
  fiscalYearEnd: datePart.nullable().optional(),
  defaultPaymentTermsDays: z.number().int().min(0).max(3650).optional(),
  defaultTaxRateId: z.number().int().positive().nullable().optional(),
  defaultReceivableAccountId: z.number().int().positive().nullable().optional(),
  defaultPayableAccountId: z.number().int().positive().nullable().optional(),
  defaultCashAccountId: z.number().int().positive().nullable().optional(),
  defaultBankAccountId: z.number().int().positive().nullable().optional(),
  defaultIncomeAccountId: z.number().int().positive().nullable().optional(),
  defaultExpenseAccountId: z.number().int().positive().nullable().optional(),
  defaultStockAccountId: z.number().int().positive().nullable().optional(),
  defaultCogsAccountId: z.number().int().positive().nullable().optional(),
  invoiceFooter: optionalText(5000),
});

const accountDefaults = {
  defaultReceivableAccountId: 'asset',
  defaultPayableAccountId: 'liability',
  defaultCashAccountId: 'asset',
  defaultBankAccountId: 'asset',
  defaultIncomeAccountId: 'revenue',
  defaultExpenseAccountId: 'expense',
  defaultStockAccountId: 'asset',
  defaultCogsAccountId: 'expense',
} as const;

export async function getCompanySettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await prisma.companySettings.findFirst();
    return res.json(settings || {});
  } catch (err) { return next(err); }
}

export async function getCompanySettingOptions(_req: Request, res: Response, next: NextFunction) {
  try {
    const [taxRates, accounts] = await Promise.all([
      prisma.taxRate.findMany({
        where: { isActive: true },
        select: { id: true, name: true, rate: true },
        orderBy: { name: 'asc' },
      }),
      prisma.account.findMany({
        where: { isActive: true, isGroup: false },
        select: { id: true, accountCode: true, name: true, accountType: true },
        orderBy: { accountCode: 'asc' },
      }),
    ]);
    return res.json({
      taxRates: taxRates.map((rate) => ({ ...rate, rate: Number(rate.rate) })),
      accounts,
    });
  } catch (err) { return next(err); }
}

export async function updateCompanySettings(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = companySettingsSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;
    const existing = await prisma.companySettings.findFirst();
    if (!existing && !data.companyName) {
      return next(createError('Company name is required when creating the company profile.', 400));
    }

    if (data.defaultTaxRateId != null) {
      const taxRate = await prisma.taxRate.findFirst({
        where: { id: data.defaultTaxRateId, isActive: true },
        select: { id: true },
      });
      if (!taxRate) return next(createError('Selected default tax rate is not available.', 400));
    }

    for (const [field, accountType] of Object.entries(accountDefaults) as Array<
      [keyof typeof accountDefaults, (typeof accountDefaults)[keyof typeof accountDefaults]]
    >) {
      const accountId = data[field];
      if (accountId == null) continue;
      const account = await prisma.account.findFirst({
        where: { id: accountId, accountType, isActive: true, isGroup: false },
        select: { id: true },
      });
      if (!account) return next(createError(`Selected ${field.replace('default', '').replace('AccountId', '').toLowerCase()} account is not available.`, 400));
    }

    const settings = existing
      ? await prisma.companySettings.update({ where: { id: existing.id }, data })
      : await prisma.companySettings.create({ data: data as { companyName: string } });
    return res.json(settings);
  } catch (err) { return next(err); }
}

const uploadDir = process.env.UPLOAD_DIR || 'D:/Pyloom POS System/uploads';
const companyAssetDir = path.join(uploadDir, 'company');
const assetStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(companyAssetDir, { recursive: true });
    cb(null, companyAssetDir);
  },
  filename: (_req, file, cb) => {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    cb(null, `${Date.now()}-${randomUUID()}${extensions[file.mimetype] ?? '.bin'}`);
  },
});

export const uploadCompanyAssetMiddleware = multer({
  storage: assetStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(createError('Only JPG, PNG, and WebP image files are allowed.', 400));
  },
}).single('file');

const companyAssetFields = {
  logo: 'companyLogo',
  'alternative-logo': 'alternativeLogo',
  'invoice-logo': 'invoiceLogo',
  stamp: 'companyStamp',
  signature: 'signatureImage',
} as const;

export function validateCompanyAsset(req: Request, _res: Response, next: NextFunction) {
  const asset = req.params.asset;
  if (typeof asset !== 'string' || !Object.hasOwn(companyAssetFields, asset)) {
    return next(createError('Unsupported company asset.', 400));
  }
  return next();
}

export async function uploadCompanyAsset(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) return next(createError('No image file uploaded.', 400));
    const asset = req.params.asset;
    if (typeof asset !== 'string') return next(createError('Unsupported company asset.', 400));
    const field = companyAssetFields[asset as keyof typeof companyAssetFields];
    if (!field) return next(createError('Unsupported company asset.', 400));

    const existing = await prisma.companySettings.findFirst();
    if (!existing) return next(createError('Save the company profile before uploading assets.', 400));

    const url = `/uploads/company/${req.file.filename}`;
    const settings = await prisma.companySettings.update({
      where: { id: existing.id },
      data: { [field]: url },
    });
    return res.status(201).json({ url, settings });
  } catch (err) { return next(err); }
}

const printTemplateSchema = z.object({
  branchId: z.number().int().positive().nullable().optional(),
  documentType: z.enum([
    'sales_invoice', 'pos_receipt', 'sales_order', 'quotation', 'sales_return',
    'delivery_note', 'purchase_order', 'purchase_receipt', 'purchase_invoice',
    'purchase_return', 'payment_receipt', 'customer_payment_voucher',
    'supplier_payment_voucher', 'journal_entry', 'shift_opening', 'shift_closing',
  ]),
  name: z.string().trim().min(1).max(255),
  pageSize: z.enum(['A4', 'A5', 'LETTER', 'THERMAL_80', 'THERMAL_58', 'CUSTOM']).default('A4'),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  configuration: z.record(z.string(), z.unknown()).default({}),
});

async function requireCompany() {
  const company = await prisma.companySettings.findFirst({ orderBy: { id: 'asc' } });
  if (!company) throw createError('Configure the company profile before creating print formats.', 400);
  return company;
}

export async function listPrintTemplates(_req: Request, res: Response, next: NextFunction) {
  try {
    const company = await requireCompany();
    const templates = await prisma.printTemplate.findMany({
      where: { companyId: company.id },
      include: { versions: { select: { id: true, version: true, status: true, createdAt: true } } },
      orderBy: [{ documentType: 'asc' }, { name: 'asc' }],
    });
    return res.json(templates);
  } catch (err) { return next(err); }
}

export async function getPrintTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await requireCompany();
    const template = await prisma.printTemplate.findFirst({
      where: { id: Number(req.params.id), companyId: company.id },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!template) return next(createError('Print template not found.', 404));
    return res.json(template);
  } catch (err) { return next(err); }
}

export async function createPrintTemplate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = printTemplateSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const company = await requireCompany();
    const data = parsed.data;

    const template = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.printTemplate.updateMany({
          where: { companyId: company.id, documentType: data.documentType, branchId: data.branchId ?? null },
          data: { isDefault: false },
        });
      }
      const created = await tx.printTemplate.create({
        data: {
          companyId: company.id,
          branchId: data.branchId ?? null,
          documentType: data.documentType,
          name: data.name,
          pageSize: data.pageSize,
          orientation: data.orientation,
          status: 'draft',
          isDefault: data.isDefault ?? false,
          isActive: data.isActive ?? true,
          configuration: data.configuration as Prisma.InputJsonValue,
          createdBy: req.user?.id,
        },
      });
      await tx.printTemplateVersion.create({
        data: {
          templateId: created.id,
          version: 1,
          status: 'draft',
          configuration: data.configuration as Prisma.InputJsonValue,
          createdBy: req.user?.id,
        },
      });
      return created;
    });
    return res.status(201).json(template);
  } catch (err) { return next(err); }
}

export async function updatePrintTemplate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = printTemplateSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const company = await requireCompany();
    const existing = await prisma.printTemplate.findFirst({
      where: { id: Number(req.params.id), companyId: company.id },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!existing) return next(createError('Print template not found.', 404));

    const data = parsed.data;
    const template = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.printTemplate.updateMany({
          where: { companyId: company.id, documentType: data.documentType, branchId: data.branchId ?? null, id: { not: existing.id } },
          data: { isDefault: false },
        });
      }
      const updated = await tx.printTemplate.update({
        where: { id: existing.id },
        data: {
          branchId: data.branchId ?? null,
          documentType: data.documentType,
          name: data.name,
          pageSize: data.pageSize,
          orientation: data.orientation,
          isDefault: data.isDefault ?? existing.isDefault,
          isActive: data.isActive ?? existing.isActive,
          configuration: data.configuration as Prisma.InputJsonValue,
          status: existing.status === 'published' ? 'draft' : existing.status,
        },
      });
      const nextVersion = (existing.versions[0]?.version ?? 0) + 1;
      await tx.printTemplateVersion.create({
        data: {
          templateId: existing.id,
          version: nextVersion,
          status: 'draft',
          configuration: data.configuration as Prisma.InputJsonValue,
          createdBy: req.user?.id,
        },
      });
      return updated;
    });
    return res.json(template);
  } catch (err) { return next(err); }
}

export async function publishPrintTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await requireCompany();
    const existing = await prisma.printTemplate.findFirst({
      where: { id: Number(req.params.id), companyId: company.id },
    });
    if (!existing) return next(createError('Print template not found.', 404));
    if (existing.isDefault) {
      await prisma.printTemplate.updateMany({
        where: { companyId: company.id, documentType: existing.documentType, branchId: existing.branchId, id: { not: existing.id } },
        data: { isDefault: false },
      });
    }
    const published = await prisma.printTemplate.update({
      where: { id: existing.id },
      data: { status: 'published', isActive: true },
    });
    return res.json(published);
  } catch (err) { return next(err); }
}

export async function deletePrintTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await requireCompany();
    const existing = await prisma.printTemplate.findFirst({
      where: { id: Number(req.params.id), companyId: company.id },
    });
    if (!existing) return next(createError('Print template not found.', 404));
    await prisma.printTemplate.delete({ where: { id: existing.id } });
    return res.status(204).send();
  } catch (err) { return next(err); }
}

export async function restorePrintTemplateVersion(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const versionId = Number(req.body.versionId);
    if (!Number.isInteger(versionId) || versionId <= 0) {
      return next(createError('A valid versionId is required.', 400));
    }
    const company = await requireCompany();
    const version = await prisma.printTemplateVersion.findFirst({
      where: { id: versionId, template: { id: Number(req.params.id), companyId: company.id } },
    });
    if (!version) return next(createError('Template version not found.', 404));
    const template = await prisma.printTemplate.update({
      where: { id: Number(req.params.id) },
      data: { configuration: version.configuration as Prisma.InputJsonValue, status: 'draft' },
    });
    return res.json(template);
  } catch (err) { return next(err); }
}

export async function previewPrintTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await requireCompany();
    const template = await prisma.printTemplate.findFirst({
      where: { id: Number(req.params.id), companyId: company.id },
    });
    if (!template) return next(createError('Print template not found.', 404));
    return res.json({
      template,
      sample: true,
      company,
    });
  } catch (err) { return next(err); }
}

export async function getSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await prisma.appSetting.findMany();
    const map: Record<string, string | null> = {};
    for (const s of settings) map[s.key] = s.value;
    return res.json(map);
  } catch (err) { return next(err); }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      await prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
    return res.json({ message: 'Settings updated.' });
  } catch (err) { return next(err); }
}
