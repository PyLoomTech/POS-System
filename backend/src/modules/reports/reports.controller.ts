import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';

const exportSchema = z.object({
  title: z.string().trim().min(1).max(150),
  dateRange: z.string().trim().max(120).optional(),
  companyName: z.string().trim().min(1).max(150).default('Pyloom POS'),
  columns: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  rows: z.array(z.array(z.string().max(2000))).max(50_000),
});

export async function exportReportXlsx(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = exportSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    if (parsed.data.rows.some((row) => row.length !== parsed.data.columns.length)) {
      return next(createError('Export rows must match the report columns.', 400));
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');
    worksheet.addRow([parsed.data.companyName]);
    worksheet.mergeCells(1, 1, 1, parsed.data.columns.length);
    worksheet.addRow([parsed.data.title]);
    worksheet.mergeCells(2, 1, 2, parsed.data.columns.length);
    worksheet.addRow([parsed.data.dateRange ? `Date range: ${parsed.data.dateRange}` : '']);
    worksheet.mergeCells(3, 1, 3, parsed.data.columns.length);
    worksheet.addRow([`Generated: ${new Date().toISOString()}`]);
    worksheet.mergeCells(4, 1, 4, parsed.data.columns.length);
    const header = worksheet.addRow(parsed.data.columns);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B6ABA' } };
    for (const row of parsed.data.rows) worksheet.addRow(row);
    worksheet.views = [{ state: 'frozen', ySplit: 5 }];
    worksheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: 5, column: parsed.data.columns.length },
    };
    worksheet.columns = parsed.data.columns.map((column, index) => {
      const maxLength = Math.max(
        column.length,
        ...parsed.data.rows.map((row) => row[index]?.length ?? 0),
      );
      return { width: Math.min(Math.max(maxLength + 2, 12), 42) };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = parsed.data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (err) { return next(err); }
}

function parseRange(query: any): { from: Date; to: Date } {
  const to = query.to ? new Date(String(query.to)) : new Date();
  const from = query.from
    ? new Date(String(query.from))
    : new Date(to.getFullYear(), to.getMonth(), 1);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw createError('Invalid report date range.', 400);
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  if (from > to) throw createError('The start date must be on or before the end date.', 400);
  return { from, to };
}

function parsePagination(query: any): { page: number; limit: number; skip: number } {
  const requestedPage = Number(query.page ?? 1);
  const requestedLimit = Number(query.limit ?? 50);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 1_000_000) {
    throw createError('Page must be a positive whole number.', 400);
  }
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    throw createError('Page size must be between 1 and 100.', 400);
  }
  const page = requestedPage;
  const limit = requestedLimit;
  return { page, limit, skip: (page - 1) * limit };
}

export async function getSalesRegister(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);
    const { page, limit, skip } = parsePagination(req.query);
    const search = String(req.query.search ?? '').trim().slice(0, 100);
    const status = String(req.query.status ?? '');
    const paymentStatus = String(req.query.paymentStatus ?? '');
    const paymentMethod = String(req.query.paymentMethod ?? '');
    const cashier = String(req.query.cashier ?? '').trim().slice(0, 100);
    const cashierId = Number(req.query.cashierId);

    const where: any = { invoiceDate: { gte: from, lte: to } };
    if (['draft', 'confirmed', 'cancelled', 'returned'].includes(status)) where.status = status;
    if (['cash', 'bank_transfer', 'card', 'digital_wallet', 'qr', 'customer_credit', 'split'].includes(paymentMethod)) {
      where.paymentMethod = paymentMethod;
    }
    if (Number.isInteger(cashierId) && cashierId > 0) where.cashierId = cashierId;
    if (cashier) where.cashier = { fullName: { contains: cashier, mode: 'insensitive' } };
    if (paymentStatus === 'paid') where.outstandingAmount = { lte: 0 };
    if (paymentStatus === 'unpaid') where.paidAmount = { lte: 0 };
    if (paymentStatus === 'partial') {
      where.paidAmount = { gt: 0 };
      where.outstandingAmount = { gt: 0 };
    }
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, rows, summary] = await Promise.all([
      prisma.salesInvoice.count({ where }),
      prisma.salesInvoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          cashier: { select: { id: true, fullName: true } },
        },
        orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.salesInvoice.aggregate({
        where,
        _count: { id: true },
        _sum: {
          grandTotal: true,
          discountAmount: true,
          paidAmount: true,
          outstandingAmount: true,
        },
      }),
    ]);

    return res.json({
      data: rows.map((row) => ({
        ...row,
        paymentStatus: Number(row.outstandingAmount) <= 0
          ? 'paid'
          : Number(row.paidAmount) > 0 ? 'partial' : 'unpaid',
      })),
      total,
      page,
      limit,
      summary: {
        invoiceCount: summary._count.id,
        grossSales: summary._sum.grandTotal ?? 0,
        discount: summary._sum.discountAmount ?? 0,
        collected: summary._sum.paidAmount ?? 0,
        outstanding: Math.max(Number(summary._sum.outstandingAmount ?? 0), 0),
      },
    });
  } catch (err) { return next(err); }
}

export async function getSalesSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);

    const [sales, returns] = await Promise.all([
      prisma.salesInvoice.aggregate({
        where: { invoiceDate: { gte: from, lte: to }, status: 'confirmed' },
        _sum: { subtotal: true, discountAmount: true, taxableAmount: true, taxAmount: true, grandTotal: true, paidAmount: true, outstandingAmount: true },
        _count: { id: true },
      }),
      prisma.salesReturn.aggregate({
        where: { returnDate: { gte: from, lte: to } },
        _sum: { totalAmount: true, taxAmount: true },
        _count: { id: true },
      }),
    ]);

    return res.json({
      from, to,
      invoiceCount: sales._count.id,
      subtotal: sales._sum.subtotal || 0,
      discount: sales._sum.discountAmount || 0,
      taxableAmount: sales._sum.taxableAmount || 0,
      taxAmount: sales._sum.taxAmount || 0,
      grandTotal: sales._sum.grandTotal || 0,
      paidAmount: sales._sum.paidAmount || 0,
      outstandingAmount: Math.max(Number(sales._sum.outstandingAmount || 0), 0),
      returnCount: returns._count.id,
      returnAmount: returns._sum.totalAmount || 0,
      netSales: Number(sales._sum.grandTotal || 0) - Number(returns._sum.totalAmount || 0),
    });
  } catch (err) { return next(err); }
}

export async function getSalesByItem(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);
    const { page, limit, skip } = parsePagination(req.query);
    const search = String(req.query.search ?? '').trim().slice(0, 100);
    const invoice = String(req.query.invoice ?? '').trim().slice(0, 100);
    const customer = String(req.query.customer ?? '').trim().slice(0, 100);
    const cashier = String(req.query.cashier ?? '').trim().slice(0, 100);
    const categoryId = Number(req.query.categoryId);
    const customerId = Number(req.query.customerId);
    const cashierId = Number(req.query.cashierId);
    const where = Prisma.sql`
      si.status = 'confirmed'
      AND si.invoice_date >= ${from} AND si.invoice_date <= ${to}
      ${search ? Prisma.sql`AND (
        i.name ILIKE ${`%${search}%`}
        OR i.item_code ILIKE ${`%${search}%`}
        OR COALESCE(i.barcode, '') ILIKE ${`%${search}%`}
        OR EXISTS (
          SELECT 1 FROM item_barcodes ib
          WHERE ib.item_id = i.id AND ib.barcode ILIKE ${`%${search}%`}
        )
      )` : Prisma.empty}
      ${Number.isInteger(categoryId) && categoryId > 0 ? Prisma.sql`AND i.category_id = ${categoryId}` : Prisma.empty}
      ${Number.isInteger(customerId) && customerId > 0 ? Prisma.sql`AND si.customer_id = ${customerId}` : Prisma.empty}
      ${Number.isInteger(cashierId) && cashierId > 0 ? Prisma.sql`AND si.cashier_id = ${cashierId}` : Prisma.empty}
      ${customer ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM customers c
        WHERE c.id = si.customer_id
          AND (c.name ILIKE ${`%${customer}%`} OR COALESCE(c.phone, '') ILIKE ${`%${customer}%`})
      )` : Prisma.empty}
      ${cashier ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = si.cashier_id AND u.full_name ILIKE ${`%${cashier}%`}
      )` : Prisma.empty}
      ${invoice ? Prisma.sql`AND si.invoice_number ILIKE ${`%${invoice}%`}` : Prisma.empty}
    `;
    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<any[]>`
      WITH invoice_totals AS (
        SELECT invoice_id, SUM(line_total) AS invoice_line_total
        FROM sales_invoice_items
        GROUP BY invoice_id
      ), sale_lines AS (
        SELECT i.id AS item_id, i.item_code, i.name, COALESCE(c.name, 'Uncategorized') AS category,
               sii.id AS line_id, sii.quantity, sii.conversion_factor, sii.unit_price,
               sii.line_total, sii.discount_amount, sii.tax_amount, si.id AS invoice_id,
               si.grand_total, it.invoice_line_total
        FROM sales_invoice_items sii
        JOIN items i ON i.id = sii.item_id
        JOIN sales_invoices si ON si.id = sii.invoice_id
        JOIN invoice_totals it ON it.invoice_id = si.id
        LEFT JOIN categories c ON c.id = i.category_id
        WHERE ${where}
      )
      SELECT item_id AS "itemId", item_code AS "itemCode", name, category,
             SUM(quantity * conversion_factor)::float8 AS quantity,
             SUM(line_total * grand_total / NULLIF(invoice_line_total, 0))::float8 AS revenue,
             SUM(discount_amount + line_total * (1 - grand_total / NULLIF(invoice_line_total, 0)))::float8 AS discount,
             SUM(tax_amount * grand_total / NULLIF(invoice_line_total, 0))::float8 AS tax,
             SUM((line_total - tax_amount) * grand_total / NULLIF(invoice_line_total, 0))::float8 AS "netRevenue",
             COUNT(DISTINCT invoice_id)::int AS "transactionCount",
             CASE WHEN SUM(quantity * conversion_factor) = 0 THEN 0
               ELSE (SUM((line_total - tax_amount) * grand_total / NULLIF(invoice_line_total, 0)) /
                 SUM(quantity * conversion_factor))::float8
             END AS "averageSellingPrice"
      FROM sale_lines
      GROUP BY item_id, item_code, name, category
      ORDER BY revenue DESC, name
      LIMIT ${limit} OFFSET ${skip}
      `,
      prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int AS total FROM (
          SELECT i.id
          FROM sales_invoice_items sii
          JOIN items i ON i.id = sii.item_id
          JOIN sales_invoices si ON si.id = sii.invoice_id
          LEFT JOIN categories c ON c.id = i.category_id
          WHERE ${where}
          GROUP BY i.id
        ) grouped_items
      `,
    ]);
    return res.json({ from, to, data: rows, total: countRows[0]?.total ?? 0, page, limit });
  } catch (err) { return next(err); }
}

export async function getSalesReturnRegister(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);
    const { page, limit, skip } = parsePagination(req.query);
    const search = String(req.query.search ?? '').trim().slice(0, 100);
    const where: any = { returnDate: { gte: from, lte: to } };
    if (search) {
      where.OR = [
        { returnNumber: { contains: search, mode: 'insensitive' } },
        { originalInvoice: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
        { items: { some: { item: { name: { contains: search, mode: 'insensitive' } } } } },
        { items: { some: { item: { itemCode: { contains: search, mode: 'insensitive' } } } } },
        { items: { some: { item: { barcode: { contains: search, mode: 'insensitive' } } } } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.salesReturn.count({ where }),
      prisma.salesReturn.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          originalInvoice: { select: { id: true, invoiceNumber: true } },
          items: { include: { item: { select: { id: true, itemCode: true, name: true } } } },
        },
        orderBy: [{ returnDate: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);
    const processorIds = [...new Set(rows.map((row) => row.processedBy).filter((id): id is number => id !== null))];
    const processors = processorIds.length
      ? await prisma.user.findMany({ where: { id: { in: processorIds } }, select: { id: true, fullName: true } })
      : [];
    const processorNames = new Map(processors.map((user) => [user.id, user.fullName]));

    return res.json({
      data: rows.map((row) => ({
        ...row,
        processedByName: row.processedBy === null ? null : processorNames.get(row.processedBy) ?? null,
        returnedQuantity: row.items.reduce((sum, item) => sum + Number(item.returnedQty), 0),
      })),
      total,
      page,
      limit,
    });
  } catch (err) { return next(err); }
}

export async function getSalesByCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);
    const rows = await prisma.$queryRaw<any[]>`
      WITH sale_lines AS (
        SELECT c.id AS category_id, COALESCE(c.name, 'Uncategorized') AS category,
               sii.quantity, sii.conversion_factor, sii.line_total, si.id AS invoice_id,
               si.grand_total, SUM(sii.line_total) OVER (PARTITION BY si.id) AS invoice_line_total
        FROM sales_invoice_items sii
        JOIN items i ON i.id = sii.item_id
        LEFT JOIN categories c ON c.id = i.category_id
        JOIN sales_invoices si ON si.id = sii.invoice_id
        WHERE si.status = 'confirmed' AND si.invoice_date >= ${from} AND si.invoice_date <= ${to}
      )
      SELECT COALESCE(category_id, 0) AS "categoryId", category,
             SUM(quantity * conversion_factor)::float AS quantity,
             SUM(line_total * grand_total / NULLIF(invoice_line_total, 0))::float AS revenue
      FROM sale_lines
      GROUP BY category_id, category
      ORDER BY revenue DESC
    `;
    return res.json({ from, to, data: rows });
  } catch (err) { return next(err); }
}

export async function getSalesByCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT c.id AS "customerId", c.customer_code AS "customerCode", c.name, c.phone,
             COUNT(si.id)::int AS "invoiceCount",
             SUM(si.grand_total)::float AS revenue,
             SUM(si.paid_amount)::float AS "paidAmount",
             SUM(si.outstanding_amount)::float AS outstanding
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE si.status = 'confirmed' AND si.invoice_date >= ${from} AND si.invoice_date <= ${to}
      GROUP BY c.id, c.customer_code, c.name, c.phone
      ORDER BY revenue DESC
    `;
    return res.json({ from, to, data: rows });
  } catch (err) { return next(err); }
}

export async function getSalesByCashier(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT si.cashier_id AS "cashierId", COALESCE(u.full_name, 'Unassigned') AS cashier,
             COUNT(si.id)::int AS "invoiceCount",
             SUM(si.grand_total)::float AS revenue,
             SUM(si.paid_amount)::float AS "paidAmount"
      FROM sales_invoices si
      LEFT JOIN users u ON u.id = si.cashier_id
      WHERE si.status = 'confirmed' AND si.invoice_date >= ${from} AND si.invoice_date <= ${to}
      GROUP BY si.cashier_id, u.full_name
      ORDER BY revenue DESC
    `;
    return res.json({ from, to, data: rows });
  } catch (err) { return next(err); }
}

export async function getPurchaseSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);
    const [purchases, returns, suppliers] = await Promise.all([
      prisma.purchaseInvoice.aggregate({
        where: { invoiceDate: { gte: from, lte: to }, status: 'confirmed' },
        _sum: {
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          grandTotal: true,
          paidAmount: true,
          outstandingAmount: true,
        },
        _count: { id: true },
      }),
      prisma.purchaseReturn.aggregate({
        where: { returnDate: { gte: from, lte: to }, status: 'completed' },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      prisma.$queryRaw<any[]>`
        SELECT s.id AS "supplierId", s.supplier_code AS "supplierCode", s.name,
               COUNT(pi.id)::int AS "invoiceCount",
               SUM(pi.grand_total)::float AS purchases,
               SUM(pi.paid_amount)::float AS "paidAmount",
               SUM(pi.outstanding_amount)::float AS outstanding
        FROM purchase_invoices pi
        JOIN suppliers s ON s.id = pi.supplier_id
        WHERE pi.status = 'confirmed' AND pi.invoice_date >= ${from} AND pi.invoice_date <= ${to}
        GROUP BY s.id, s.supplier_code, s.name
        ORDER BY purchases DESC
      `,
    ]);

    const totalPurchases = Number(purchases._sum.grandTotal || 0);
    const returnAmount = Number(returns._sum.totalAmount || 0);
    return res.json({
      from,
      to,
      invoiceCount: purchases._count.id,
      subtotal: purchases._sum.subtotal || 0,
      discount: purchases._sum.discountAmount || 0,
      taxAmount: purchases._sum.taxAmount || 0,
      totalPurchases,
      paidAmount: purchases._sum.paidAmount || 0,
      outstandingAmount: Math.max(Number(purchases._sum.outstandingAmount || 0), 0),
      returnCount: returns._count.id,
      returnAmount,
      netPurchases: totalPurchases - returnAmount,
      suppliers,
    });
  } catch (err) { return next(err); }
}

export async function getLowStock(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT i.id AS "itemId", i.item_code AS "itemCode", i.name,
             COALESCE(SUM(sb.quantity), 0)::float AS quantity,
             i.reorder_level::float AS "reorderLevel",
             GREATEST(i.reorder_level - COALESCE(SUM(sb.quantity), 0), 0)::float AS "suggestedOrder",
             COALESCE(SUM(sb.quantity * sb.average_cost), 0)::float AS value
      FROM items i
      LEFT JOIN stock_balances sb ON sb.item_id = i.id
      WHERE i.is_active = true
      GROUP BY i.id, i.item_code, i.name, i.reorder_level
      HAVING COALESCE(SUM(sb.quantity), 0) <= i.reorder_level
      ORDER BY "suggestedOrder" DESC, i.name
    `;
    return res.json({ data: rows, itemCount: rows.length });
  } catch (err) { return next(err); }
}

export async function getInventoryMovements(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT im.id::text AS id, im.created_at AS "createdAt",
             im.movement_type AS "movementType", im.quantity::float AS quantity,
             im.unit_cost::float AS "unitCost", im.reference_type AS "referenceType",
             im.narration, i.item_code AS "itemCode", i.name AS item,
             w.name AS warehouse
      FROM inventory_movements im
      JOIN items i ON i.id = im.item_id
      JOIN warehouses w ON w.id = im.warehouse_id
      WHERE im.created_at >= ${from} AND im.created_at <= ${to}
      ORDER BY im.created_at DESC, im.id DESC
      LIMIT 500
    `;
    return res.json({ from, to, data: rows, limit: 500 });
  } catch (err) { return next(err); }
}

export async function getProfitAndLoss(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);

    const grouped = await prisma.$queryRaw<any[]>`
      SELECT a.account_code AS "accountCode", a.name, a.account_type AS "accountType",
             COALESCE(SUM(jl.debit), 0)::float AS debit,
             COALESCE(SUM(jl.credit), 0)::float AS credit
      FROM journal_entry_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      JOIN accounts a ON a.id = jl.account_id
      WHERE je.status = 'posted' AND je.voucher_date >= ${from} AND je.voucher_date <= ${to}
      GROUP BY a.account_code, a.name, a.account_type
      ORDER BY a.account_code
    `;

    let revenue = 0;
    let cogs = 0;
    let expenses = 0;
    const revenueAccounts: any[] = [];
    const expenseAccounts: any[] = [];

    for (const r of grouped) {
      if (r.accountType === 'revenue') {
        const amount = Number(r.credit) - Number(r.debit);
        revenue += amount;
        revenueAccounts.push({ accountCode: r.accountCode, name: r.name, amount });
      } else if (r.accountType === 'expense') {
        const amount = Number(r.debit) - Number(r.credit);
        if (String(r.accountCode).startsWith('5')) cogs += amount;
        else expenses += amount;
        expenseAccounts.push({ accountCode: r.accountCode, name: r.name, amount });
      }
    }

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenses;

    return res.json({
      from, to,
      revenue, cogs, grossProfit, expenses, netProfit,
      revenueAccounts, expenseAccounts,
    });
  } catch (err) { return next(err); }
}

export async function getStockValuation(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT i.id AS "itemId", i.item_code AS "itemCode", i.name,
             sb.quantity::float AS quantity,
             sb.average_cost::float AS "averageCost",
             (sb.quantity * sb.average_cost)::float AS value,
             w.name AS warehouse
      FROM stock_balances sb
      JOIN items i ON i.id = sb.item_id
      JOIN warehouses w ON w.id = sb.warehouse_id
      ORDER BY value DESC
    `;
    const totalValue = rows.reduce((s, r) => s + Number(r.value || 0), 0);
    const totalQuantity = rows.reduce((s, r) => s + Number(r.quantity || 0), 0);
    return res.json({ data: rows, totalValue, totalQuantity });
  } catch (err) { return next(err); }
}

export async function getVatReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);

    const [sales, salesReturns, purchases] = await Promise.all([
      prisma.salesInvoice.aggregate({
        where: { invoiceDate: { gte: from, lte: to }, status: 'confirmed' },
        _sum: { taxableAmount: true, taxAmount: true, nonTaxableAmount: true },
      }),
      prisma.salesReturn.aggregate({
        where: { returnDate: { gte: from, lte: to } },
        _sum: { taxAmount: true },
      }),
      prisma.purchaseInvoice.aggregate({
        where: { invoiceDate: { gte: from, lte: to }, status: 'confirmed' },
        _sum: { subtotal: true, taxAmount: true },
      }),
    ]);

    const outputVat = Number(sales._sum.taxAmount || 0) - Number(salesReturns._sum.taxAmount || 0);
    const inputVat = Number(purchases._sum.taxAmount || 0);

    return res.json({
      from, to,
      sales: {
        taxableAmount: sales._sum.taxableAmount || 0,
        nonTaxableAmount: sales._sum.nonTaxableAmount || 0,
        outputVat,
      },
      purchases: {
        taxableAmount: purchases._sum.subtotal || 0,
        inputVat,
      },
      netVatPayable: outputVat - inputVat,
    });
  } catch (err) { return next(err); }
}

export async function getReceivables(_req: Request, res: Response, next: NextFunction) {
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
    const total = rows.reduce((s, r) => s + Number(r.outstanding || 0), 0);
    return res.json({ data: rows, total });
  } catch (err) { return next(err); }
}

export async function getPayables(_req: Request, res: Response, next: NextFunction) {
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
    const total = rows.reduce((s, r) => s + Number(r.outstanding || 0), 0);
    return res.json({ data: rows, total });
  } catch (err) { return next(err); }
}

export async function getDayBook(req: Request, res: Response, next: NextFunction) {
  try {
    const date = req.query.date ? new Date(String(req.query.date)) : new Date();
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);

    const [salesInvoices, purchaseInvoices, payments, returns] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: { invoiceDate: { gte: dayStart, lte: dayEnd } },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.purchaseInvoice.findMany({
        where: { invoiceDate: { gte: dayStart, lte: dayEnd } },
        include: { supplier: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.payment.findMany({
        where: { paymentDate: { gte: dayStart, lte: dayEnd }, paymentStatus: 'completed' },
        include: { customer: { select: { name: true } }, supplier: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.salesReturn.findMany({
        where: { returnDate: { gte: dayStart, lte: dayEnd } },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return res.json({
      date: dayStart.toISOString().slice(0, 10),
      salesInvoices, purchaseInvoices, payments, salesReturns: returns,
    });
  } catch (err) { return next(err); }
}
