import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';

function parseRange(query: any): { from: Date; to: Date } {
  const to = query.to ? new Date(String(query.to)) : new Date();
  const from = query.from ? new Date(String(query.from)) : new Date(to.getFullYear(), to.getMonth(), 1);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
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
      outstandingAmount: sales._sum.outstandingAmount || 0,
      returnCount: returns._count.id,
      returnAmount: returns._sum.totalAmount || 0,
      netSales: Number(sales._sum.grandTotal || 0) - Number(returns._sum.totalAmount || 0),
    });
  } catch (err) { return next(err); }
}

export async function getSalesByItem(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT i.id AS "itemId", i.item_code AS "itemCode", i.name,
             SUM(sii.quantity)::float AS quantity,
             SUM(sii.line_total)::float AS revenue,
             SUM(sii.tax_amount)::float AS tax
      FROM sales_invoice_items sii
      JOIN items i ON i.id = sii.item_id
      JOIN sales_invoices si ON si.id = sii.invoice_id
      WHERE si.status = 'confirmed' AND si.invoice_date >= ${from} AND si.invoice_date <= ${to}
      GROUP BY i.id, i.item_code, i.name
      ORDER BY revenue DESC
    `;
    return res.json({ from, to, data: rows });
  } catch (err) { return next(err); }
}

export async function getSalesByCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = parseRange(req.query);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(c.id, 0) AS "categoryId", COALESCE(c.name, 'Uncategorized') AS category,
             SUM(sii.quantity)::float AS quantity,
             SUM(sii.line_total)::float AS revenue
      FROM sales_invoice_items sii
      JOIN items i ON i.id = sii.item_id
      LEFT JOIN categories c ON c.id = i.category_id
      JOIN sales_invoices si ON si.id = sii.invoice_id
      WHERE si.status = 'confirmed' AND si.invoice_date >= ${from} AND si.invoice_date <= ${to}
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `;
    return res.json({ from, to, data: rows });
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
