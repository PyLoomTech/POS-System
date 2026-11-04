import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';

export async function getDashboardStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      todaySales,
      monthSales,
      totalCustomers,
      totalItems,
      lowStockRows,
      receivable,
      payable,
      topItems,
    ] = await Promise.all([
      prisma.salesInvoice.aggregate({
        where: { invoiceDate: { gte: todayStart, lte: todayEnd }, status: 'confirmed' },
        _sum: { grandTotal: true, paidAmount: true },
        _count: { id: true },
      }),
      prisma.salesInvoice.aggregate({
        where: { invoiceDate: { gte: monthStart }, status: 'confirmed' },
        _sum: { grandTotal: true, taxAmount: true },
        _count: { id: true },
      }),
      prisma.customer.count({ where: { isWalkin: false, isActive: true } }),
      prisma.item.count({ where: { isActive: true } }),
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM stock_balances sb
        JOIN items i ON i.id = sb.item_id
        WHERE i.is_active = true AND sb.quantity <= i.reorder_level
      `,
      prisma.salesInvoice.aggregate({
        where: { status: { in: ['confirmed', 'returned'] }, outstandingAmount: { gt: 0 } },
        _sum: { outstandingAmount: true },
      }),
      prisma.purchaseInvoice.aggregate({
        where: { status: 'confirmed', outstandingAmount: { gt: 0 } },
        _sum: { outstandingAmount: true },
      }),
      prisma.$queryRaw<{ itemId: number; name: string; itemCode: string; quantity: number; revenue: number }[]>`
        SELECT i.id AS "itemId", i.name, i.item_code AS "itemCode",
               SUM(sii.quantity)::float AS quantity,
               SUM(sii.line_total)::float AS revenue
        FROM sales_invoice_items sii
        JOIN items i ON i.id = sii.item_id
        JOIN sales_invoices si ON si.id = sii.invoice_id
        WHERE si.status = 'confirmed'
        GROUP BY i.id, i.name, i.item_code
        ORDER BY quantity DESC, revenue DESC
        LIMIT 10
      `,
    ]);

    return res.json({
      today: {
        sales: todaySales._sum.grandTotal || 0,
        collected: todaySales._sum.paidAmount || 0,
        invoiceCount: todaySales._count.id,
      },
      month: {
        sales: monthSales._sum.grandTotal || 0,
        tax: monthSales._sum.taxAmount || 0,
        invoiceCount: monthSales._count.id,
      },
      totals: {
        customers: totalCustomers,
        items: totalItems,
        lowStock: Number(lowStockRows[0]?.count || 0),
        receivable: receivable._sum.outstandingAmount || 0,
        payable: payable._sum.outstandingAmount || 0,
      },
      topItems,
    });
  } catch (err) { return next(err); }
}

export async function getAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const days = Number(req.query.days || 30);
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const [trend, topItems, byCategory] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT TO_CHAR(invoice_date, 'YYYY-MM-DD') AS date,
               SUM(grand_total)::float AS sales,
               COUNT(*)::int AS count
        FROM sales_invoices
        WHERE status = 'confirmed' AND invoice_date >= ${from}
        GROUP BY invoice_date
        ORDER BY invoice_date ASC
      `,
      prisma.$queryRaw<any[]>`
        SELECT i.id AS "itemId", i.name,
               SUM(sii.quantity)::float AS quantity,
               SUM(sii.line_total)::float AS revenue
        FROM sales_invoice_items sii
        JOIN items i ON i.id = sii.item_id
        JOIN sales_invoices si ON si.id = sii.invoice_id
        WHERE si.status = 'confirmed' AND si.invoice_date >= ${from}
        GROUP BY i.id, i.name
        ORDER BY revenue DESC
        LIMIT 10
      `,
      prisma.$queryRaw<any[]>`
        SELECT COALESCE(c.name, 'Uncategorized') AS category,
               SUM(sii.line_total)::float AS revenue
        FROM sales_invoice_items sii
        JOIN items i ON i.id = sii.item_id
        LEFT JOIN categories c ON c.id = i.category_id
        JOIN sales_invoices si ON si.id = sii.invoice_id
        WHERE si.status = 'confirmed' AND si.invoice_date >= ${from}
        GROUP BY c.name
        ORDER BY revenue DESC
      `,
    ]);

    return res.json({ days, trend, topItems, byCategory });
  } catch (err) { return next(err); }
}
