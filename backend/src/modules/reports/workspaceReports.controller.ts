import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';

function getRange(query: Request['query']) {
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

function getPage(query: Request['query']) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) {
    throw createError('Page must be a positive whole number.', 400);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw createError('Page size must be between 1 and 100.', 400);
  }
  return { page, limit, skip: (page - 1) * limit };
}

function optionalId(value: unknown, name: string): number | null {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw createError(`Invalid ${name}.`, 400);
  return id;
}

async function paged(query: Prisma.Sql, order: Prisma.Sql, page: number, limit: number, skip: number) {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT report_rows.*, COUNT(*) OVER()::int AS "__total"
    FROM (${query}) AS report_rows
    ${order}
    LIMIT ${limit} OFFSET ${skip}
  `);
  const total = Number(rows[0]?.__total ?? 0);
  return {
    data: rows.map(({ __total: _total, ...row }) => row),
    total,
    page,
    limit,
  };
}

const byDate = Prisma.sql`ORDER BY report_rows."date" DESC, report_rows.id DESC`;
const byAmount = Prisma.sql`ORDER BY report_rows.amount DESC`;

export async function getWorkspaceReport(req: Request, res: Response, next: NextFunction) {
  try {
    const report = String(req.params.report);
    const { from, to } = getRange(req.query);
    const { page, limit, skip } = getPage(req.query);
    const search = String(req.query.search ?? '').trim().slice(0, 100);
    const itemId = optionalId(req.query.itemId, 'item id');
    const partyId = optionalId(req.query.partyId, 'party id');
    const categoryId = optionalId(req.query.categoryId, 'category id');
    const cashierId = optionalId(req.query.cashierId, 'cashier id');
    const warehouseId = optionalId(req.query.warehouseId, 'warehouse id');
    const accountId = optionalId(req.query.accountId, 'account id');
    const paymentMethod = String(req.query.paymentMethod ?? '');
    const asOf = req.query.to ? to : new Date();
    let rows: Awaited<ReturnType<typeof paged>>;
    let summary: Record<string, unknown> | undefined;

    switch (report) {
      case 'sales-by-item':
        rows = await paged(Prisma.sql`
          WITH invoice_totals AS (
            SELECT invoice_id, SUM(line_total) AS invoice_line_total
            FROM sales_invoice_items
            GROUP BY invoice_id
          ), lines AS (
            SELECT i.id AS item_id, i.item_code, i.name, COALESCE(c.name, 'Uncategorized') AS category,
                   sii.id AS line_id, sii.quantity, sii.conversion_factor, sii.line_total,
                   sii.discount_amount, sii.tax_amount, si.id AS invoice_id, si.invoice_date,
                   si.grand_total, it.invoice_line_total
            FROM sales_invoice_items sii
            JOIN sales_invoices si ON si.id = sii.invoice_id AND si.status = 'confirmed'
            JOIN invoice_totals it ON it.invoice_id = si.id
            JOIN items i ON i.id = sii.item_id
            LEFT JOIN categories c ON c.id = i.category_id
            WHERE si.invoice_date BETWEEN ${from} AND ${to}
              AND (${itemId}::int IS NULL OR i.id = ${itemId})
              AND (${categoryId}::int IS NULL OR i.category_id = ${categoryId})
              AND (${cashierId}::int IS NULL OR si.cashier_id = ${cashierId})
              AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%')
          )
          SELECT item_id AS "itemId", item_code AS "itemCode", name, category,
                 SUM(quantity * conversion_factor)::float AS quantity,
                 SUM((line_total - tax_amount) * grand_total / NULLIF(invoice_line_total, 0))::float AS revenue,
                 SUM(discount_amount + line_total * (1 - grand_total / NULLIF(invoice_line_total, 0)))::float AS discount,
                 SUM(tax_amount * grand_total / NULLIF(invoice_line_total, 0))::float AS tax,
                 SUM(line_total * grand_total / NULLIF(invoice_line_total, 0))::float AS "netRevenue",
                 COUNT(DISTINCT invoice_id)::int AS "transactionCount",
                 (SUM((line_total - tax_amount) * grand_total / NULLIF(invoice_line_total, 0)) /
                   NULLIF(SUM(quantity * conversion_factor), 0))::float AS "averageSellingPrice",
                 MIN(invoice_date) AS date, MIN(line_id)::text AS id
          FROM lines
          GROUP BY item_id, item_code, name, category
        `, Prisma.sql`ORDER BY report_rows.revenue DESC`, page, limit, skip);
        break;
      case 'sales-by-category':
        rows = await paged(Prisma.sql`
          SELECT c.id AS "categoryId", COALESCE(c.name, 'Uncategorized') AS name,
                 SUM(sii.quantity * sii.conversion_factor)::float AS quantity,
                 SUM(sii.line_total)::float AS amount,
                 COUNT(DISTINCT si.id)::int AS "invoiceCount",
                 MIN(si.invoice_date) AS date, MIN(c.id)::text AS id
          FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id AND si.status = 'confirmed'
          JOIN items i ON i.id = sii.item_id
          LEFT JOIN categories c ON c.id = i.category_id
          WHERE si.invoice_date BETWEEN ${from} AND ${to}
            AND (${categoryId}::int IS NULL OR c.id = ${categoryId})
            AND (${search} = '' OR c.name ILIKE '%' || ${search} || '%')
          GROUP BY c.id, c.name
        `, byAmount, page, limit, skip);
        break;
      case 'sales-by-customer':
        rows = await paged(Prisma.sql`
          SELECT c.id AS "customerId", c.customer_code AS "customerCode", c.name, c.phone,
                 COUNT(si.id)::int AS "invoiceCount", SUM(si.grand_total)::float AS amount,
                 SUM(si.paid_amount)::float AS "paidAmount", SUM(si.outstanding_amount)::float AS outstanding,
                 MIN(si.invoice_date) AS date, MIN(si.id)::text AS id
          FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
          WHERE si.status = 'confirmed' AND si.invoice_date BETWEEN ${from} AND ${to}
            AND (${partyId}::int IS NULL OR c.id = ${partyId})
            AND (${search} = '' OR c.name ILIKE '%' || ${search} || '%' OR c.customer_code ILIKE '%' || ${search} || '%')
          GROUP BY c.id, c.customer_code, c.name, c.phone
        `, byAmount, page, limit, skip);
        break;
      case 'sales-by-cashier':
        rows = await paged(Prisma.sql`
          SELECT u.id AS "cashierId", COALESCE(u.full_name, 'Unassigned') AS name,
                 COUNT(si.id)::int AS "invoiceCount", SUM(si.grand_total)::float AS amount,
                 SUM(si.paid_amount)::float AS "paidAmount", MIN(si.invoice_date) AS date,
                 COALESCE(u.id::text, '0') AS id
          FROM sales_invoices si LEFT JOIN users u ON u.id = si.cashier_id
          WHERE si.status = 'confirmed' AND si.invoice_date BETWEEN ${from} AND ${to}
            AND (${cashierId}::int IS NULL OR si.cashier_id = ${cashierId})
            AND (${search} = '' OR u.full_name ILIKE '%' || ${search} || '%')
          GROUP BY u.id, u.full_name
        `, byAmount, page, limit, skip);
        break;
      case 'daily-sales':
        rows = await paged(Prisma.sql`
          SELECT si.invoice_date AS date, si.invoice_date::text AS id,
                 COUNT(*)::int AS "invoiceCount", SUM(si.subtotal)::float AS subtotal,
                 SUM(si.discount_amount)::float AS discount, SUM(si.tax_amount)::float AS tax,
                 SUM(si.grand_total)::float AS amount, SUM(si.paid_amount)::float AS collected,
                 SUM(si.outstanding_amount)::float AS outstanding
          FROM sales_invoices si
          WHERE si.status = 'confirmed' AND si.invoice_date BETWEEN ${from} AND ${to}
          GROUP BY si.invoice_date
        `, Prisma.sql`ORDER BY report_rows.date DESC`, page, limit, skip);
        break;
      case 'discount-report':
        rows = await paged(Prisma.sql`
          SELECT si.invoice_date AS date, si.id::text AS id, si.invoice_number AS "reference",
                 c.name AS customer, COALESCE(u.full_name, 'Unassigned') AS cashier,
                 si.discount_amount::float AS amount, si.grand_total::float AS "invoiceTotal"
          FROM sales_invoices si
          JOIN customers c ON c.id = si.customer_id
          LEFT JOIN users u ON u.id = si.cashier_id
          WHERE si.status = 'confirmed' AND si.invoice_date BETWEEN ${from} AND ${to}
            AND si.discount_amount > 0
            AND (${cashierId}::int IS NULL OR si.cashier_id = ${cashierId})
            AND (${search} = '' OR si.invoice_number ILIKE '%' || ${search} || '%' OR c.name ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      case 'payment-collection':
        rows = await paged(Prisma.sql`
          SELECT p.payment_date AS date, p.id::text AS id, p.payment_number AS "reference",
                 p.payment_type AS "paymentType", p.payment_method AS "paymentMethod",
                 p.amount::float AS amount, p.payment_status AS status,
                 COALESCE(c.name, s.name, 'Walk-in') AS party
          FROM payments p
          LEFT JOIN customers c ON c.id = p.customer_id
          LEFT JOIN suppliers s ON s.id = p.supplier_id
          WHERE p.payment_date BETWEEN ${from} AND ${to} AND p.payment_status = 'completed'
            AND (${partyId}::int IS NULL OR p.customer_id = ${partyId} OR p.supplier_id = ${partyId})
            AND (${paymentMethod} = '' OR p.payment_method::text = ${paymentMethod})
            AND (${search} = '' OR p.payment_number ILIKE '%' || ${search} || '%' OR c.name ILIKE '%' || ${search} || '%' OR s.name ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      case 'sales-item-history':
        if (!itemId) throw createError('Select an item to view its sales history.', 400);
        rows = await paged(Prisma.sql`
          SELECT si.invoice_date AS date, si.id::text AS id, si.invoice_number AS "reference",
                 c.name AS customer, sii.quantity::float AS quantity,
                 sii.conversion_factor::float AS "conversionFactor",
                 sii.unit_price::float AS "unitPrice", sii.discount_amount::float AS discount,
                 sii.tax_amount::float AS tax, sii.line_total::float AS amount, si.status
          FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id AND si.status = 'confirmed'
          JOIN customers c ON c.id = si.customer_id
          WHERE sii.item_id = ${itemId} AND si.invoice_date BETWEEN ${from} AND ${to}
        `, byDate, page, limit, skip);
        break;
      case 'purchase-register':
        rows = await paged(Prisma.sql`
          SELECT pi.invoice_date AS date, pi.id::text AS id, pi.invoice_number AS "reference",
                 pi.supplier_invoice_ref AS "supplierReference", s.name AS supplier,
                 pi.subtotal::float AS subtotal, pi.discount_amount::float AS discount,
                 pi.tax_amount::float AS tax, pi.grand_total::float AS amount,
                 pi.paid_amount::float AS paid, pi.outstanding_amount::float AS outstanding, pi.status
          FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
          WHERE pi.status = 'confirmed' AND pi.invoice_date BETWEEN ${from} AND ${to}
            AND (${partyId}::int IS NULL OR pi.supplier_id = ${partyId})
            AND (${search} = '' OR pi.invoice_number ILIKE '%' || ${search} || '%' OR s.name ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      case 'purchase-by-item':
        rows = await paged(Prisma.sql`
          SELECT i.id AS "itemId", i.item_code AS "itemCode", i.name,
                 SUM(pii.quantity * pii.conversion_factor)::float AS quantity,
                 SUM(pii.line_total)::float AS amount, SUM(pii.discount_amount)::float AS discount,
                 SUM(pii.tax_amount)::float AS tax, COUNT(DISTINCT pi.id)::int AS "invoiceCount",
                 MIN(pi.invoice_date) AS date, MIN(pii.id)::text AS id
          FROM purchase_invoice_items pii
          JOIN purchase_invoices pi ON pi.id = pii.invoice_id AND pi.status = 'confirmed'
          JOIN items i ON i.id = pii.item_id
          WHERE pi.invoice_date BETWEEN ${from} AND ${to}
            AND (${itemId}::int IS NULL OR i.id = ${itemId})
            AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%')
          GROUP BY i.id, i.item_code, i.name
        `, Prisma.sql`ORDER BY report_rows.amount DESC`, page, limit, skip);
        break;
      case 'purchase-by-supplier':
        rows = await paged(Prisma.sql`
          SELECT s.id AS "supplierId", s.supplier_code AS "supplierCode", s.name,
                 COUNT(pi.id)::int AS "invoiceCount", SUM(pi.grand_total)::float AS amount,
                 SUM(pi.paid_amount)::float AS paid, SUM(pi.outstanding_amount)::float AS outstanding,
                 MIN(pi.invoice_date) AS date, MIN(pi.id)::text AS id
          FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
          WHERE pi.status = 'confirmed' AND pi.invoice_date BETWEEN ${from} AND ${to}
            AND (${partyId}::int IS NULL OR s.id = ${partyId})
            AND (${search} = '' OR s.name ILIKE '%' || ${search} || '%' OR s.supplier_code ILIKE '%' || ${search} || '%')
          GROUP BY s.id, s.supplier_code, s.name
        `, byAmount, page, limit, skip);
        break;
      case 'purchase-return-register':
        rows = await paged(Prisma.sql`
          SELECT pr.return_date AS date, pr.id::text AS id, pr.return_number AS "reference",
                 pi.invoice_number AS "originalInvoice", s.name AS supplier,
                 pr.total_amount::float AS amount, pr.return_reason AS reason, pr.status
          FROM purchase_returns pr
          JOIN purchase_invoices pi ON pi.id = pr.original_invoice_id
          JOIN suppliers s ON s.id = pr.supplier_id
          WHERE pr.status = 'completed' AND pr.return_date BETWEEN ${from} AND ${to}
            AND (${partyId}::int IS NULL OR pr.supplier_id = ${partyId})
            AND (${search} = '' OR pr.return_number ILIKE '%' || ${search} || '%' OR pi.invoice_number ILIKE '%' || ${search} || '%' OR s.name ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      case 'purchase-item-history':
        if (!itemId) throw createError('Select an item to view its purchase history.', 400);
        rows = await paged(Prisma.sql`
          SELECT pi.invoice_date AS date, pi.id::text AS id, pi.invoice_number AS "reference",
                 s.name AS supplier, pii.quantity::float AS quantity,
                 pii.conversion_factor::float AS "conversionFactor", pii.unit_cost::float AS "unitCost",
                 pii.discount_amount::float AS discount, pii.tax_amount::float AS tax,
                 pii.line_total::float AS amount, pi.status
          FROM purchase_invoice_items pii
          JOIN purchase_invoices pi ON pi.id = pii.invoice_id AND pi.status = 'confirmed'
          JOIN suppliers s ON s.id = pi.supplier_id
          WHERE pii.item_id = ${itemId} AND pi.invoice_date BETWEEN ${from} AND ${to}
        `, byDate, page, limit, skip);
        break;
      case 'profit-loss':
        rows = await paged(Prisma.sql`
          SELECT a.account_code AS "accountCode", a.name, a.account_type AS "accountType",
                 SUM(jl.debit)::float AS debit, SUM(jl.credit)::float AS credit,
                 CASE WHEN a.account_type = 'revenue' THEN SUM(jl.credit - jl.debit)
                      ELSE SUM(jl.debit - jl.credit) END::float AS amount,
                 MIN(je.voucher_date) AS date, MIN(a.id)::text AS id
          FROM journal_entry_lines jl
          JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
          JOIN accounts a ON a.id = jl.account_id
          WHERE je.voucher_date BETWEEN ${from} AND ${to}
            AND a.account_type IN ('revenue', 'expense') AND a.is_group = false
            AND (${accountId}::int IS NULL OR a.id = ${accountId})
            AND (${search} = '' OR a.name ILIKE '%' || ${search} || '%' OR a.account_code ILIKE '%' || ${search} || '%')
          GROUP BY a.id, a.account_code, a.name, a.account_type
        `, Prisma.sql`ORDER BY report_rows."accountCode"`, page, limit, skip);
        break;
      case 'trial-balance':
        rows = await paged(Prisma.sql`
          SELECT a.id AS "accountId", a.account_code AS "accountCode", a.name, a.account_type AS "accountType",
                 a.opening_balance::float AS "openingBalance",
                 COALESCE(SUM(jl.debit) FILTER (WHERE je.voucher_date < ${from}), 0)::float AS "openingDebitActivity",
                 COALESCE(SUM(jl.credit) FILTER (WHERE je.voucher_date < ${from}), 0)::float AS "openingCreditActivity",
                 COALESCE(SUM(jl.debit) FILTER (WHERE je.voucher_date BETWEEN ${from} AND ${to}), 0)::float AS debit,
                 COALESCE(SUM(jl.credit) FILTER (WHERE je.voucher_date BETWEEN ${from} AND ${to}), 0)::float AS credit,
                 (a.opening_balance +
                   COALESCE(SUM(CASE WHEN je.voucher_date < ${from}
                     THEN CASE WHEN a.account_type IN ('asset', 'expense') THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END
                     ELSE 0 END), 0))::float AS "openingBalanceNet",
                 (a.opening_balance +
                   COALESCE(SUM(CASE WHEN je.id IS NULL THEN 0 WHEN a.account_type IN ('asset', 'expense') THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END), 0))::float AS "closingBalance",
                 COALESCE(MIN(je.voucher_date), ${from}) AS date, a.id::text AS id
          FROM accounts a
          LEFT JOIN journal_entry_lines jl ON jl.account_id = a.id
          LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted' AND je.voucher_date <= ${to}
          WHERE a.is_group = false
            AND (${accountId}::int IS NULL OR a.id = ${accountId})
            AND (${search} = '' OR a.name ILIKE '%' || ${search} || '%' OR a.account_code ILIKE '%' || ${search} || '%')
          GROUP BY a.id, a.account_code, a.name, a.account_type, a.opening_balance
        `, Prisma.sql`ORDER BY report_rows."accountCode"`, page, limit, skip);
        break;
      case 'balance-sheet':
        rows = await paged(Prisma.sql`
          WITH balances AS (
            SELECT a.id, a.account_code, a.name, a.account_type,
                   (a.opening_balance + COALESCE(SUM(
                     CASE WHEN je.id IS NULL THEN 0 WHEN a.account_type IN ('asset', 'expense') THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END
                   ), 0))::float AS balance
            FROM accounts a
            LEFT JOIN journal_entry_lines jl ON jl.account_id = a.id
            LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted' AND je.voucher_date <= ${to}
            WHERE a.is_group = false AND a.account_type IN ('asset', 'liability', 'equity')
            GROUP BY a.id, a.account_code, a.name, a.account_type, a.opening_balance
          ), earnings AS (
            SELECT COALESCE(SUM(CASE WHEN a.account_type = 'revenue' THEN jl.credit - jl.debit
                                     ELSE jl.debit - jl.credit END), 0)::float AS net_income
            FROM journal_entry_lines jl
            JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted' AND je.voucher_date <= ${to}
            JOIN accounts a ON a.id = jl.account_id
            WHERE a.account_type IN ('revenue', 'expense')
          )
          SELECT b.id AS "accountId", b.account_code AS "accountCode", b.name,
                 b.account_type AS "accountType", b.balance AS amount,
                 NULL::float AS "currentEarnings", ${to}::date AS date, b.id::text AS id
          FROM balances b
          WHERE (${search} = '' OR b.name ILIKE '%' || ${search} || '%' OR b.account_code ILIKE '%' || ${search} || '%')
          UNION ALL
          SELECT NULL::int AS "accountId", 'RETAINED-EARNINGS' AS "accountCode",
                 'Current period earnings' AS name, 'equity' AS "accountType",
                 e.net_income AS amount, e.net_income AS "currentEarnings",
                 ${to}::date AS date, 'retained-earnings' AS id
          FROM earnings e
          WHERE e.net_income <> 0 AND
            (${search} = '' OR 'current period earnings' ILIKE '%' || ${search} || '%')
        `, Prisma.sql`ORDER BY report_rows."accountType", report_rows."accountCode"`, page, limit, skip);
        break;
      case 'general-ledger':
        if (!accountId) throw createError('Select an account to view its general ledger.', 400);
        rows = await paged(Prisma.sql`
          WITH account_info AS (
            SELECT id, account_type, opening_balance FROM accounts WHERE id = ${accountId}
          ), opening AS (
            SELECT ai.opening_balance + COALESCE(SUM(
              CASE WHEN je.id IS NULL THEN 0 WHEN ai.account_type IN ('asset', 'expense') THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END
            ), 0)::float AS amount
            FROM account_info ai
            LEFT JOIN journal_entry_lines jl ON jl.account_id = ai.id
            LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted' AND je.voucher_date < ${from}
            GROUP BY ai.opening_balance
          ), period_lines AS (
            SELECT je.voucher_date AS date, je.id AS entry_id, jl.id, je.voucher_number AS "voucherNumber",
                   je.reference_type AS "referenceType", je.reference_id::text AS "referenceId",
                   je.voucher_type AS "voucherType", je.narration, jl.narration AS "lineNarration",
                   jl.debit::float AS debit, jl.credit::float AS credit,
                   COALESCE(c.name, s.name, '') AS party,
                   CASE WHEN ai.account_type IN ('asset', 'expense') THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END AS signed
            FROM journal_entry_lines jl
            JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
            JOIN account_info ai ON ai.id = jl.account_id
            LEFT JOIN customers c ON c.id = jl.customer_id
            LEFT JOIN suppliers s ON s.id = jl.supplier_id
            WHERE je.voucher_date BETWEEN ${from} AND ${to}
              AND (${search} = '' OR je.voucher_number ILIKE '%' || ${search} || '%' OR je.narration ILIKE '%' || ${search} || '%' OR c.name ILIKE '%' || ${search} || '%' OR s.name ILIKE '%' || ${search} || '%')
          )
          SELECT p.date, p.id::text AS id, p."voucherNumber", p."referenceType", p."referenceId", p."voucherType",
                 p.narration, p."lineNarration", p.party, p.debit, p.credit,
                 (o.amount + SUM(p.signed) OVER (ORDER BY p.date, p.entry_id, p.id))::float AS balance
          FROM period_lines p CROSS JOIN opening o
        `, byDate, page, limit, skip);
        break;
      case 'cash-book':
      case 'bank-book':
        rows = await paged(Prisma.sql`
          WITH ledger_lines AS (
            SELECT je.voucher_date AS date, je.id AS entry_id, jl.id, jl.account_id,
                   a.opening_balance, a.account_code, a.name AS account,
                   je.voucher_number AS "reference", je.voucher_type AS "voucherType",
                   je.narration, jl.debit::float AS debit, jl.credit::float AS credit,
                   (jl.debit - jl.credit)::float AS signed
            FROM journal_entry_lines jl
            JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.voucher_date <= ${to}
              AND a.account_code ${report === 'cash-book' ? Prisma.sql`= '11100'` : Prisma.sql`LIKE '112%'`}
              AND (${accountId}::int IS NULL OR a.id = ${accountId})
          ), opening AS (
            SELECT account_id, MAX(opening_balance) + COALESCE(SUM(signed) FILTER (WHERE date < ${from}), 0) AS balance
            FROM ledger_lines
            GROUP BY account_id
          ), period_lines AS (
            SELECT l.*, o.balance + SUM(l.signed) OVER (
              PARTITION BY l.account_id ORDER BY l.date, l.entry_id, l.id
            ) AS balance
            FROM ledger_lines l JOIN opening o ON o.account_id = l.account_id
            WHERE l.date BETWEEN ${from} AND ${to}
          )
          SELECT p.date, p.id::text AS id, p."reference", p."voucherType",
                 p.account_code AS "accountCode", p.account, p.narration,
                 p.debit, p.credit, p.signed::float AS amount, p.balance::float AS balance
          FROM period_lines p
          WHERE (${search} = '' OR p."reference" ILIKE '%' || ${search} || '%' OR p.narration ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      case 'day-book':
        rows = await paged(Prisma.sql`
          SELECT je.voucher_date AS date, je.id::text AS id, je.voucher_number AS "reference",
                 je.voucher_type AS "voucherType", je.narration,
                 je.reference_type AS "referenceType", je.reference_id::text AS "referenceId",
                 COALESCE(SUM(jl.debit), 0)::float AS debit,
                 COALESCE(SUM(jl.credit), 0)::float AS credit,
                 COUNT(jl.id)::int AS "lineCount"
          FROM journal_entries je LEFT JOIN journal_entry_lines jl ON jl.entry_id = je.id
          WHERE je.status = 'posted' AND je.voucher_date BETWEEN ${from} AND ${to}
            AND (${search} = '' OR je.voucher_number ILIKE '%' || ${search} || '%' OR je.narration ILIKE '%' || ${search} || '%')
          GROUP BY je.id, je.voucher_date, je.voucher_number, je.voucher_type, je.narration,
                   je.reference_type, je.reference_id
        `, byDate, page, limit, skip);
        break;
      case 'receivables':
        rows = await paged(Prisma.sql`
          SELECT si.invoice_date AS date, si.id::text AS id, si.invoice_number AS "reference",
                 c.customer_code AS "partyCode", c.name AS party, si.due_date AS "dueDate",
                 GREATEST(${asOf}::date - COALESCE(si.due_date, si.invoice_date + 30), 0)::int AS "daysOverdue",
                 si.grand_total::float AS "invoiceAmount", si.paid_amount::float AS paid,
                 si.outstanding_amount::float AS amount,
                 CASE WHEN ${asOf}::date <= COALESCE(si.due_date, si.invoice_date + 30) THEN 'Current'
                      WHEN ${asOf}::date - COALESCE(si.due_date, si.invoice_date + 30) <= 30 THEN '1-30'
                      WHEN ${asOf}::date - COALESCE(si.due_date, si.invoice_date + 30) <= 60 THEN '31-60'
                      WHEN ${asOf}::date - COALESCE(si.due_date, si.invoice_date + 30) <= 90 THEN '61-90'
                      ELSE '90+' END AS bucket
          FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
          WHERE si.status IN ('confirmed', 'returned') AND si.outstanding_amount > 0
            AND si.invoice_date <= ${asOf}
            AND (${partyId}::int IS NULL OR c.id = ${partyId})
            AND (${search} = '' OR si.invoice_number ILIKE '%' || ${search} || '%' OR c.name ILIKE '%' || ${search} || '%')
        `, Prisma.sql`ORDER BY report_rows."daysOverdue" DESC, report_rows.date ASC`, page, limit, skip);
        break;
      case 'payables':
        rows = await paged(Prisma.sql`
          SELECT pi.invoice_date AS date, pi.id::text AS id, pi.invoice_number AS "reference",
                 s.supplier_code AS "partyCode", s.name AS party, pi.due_date AS "dueDate",
                 GREATEST(${asOf}::date - COALESCE(pi.due_date, pi.invoice_date + 30), 0)::int AS "daysOverdue",
                 pi.grand_total::float AS "invoiceAmount", pi.paid_amount::float AS paid,
                 pi.outstanding_amount::float AS amount,
                 CASE WHEN ${asOf}::date <= COALESCE(pi.due_date, pi.invoice_date + 30) THEN 'Current'
                      WHEN ${asOf}::date - COALESCE(pi.due_date, pi.invoice_date + 30) <= 30 THEN '1-30'
                      WHEN ${asOf}::date - COALESCE(pi.due_date, pi.invoice_date + 30) <= 60 THEN '31-60'
                      WHEN ${asOf}::date - COALESCE(pi.due_date, pi.invoice_date + 30) <= 90 THEN '61-90'
                      ELSE '90+' END AS bucket
          FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
          WHERE pi.status = 'confirmed' AND pi.outstanding_amount > 0 AND pi.invoice_date <= ${asOf}
            AND (${partyId}::int IS NULL OR s.id = ${partyId})
            AND (${search} = '' OR pi.invoice_number ILIKE '%' || ${search} || '%' OR s.name ILIKE '%' || ${search} || '%')
        `, Prisma.sql`ORDER BY report_rows."daysOverdue" DESC, report_rows.date ASC`, page, limit, skip);
        break;
      case 'customer-ledger':
      case 'supplier-ledger': {
        if (!partyId) throw createError(`Select a ${report === 'customer-ledger' ? 'customer' : 'supplier'} to view its ledger.`, 400);
        const isCustomer = report === 'customer-ledger';
        rows = await paged(Prisma.sql`
          SELECT je.voucher_date AS date, je.id::text AS id, je.voucher_number AS "reference",
                 je.voucher_type AS "voucherType", je.narration, a.account_code AS "accountCode",
                 a.name AS account, jl.debit::float AS debit, jl.credit::float AS credit
          FROM journal_entry_lines jl
          JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
          JOIN accounts a ON a.id = jl.account_id
          WHERE je.voucher_date BETWEEN ${from} AND ${to}
            AND jl.party_type = ${isCustomer ? 'customer' : 'supplier'}
            AND jl.${isCustomer ? Prisma.raw('customer_id') : Prisma.raw('supplier_id')} = ${partyId}
            AND (${search} = '' OR je.voucher_number ILIKE '%' || ${search} || '%' OR je.narration ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      }
      case 'expense-report':
        rows = await paged(Prisma.sql`
          SELECT je.voucher_date AS date, je.id::text AS id, je.voucher_number AS "reference",
                 a.account_code AS "accountCode", a.name AS account, je.narration,
                 jl.debit::float AS debit, jl.credit::float AS credit,
                 (jl.debit - jl.credit)::float AS amount
          FROM journal_entry_lines jl
          JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
          JOIN accounts a ON a.id = jl.account_id AND a.account_type = 'expense' AND a.is_group = false
          WHERE je.voucher_date BETWEEN ${from} AND ${to}
            AND (${accountId}::int IS NULL OR a.id = ${accountId})
            AND (${search} = '' OR je.voucher_number ILIKE '%' || ${search} || '%' OR a.name ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      case 'cash-flow':
        rows = await paged(Prisma.sql`
          SELECT je.voucher_date AS date, je.id::text AS id, je.voucher_number AS "reference",
                 je.voucher_type AS "voucherType", a.account_code AS "accountCode", a.name AS account,
                 je.narration, jl.debit::float AS debit, jl.credit::float AS credit,
                 (jl.debit - jl.credit)::float AS amount
          FROM journal_entry_lines jl
          JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
          JOIN accounts a ON a.id = jl.account_id
          WHERE je.voucher_date BETWEEN ${from} AND ${to} AND a.account_code IN ('11100', '11200')
            AND (${search} = '' OR je.voucher_number ILIKE '%' || ${search} || '%' OR je.narration ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      case 'vat-return-summary':
        rows = await paged(Prisma.sql`
          SELECT ${from}::date AS "fromDate", ${to}::date AS "toDate",
            COALESCE((SELECT SUM(tax_amount) FROM sales_invoices WHERE status = 'confirmed' AND invoice_date BETWEEN ${from} AND ${to}), 0)::float AS "salesVat",
            COALESCE((SELECT SUM(tax_amount) FROM sales_returns WHERE status = 'completed' AND return_date BETWEEN ${from} AND ${to}), 0)::float AS "salesReturnVat",
            COALESCE((SELECT SUM(tax_amount) FROM purchase_invoices WHERE status = 'confirmed' AND invoice_date BETWEEN ${from} AND ${to}), 0)::float AS "purchaseVat",
            COALESCE((SELECT SUM(pii.tax_amount * pri.returned_qty / NULLIF(pii.quantity, 0))
              FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id AND pr.status = 'completed'
              JOIN purchase_invoice_items pii ON pii.id = pri.original_item_id
              WHERE pr.return_date BETWEEN ${from} AND ${to}), 0)::float AS "purchaseReturnVat",
            (COALESCE((SELECT SUM(tax_amount) FROM sales_invoices WHERE status = 'confirmed' AND invoice_date BETWEEN ${from} AND ${to}), 0)
             - COALESCE((SELECT SUM(tax_amount) FROM sales_returns WHERE status = 'completed' AND return_date BETWEEN ${from} AND ${to}), 0)
             - COALESCE((SELECT SUM(tax_amount) FROM purchase_invoices WHERE status = 'confirmed' AND invoice_date BETWEEN ${from} AND ${to}), 0)
             + COALESCE((SELECT SUM(pii.tax_amount * pri.returned_qty / NULLIF(pii.quantity, 0))
              FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id AND pr.status = 'completed'
              JOIN purchase_invoice_items pii ON pii.id = pri.original_item_id
              WHERE pr.return_date BETWEEN ${from} AND ${to}), 0))::float AS "netVatPayable",
            'VAT Return Summary' AS name, 'summary' AS id, ${from}::date AS date
        `, Prisma.sql`ORDER BY report_rows.date DESC`, page, limit, skip);
        break;
      case 'sales-return-vat':
        rows = await paged(Prisma.sql`
          SELECT sr.return_date AS date, sr.id::text AS id, sr.return_number AS "reference",
                 si.invoice_number AS "originalInvoice", c.name AS customer,
                 sr.subtotal::float AS taxableAmount, sr.tax_amount::float AS tax,
                 sr.total_amount::float AS amount, sr.status
          FROM sales_returns sr
          JOIN sales_invoices si ON si.id = sr.original_invoice_id
          JOIN customers c ON c.id = sr.customer_id
          WHERE sr.status = 'completed' AND sr.return_date BETWEEN ${from} AND ${to}
            AND (${partyId}::int IS NULL OR sr.customer_id = ${partyId})
        `, byDate, page, limit, skip);
        break;
      case 'purchase-return-vat':
        rows = await paged(Prisma.sql`
          SELECT pr.return_date AS date, pr.id::text AS id, pr.return_number AS "reference",
                 pi.invoice_number AS "originalInvoice", s.name AS supplier,
                 pr.total_amount::float AS amount,
                 COALESCE(SUM(pii.tax_amount * pri.returned_qty / NULLIF(pii.quantity, 0)), 0)::float AS tax,
                 pr.status
          FROM purchase_returns pr
          JOIN purchase_invoices pi ON pi.id = pr.original_invoice_id
          JOIN suppliers s ON s.id = pr.supplier_id
          LEFT JOIN purchase_return_items pri ON pri.return_id = pr.id
          LEFT JOIN purchase_invoice_items pii ON pii.id = pri.original_item_id
          WHERE pr.status = 'completed' AND pr.return_date BETWEEN ${from} AND ${to}
            AND (${partyId}::int IS NULL OR pr.supplier_id = ${partyId})
          GROUP BY pr.return_date, pr.id, pr.return_number, pi.invoice_number, s.name, pr.total_amount, pr.status
        `, byDate, page, limit, skip);
        break;
      case 'sales-vat-register':
        rows = await paged(Prisma.sql`
          SELECT si.invoice_date AS date, si.id::text AS id, si.invoice_number AS "reference",
                 c.name AS customer, si.taxable_amount::float AS taxable,
                 si.non_taxable_amount::float AS nonTaxable, si.tax_amount::float AS tax,
                 si.grand_total::float AS amount
          FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
          WHERE si.status = 'confirmed' AND si.invoice_date BETWEEN ${from} AND ${to}
            AND (${partyId}::int IS NULL OR si.customer_id = ${partyId})
            AND (${search} = '' OR si.invoice_number ILIKE '%' || ${search} || '%' OR c.name ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      case 'purchase-vat-register':
        rows = await paged(Prisma.sql`
          SELECT pi.invoice_date AS date, pi.id::text AS id, pi.invoice_number AS "reference",
                 s.name AS supplier, pi.subtotal::float AS taxable,
                 pi.tax_amount::float AS tax, pi.grand_total::float AS amount
          FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
          WHERE pi.status = 'confirmed' AND pi.invoice_date BETWEEN ${from} AND ${to}
            AND (${partyId}::int IS NULL OR pi.supplier_id = ${partyId})
            AND (${search} = '' OR pi.invoice_number ILIKE '%' || ${search} || '%' OR s.name ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      case 'stock-balance':
      case 'warehouse-stock':
        rows = await paged(Prisma.sql`
          SELECT i.id AS "itemId", i.item_code AS "itemCode", i.name,
                 w.id AS "warehouseId", w.name AS warehouse,
                 sb.quantity::float AS quantity, sb.average_cost::float AS "averageCost",
                 (sb.quantity * sb.average_cost)::float AS amount, i.reorder_level::float AS "reorderLevel",
                 i.name AS sortname, i.id::text AS id, ${asOf}::date AS date
          FROM stock_balances sb JOIN items i ON i.id = sb.item_id
          JOIN warehouses w ON w.id = sb.warehouse_id
          WHERE (${itemId}::int IS NULL OR i.id = ${itemId})
            AND (${warehouseId}::int IS NULL OR w.id = ${warehouseId})
            AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%' OR w.name ILIKE '%' || ${search} || '%')
        `, Prisma.sql`ORDER BY report_rows.name ASC, report_rows.warehouse ASC`, page, limit, skip);
        break;
      case 'low-stock':
        rows = await paged(Prisma.sql`
          SELECT i.id AS "itemId", i.item_code AS "itemCode", i.name,
                 COALESCE(SUM(sb.quantity), 0)::float AS quantity,
                 i.reorder_level::float AS "reorderLevel",
                 GREATEST(i.reorder_level - COALESCE(SUM(sb.quantity), 0), 0)::float AS "suggestedOrder",
                 COALESCE(SUM(sb.quantity * sb.average_cost), 0)::float AS amount,
                 MIN(i.id)::text AS id, ${asOf}::date AS date
          FROM items i LEFT JOIN stock_balances sb ON sb.item_id = i.id
          WHERE i.is_active = true
            AND (${itemId}::int IS NULL OR i.id = ${itemId})
            AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%')
          GROUP BY i.id, i.item_code, i.name, i.reorder_level
          HAVING COALESCE(SUM(sb.quantity), 0) <= i.reorder_level
        `, Prisma.sql`ORDER BY report_rows."suggestedOrder" DESC`, page, limit, skip);
        break;
      case 'stock-valuation':
        rows = await paged(Prisma.sql`
          SELECT i.id AS "itemId", i.item_code AS "itemCode", i.name,
                 w.name AS warehouse, sb.quantity::float AS quantity,
                 sb.average_cost::float AS "averageCost",
                 (sb.quantity * sb.average_cost)::float AS amount,
                 sb.id::text AS id, ${asOf}::date AS date
          FROM stock_balances sb JOIN items i ON i.id = sb.item_id
          JOIN warehouses w ON w.id = sb.warehouse_id
          WHERE (${itemId}::int IS NULL OR i.id = ${itemId})
            AND (${warehouseId}::int IS NULL OR w.id = ${warehouseId})
            AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%')
        `, Prisma.sql`ORDER BY report_rows.amount DESC`, page, limit, skip);
        break;
      case 'stock-movements':
        rows = await paged(Prisma.sql`
          SELECT im.created_at AS date, im.id::text AS id, i.item_code AS "itemCode", i.name,
                 w.name AS warehouse, im.movement_type AS "movementType",
                 im.quantity::float AS quantity, im.unit_cost::float AS "unitCost",
                 im.reference_type AS "referenceType", im.reference_id::text AS "referenceId", im.narration
          FROM inventory_movements im JOIN items i ON i.id = im.item_id
          JOIN warehouses w ON w.id = im.warehouse_id
          WHERE im.created_at BETWEEN ${from} AND ${to}
            AND (${itemId}::int IS NULL OR im.item_id = ${itemId})
            AND (${warehouseId}::int IS NULL OR im.warehouse_id = ${warehouseId})
            AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%' OR im.narration ILIKE '%' || ${search} || '%')
        `, byDate, page, limit, skip);
        break;
      case 'stock-ledger':
        if (!itemId) throw createError('Select an item to view its stock ledger.', 400);
        rows = await paged(Prisma.sql`
          WITH movement_rows AS (
            SELECT im.created_at AS date, im.id, im.movement_type AS "movementType",
                   im.quantity::float AS quantity, im.unit_cost::float AS "unitCost",
                   im.reference_type AS "referenceType", im.reference_id::text AS "referenceId",
                   im.narration, w.name AS warehouse
            FROM inventory_movements im JOIN warehouses w ON w.id = im.warehouse_id
            WHERE im.item_id = ${itemId} AND im.created_at <= ${to}
              AND (${warehouseId}::int IS NULL OR im.warehouse_id = ${warehouseId})
          ), balance AS (
            SELECT COALESCE(SUM(quantity), 0)::float AS opening
            FROM movement_rows WHERE date < ${from}
          )
          SELECT m.date, m.id::text AS id, m."movementType", m.quantity, m."unitCost",
                 m."referenceType", m."referenceId", m.narration, m.warehouse,
                 (b.opening + SUM(m.quantity) OVER (ORDER BY m.date, m.id))::float AS balance
          FROM movement_rows m CROSS JOIN balance b WHERE m.date BETWEEN ${from} AND ${to}
        `, byDate, page, limit, skip);
        break;
      case 'stock-ageing':
        rows = await paged(Prisma.sql`
          SELECT i.id AS "itemId", i.item_code AS "itemCode", i.name,
                 w.name AS warehouse, sb.quantity::float AS quantity,
                 sb.average_cost::float AS "averageCost",
                 (sb.quantity * sb.average_cost)::float AS amount,
                 MAX(im.created_at) FILTER (WHERE im.movement_type IN ('purchase', 'opening', 'return_in'))::date AS "lastReceiptDate",
                 GREATEST(${asOf}::date - MAX(im.created_at) FILTER (WHERE im.movement_type IN ('purchase', 'opening', 'return_in'))::date, 0)::int AS "daysSinceReceipt",
                 sb.id::text AS id, ${asOf}::date AS date
          FROM stock_balances sb JOIN items i ON i.id = sb.item_id
          JOIN warehouses w ON w.id = sb.warehouse_id
          LEFT JOIN inventory_movements im ON im.item_id = i.id AND im.warehouse_id = w.id AND im.created_at <= ${to}
          WHERE sb.quantity > 0 AND (${warehouseId}::int IS NULL OR w.id = ${warehouseId})
            AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%')
          GROUP BY i.id, i.item_code, i.name, w.name, sb.quantity, sb.average_cost, sb.id
        `, Prisma.sql`ORDER BY report_rows."daysSinceReceipt" DESC NULLS LAST`, page, limit, skip);
        break;
      case 'item-profitability':
        rows = await paged(Prisma.sql`
          WITH invoice_totals AS (
            SELECT invoice_id, SUM(line_total) AS invoice_line_total
            FROM sales_invoice_items
            GROUP BY invoice_id
          ), lines AS (
            SELECT i.id AS item_id, i.item_code, i.name, sii.id::text AS line_id,
                   sii.quantity * sii.conversion_factor AS quantity,
                   (sii.line_total - sii.tax_amount) * si.grand_total / NULLIF(it.invoice_line_total, 0) AS revenue,
                   COALESCE(sii.cost_at_sale, 0) * sii.quantity * sii.conversion_factor AS cogs,
                   si.invoice_date AS date,
                   1 AS source_order
            FROM sales_invoice_items sii
            JOIN sales_invoices si ON si.id = sii.invoice_id AND si.status = 'confirmed'
            JOIN invoice_totals it ON it.invoice_id = si.id
            JOIN items i ON i.id = sii.item_id
            WHERE si.invoice_date BETWEEN ${from} AND ${to}
              AND (${itemId}::int IS NULL OR i.id = ${itemId})
              AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%')
            UNION ALL
            SELECT i.id AS item_id, i.item_code, i.name, sri.id::text AS line_id,
                   -(sri.returned_qty * sii.conversion_factor) AS quantity,
                   -(sri.line_total - sri.tax_amount) AS revenue,
                   -(COALESCE(sri.cost_at_sale, 0) * sri.returned_qty * sii.conversion_factor) AS cogs,
                   sr.return_date AS date,
                   2 AS source_order
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.id = sri.return_id AND sr.status = 'completed'
            JOIN sales_invoice_items sii ON sii.id = sri.original_item_id
            JOIN items i ON i.id = sri.item_id
            WHERE sr.return_date BETWEEN ${from} AND ${to}
              AND (${itemId}::int IS NULL OR i.id = ${itemId})
              AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%')
          )
          SELECT item_id AS "itemId", item_code AS "itemCode", name,
                 SUM(quantity)::float AS quantity,
                 SUM(revenue)::float AS amount,
                 SUM(cogs)::float AS cogs,
                 SUM(revenue - cogs)::float AS profit,
                 MIN(date) AS date, MIN(line_id)::text AS id
          FROM lines
          GROUP BY item_id, item_code, name
        `, Prisma.sql`ORDER BY report_rows.profit DESC`, page, limit, skip);
        break;
      default:
        throw createError(`Unknown report: ${report}.`, 404);
    }

    if (report === 'purchase-register') {
      const totals = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT COUNT(*)::int AS "totalInvoices",
               COALESCE(SUM(pi.grand_total), 0)::float AS "totalPurchases",
               COALESCE(SUM(pi.paid_amount), 0)::float AS "totalPaid",
               COALESCE(SUM(GREATEST(pi.outstanding_amount, 0)), 0)::float AS "outstandingPayables"
        FROM purchase_invoices pi
        JOIN suppliers s ON s.id = pi.supplier_id
        WHERE pi.status = 'confirmed' AND pi.invoice_date BETWEEN ${from} AND ${to}
          AND (${partyId}::int IS NULL OR pi.supplier_id = ${partyId})
          AND (${search} = '' OR pi.invoice_number ILIKE '%' || ${search} || '%' OR s.name ILIKE '%' || ${search} || '%')
      `;
      summary = totals[0];
    } else if (report === 'trial-balance') {
      const totals = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT COALESCE(SUM(jl.debit) FILTER (WHERE je.voucher_date BETWEEN ${from} AND ${to}), 0)::float AS "totalDebit",
               COALESCE(SUM(jl.credit) FILTER (WHERE je.voucher_date BETWEEN ${from} AND ${to}), 0)::float AS "totalCredit",
               COUNT(DISTINCT a.id)::int AS "accountCount"
        FROM accounts a
        LEFT JOIN journal_entry_lines jl ON jl.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted' AND je.voucher_date <= ${to}
        WHERE a.is_group = false
          AND (${accountId}::int IS NULL OR a.id = ${accountId})
          AND (${search} = '' OR a.name ILIKE '%' || ${search} || '%' OR a.account_code ILIKE '%' || ${search} || '%')
      `;
      summary = totals[0];
    } else if (report === 'stock-valuation') {
      const totals = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT COUNT(DISTINCT sb.item_id)::int AS "totalItems",
               COALESCE(SUM(sb.quantity), 0)::float AS "totalQuantity",
               COALESCE(SUM(sb.quantity * sb.average_cost), 0)::float AS "totalValue"
        FROM stock_balances sb JOIN items i ON i.id = sb.item_id
        WHERE (${itemId}::int IS NULL OR i.id = ${itemId})
          AND (${warehouseId}::int IS NULL OR sb.warehouse_id = ${warehouseId})
          AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%')
      `;
      summary = totals[0];
    } else if (report === 'stock-balance') {
      const totals = await prisma.$queryRaw<Record<string, unknown>[]>`
        WITH item_stock AS (
          SELECT i.id, i.reorder_level, COALESCE(SUM(sb.quantity), 0) AS quantity,
                 COALESCE(SUM(sb.quantity * sb.average_cost), 0) AS value
          FROM items i
          LEFT JOIN stock_balances sb ON sb.item_id = i.id
            AND (${warehouseId}::int IS NULL OR sb.warehouse_id = ${warehouseId})
          WHERE i.is_active = true
            AND (${itemId}::int IS NULL OR i.id = ${itemId})
            AND (${search} = '' OR i.name ILIKE '%' || ${search} || '%' OR i.item_code ILIKE '%' || ${search} || '%')
          GROUP BY i.id, i.reorder_level
        )
        SELECT COUNT(*)::int AS "totalItems", COALESCE(SUM(quantity), 0)::float AS "totalQuantity",
               COALESCE(SUM(value), 0)::float AS "totalValue",
               COUNT(*) FILTER (WHERE quantity <= reorder_level)::int AS "lowStockItems"
        FROM item_stock
      `;
      summary = totals[0];
    } else if (report === 'general-ledger' && accountId) {
      const totals = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT a.opening_balance + COALESCE(SUM(CASE WHEN je.voucher_date < ${from}
          THEN CASE WHEN a.account_type IN ('asset', 'expense') THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END ELSE 0 END), 0)::float AS "openingBalance",
          COALESCE(SUM(jl.debit) FILTER (WHERE je.voucher_date BETWEEN ${from} AND ${to}), 0)::float AS "totalDebit",
          COALESCE(SUM(jl.credit) FILTER (WHERE je.voucher_date BETWEEN ${from} AND ${to}), 0)::float AS "totalCredit",
          (a.opening_balance + COALESCE(SUM(CASE WHEN je.id IS NULL THEN 0
             WHEN a.account_type IN ('asset', 'expense') THEN jl.debit - jl.credit
             ELSE jl.credit - jl.debit END), 0))::float AS "closingBalance"
        FROM accounts a
        LEFT JOIN journal_entry_lines jl ON jl.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted' AND je.voucher_date <= ${to}
        WHERE a.id = ${accountId}
        GROUP BY a.id, a.opening_balance, a.account_type
      `;
      summary = totals[0];
    } else if (report === 'balance-sheet') {
      const totals = await prisma.$queryRaw<Record<string, unknown>[]>`
        WITH account_balances AS (
          SELECT a.account_type,
                 a.opening_balance + COALESCE(SUM(CASE WHEN je.id IS NULL THEN 0
                   WHEN a.account_type IN ('asset', 'expense') THEN jl.debit - jl.credit
                   ELSE jl.credit - jl.debit END), 0) AS balance
          FROM accounts a
          LEFT JOIN journal_entry_lines jl ON jl.account_id = a.id
          LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted' AND je.voucher_date <= ${to}
          WHERE a.is_group = false AND a.account_type IN ('asset', 'liability', 'equity')
          GROUP BY a.id, a.account_type, a.opening_balance
        ), income AS (
          SELECT COALESCE(SUM(CASE WHEN a.account_type = 'revenue' THEN jl.credit - jl.debit
                                   ELSE jl.debit - jl.credit END), 0) AS net_income
          FROM journal_entry_lines jl
          JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted' AND je.voucher_date <= ${to}
          JOIN accounts a ON a.id = jl.account_id
          WHERE a.account_type IN ('revenue', 'expense')
        )
        SELECT COALESCE(SUM(balance) FILTER (WHERE account_type = 'asset'), 0)::float AS assets,
               COALESCE(SUM(balance) FILTER (WHERE account_type = 'liability'), 0)::float AS liabilities,
               (COALESCE(SUM(balance) FILTER (WHERE account_type = 'equity'), 0) + income.net_income)::float AS equity
        FROM account_balances CROSS JOIN income GROUP BY income.net_income
      `;
      summary = totals[0];
    }
    return res.json({ ...rows, from, to, ...(summary ? { summary } : {}) });
  } catch (err) {
    return next(err);
  }
}

export async function getWorkspaceOptions(req: Request, res: Response, next: NextFunction) {
  try {
    let data: { id: number; label: string }[];
    switch (req.params.type) {
      case 'items':
        data = await prisma.item.findMany({
          where: { isActive: true },
          select: { id: true, itemCode: true, name: true },
          orderBy: { name: 'asc' },
          take: 1000,
        }).then((rows) => rows.map((row) => ({ id: row.id, label: `${row.itemCode} — ${row.name}` })));
        break;
      case 'accounts':
        data = await prisma.account.findMany({
          where: { isActive: true, isGroup: false },
          select: { id: true, accountCode: true, name: true },
          orderBy: { accountCode: 'asc' },
          take: 1000,
        }).then((rows) => rows.map((row) => ({ id: row.id, label: `${row.accountCode} — ${row.name}` })));
        break;
      case 'warehouses':
        data = await prisma.warehouse.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }).then((rows) => rows.map((row) => ({ id: row.id, label: row.name })));
        break;
      case 'customers':
        data = await prisma.customer.findMany({
          where: { isActive: true },
          select: { id: true, customerCode: true, name: true },
          orderBy: { name: 'asc' },
          take: 1000,
        }).then((rows) => rows.map((row) => ({ id: row.id, label: `${row.customerCode} — ${row.name}` })));
        break;
      case 'suppliers':
        data = await prisma.supplier.findMany({
          where: { isActive: true },
          select: { id: true, supplierCode: true, name: true },
          orderBy: { name: 'asc' },
          take: 1000,
        }).then((rows) => rows.map((row) => ({ id: row.id, label: `${row.supplierCode} — ${row.name}` })));
        break;
      case 'cashiers':
        data = await prisma.user.findMany({
          where: { status: 'active' },
          select: { id: true, fullName: true },
          orderBy: { fullName: 'asc' },
          take: 1000,
        }).then((rows) => rows.map((row) => ({ id: row.id, label: row.fullName })));
        break;
      case 'categories':
        data = await prisma.category.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }).then((rows) => rows.map((row) => ({ id: row.id, label: row.name })));
        break;
      default:
        throw createError(`Unknown report filter: ${req.params.type}.`, 404);
    }
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}
