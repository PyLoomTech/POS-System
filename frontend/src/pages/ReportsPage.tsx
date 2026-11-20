import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FolderTree,
  FileText,
  Package,
  Percent,
  Printer,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, StatCard } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Input'
import { DateRangePresets, presetRange } from '@/components/ui/DateRangePresets'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { useFetch } from '@/hooks/useFetch'
import { api } from '@/lib/api'
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  openPrintWindow,
  toNumber,
} from '@/lib/utils'

// ---------------------------------------------------------------
// Types (mirrors of the backend controller response shapes)
// ---------------------------------------------------------------

type Money = number | string

interface SalesSummaryData {
  from: string
  to: string
  invoiceCount: number
  subtotal: Money
  discount: Money
  taxableAmount: Money
  taxAmount: Money
  grandTotal: Money
  paidAmount: Money
  outstandingAmount: Money
  returnCount: number
  returnAmount: Money
  netSales: Money
}

interface SalesByItemRow {
  itemId: number
  itemCode: string
  name: string
  category: string
  quantity: Money
  revenue: Money
  discount: Money
  tax: Money
  netRevenue: Money
  transactionCount: number
  averageSellingPrice: Money
}

interface SalesItemHistoryRow {
  id: string
  date: string
  reference: string
  customer: string
  quantity: Money
  unitPrice: Money
  discount: Money
  tax: Money
  amount: Money
}

interface SalesRegisterRow {
  id: string | number
  invoiceNumber: string
  invoiceDate: string
  subtotal: Money
  discountAmount: Money
  taxAmount: Money
  grandTotal: Money
  paidAmount: Money
  outstandingAmount: Money
  paymentStatus: string
  paymentMethod: string | null
  status: string
  customer: { name: string; phone: string | null } | null
  cashier: { fullName: string } | null
}

interface SalesReturnRow {
  id: string | number
  returnNumber: string
  returnDate: string
  subtotal: Money
  taxAmount: Money
  totalAmount: Money
  refundAmount: Money
  refundMethod: string | null
  status: string
  returnedQuantity: Money
  processedByName: string | null
  customer: { name: string; phone: string | null }
  originalInvoice: { id: string | number; invoiceNumber: string }
  items: Array<{ item: { name: string; itemCode: string }; returnedQty: Money }>
}

interface ReportPage<T> {
  data: T[]
  total: number
  page: number
  limit: number
  summary?: {
    invoiceCount: number
    grossSales: Money
    discount: Money
    collected: Money
    outstanding: Money
  }
}

interface SalesByCategoryRow {
  categoryId: number
  category: string
  quantity: Money
  revenue: Money
}

interface SalesByCustomerRow {
  customerId: number
  customerCode: string
  name: string
  phone: string | null
  invoiceCount: number
  revenue: Money
  paidAmount: Money
  outstanding: Money
}

interface SalesByCashierRow {
  cashierId: number | null
  cashier: string
  invoiceCount: number
  revenue: Money
  paidAmount: Money
}

interface PurchaseSupplierRow {
  supplierId: number
  supplierCode: string
  name: string
  invoiceCount: number
  purchases: Money
  paidAmount: Money
  outstanding: Money
}

interface PurchaseSummaryData {
  from: string
  to: string
  invoiceCount: number
  subtotal: Money
  discount: Money
  taxAmount: Money
  totalPurchases: Money
  paidAmount: Money
  outstandingAmount: Money
  returnCount: number
  returnAmount: Money
  netPurchases: Money
  suppliers: PurchaseSupplierRow[]
}

interface LowStockRow {
  itemId: number
  itemCode: string
  name: string
  quantity: Money
  reorderLevel: Money
  suggestedOrder: Money
  value: Money
}

interface InventoryMovementRow {
  id: string
  createdAt: string
  movementType: string
  quantity: Money
  unitCost: Money | null
  referenceType: string | null
  narration: string | null
  itemCode: string
  item: string
  warehouse: string
}

interface AccountLine {
  accountCode: string
  name: string
  amount: Money
}

interface ProfitLossData {
  from: string
  to: string
  revenue: Money
  cogs: Money
  grossProfit: Money
  expenses: Money
  netProfit: Money
  revenueAccounts: AccountLine[]
  expenseAccounts: AccountLine[]
}

interface StockValuationRow {
  itemId: number
  itemCode: string
  name: string
  quantity: Money
  averageCost: Money
  value: Money
  warehouse: string
}

interface StockValuationData {
  data: StockValuationRow[]
  totalValue: Money
  totalQuantity: Money
}

interface VatData {
  from: string
  to: string
  sales: { taxableAmount: Money; nonTaxableAmount: Money; outputVat: Money }
  purchases: { taxableAmount: Money; inputVat: Money }
  netVatPayable: Money
}

interface DayBookInvoice {
  id: string | number
  invoiceNumber: string
  invoiceDate: string
  grandTotal: Money
  paidAmount?: Money
  outstandingAmount: Money
  status: string
  customer?: { name: string } | null
  supplier?: { name: string } | null
}

interface DayBookPayment {
  id: string | number
  paymentNumber: string
  paymentDate: string
  paymentType: string
  paymentMethod: string
  amount: Money
  customer?: { name: string } | null
  supplier?: { name: string } | null
}

interface DayBookReturn {
  id: string | number
  returnNumber: string
  returnDate: string
  totalAmount: Money
  customer?: { name: string } | null
}

interface DayBookData {
  date: string
  salesInvoices: DayBookInvoice[]
  purchaseInvoices: DayBookInvoice[]
  payments: DayBookPayment[]
  salesReturns: DayBookReturn[]
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function periodLabel(from?: string, to?: string): string {
  return `${formatDate(from)} — ${formatDate(to)}`
}

const STATUS_TONES: Record<string, 'green' | 'red' | 'amber' | 'slate' | 'indigo'> = {
  confirmed: 'green',
  draft: 'slate',
  cancelled: 'red',
  returned: 'amber',
  partially_returned: 'amber',
}

type TabKey =
  | 'summary'
  | 'sales-register'
  | 'by-item'
  | 'by-category'
  | 'by-customer'
  | 'by-cashier'
  | 'sales-returns'
  | 'purchases'
  | 'pl'
  | 'vat'
  | 'stock'
  | 'low-stock'
  | 'movements'
  | 'receivables'
  | 'payables'
  | 'daybook'
  | 'daily-sales'
  | 'discount-report'
  | 'payment-collection'
  | 'sales-item-history'
  | 'purchase-register'
  | 'purchase-by-item'
  | 'purchase-by-supplier'
  | 'purchase-return-register'
  | 'purchase-item-history'
  | 'balance-sheet'
  | 'trial-balance'
  | 'general-ledger'
  | 'cash-book'
  | 'bank-book'
  | 'customer-ledger'
  | 'supplier-ledger'
  | 'expense-report'
  | 'cash-flow'
  | 'profit-loss'
  | 'stock-valuation'
  | 'stock-movements'
  | 'day-book'
  | 'stock-balance'
  | 'stock-ledger'
  | 'stock-ageing'
  | 'item-profitability'
  | 'warehouse-stock'
  | 'sales-vat-register'
  | 'purchase-vat-register'
  | 'vat-return-summary'
  | 'sales-return-vat'
  | 'purchase-return-vat'

const WORKSPACE_TABS: TabKey[] = [
  'daily-sales', 'discount-report', 'payment-collection', 'sales-item-history',
  'purchase-register', 'purchase-by-item', 'purchase-by-supplier',
  'purchase-return-register', 'purchase-item-history', 'balance-sheet',
  'trial-balance', 'general-ledger', 'cash-book', 'bank-book',
  'customer-ledger', 'supplier-ledger', 'expense-report', 'cash-flow',
  'profit-loss', 'stock-balance', 'stock-ledger', 'stock-valuation',
  'stock-movements', 'stock-ageing', 'item-profitability',
  'warehouse-stock', 'sales-vat-register', 'purchase-vat-register',
  'vat-return-summary', 'sales-return-vat', 'purchase-return-vat',
  'day-book', 'receivables', 'payables',
]

const REPORT_GROUPS: { label: string; items: { key: TabKey; label: string; icon: ReactNode }[] }[] = [
  {
    label: 'Sales',
    items: [
      { key: 'summary', label: 'Sales Summary', icon: <BarChart3 size={15} /> },
      { key: 'sales-register', label: 'Sales Register', icon: <FileText size={15} /> },
      { key: 'by-item', label: 'Sales by Item', icon: <Package size={15} /> },
      { key: 'by-category', label: 'Sales by Category', icon: <FolderTree size={15} /> },
      { key: 'by-customer', label: 'Sales by Customer', icon: <UsersRound size={15} /> },
      { key: 'by-cashier', label: 'Sales by Cashier', icon: <UserRound size={15} /> },
      { key: 'daily-sales', label: 'Daily Sales', icon: <CalendarDays size={15} /> },
      { key: 'sales-returns', label: 'Sales Return Register', icon: <RotateCcw size={15} /> },
      { key: 'discount-report', label: 'Discount Report', icon: <Percent size={15} /> },
      { key: 'payment-collection', label: 'Payment Collection', icon: <ArrowDownLeft size={15} /> },
    ],
  },
  {
    label: 'Buying',
    items: [
      { key: 'purchase-register', label: 'Purchase Register', icon: <ShoppingCart size={15} /> },
      { key: 'purchase-by-item', label: 'Purchase by Item', icon: <Package size={15} /> },
      { key: 'purchase-by-supplier', label: 'Purchase by Supplier', icon: <UsersRound size={15} /> },
      { key: 'purchase-return-register', label: 'Purchase Return Register', icon: <RotateCcw size={15} /> },
      { key: 'purchase-item-history', label: 'Item Purchase History', icon: <Activity size={15} /> },
    ],
  },
  {
    label: 'Finance',
    items: [
      { key: 'profit-loss', label: 'Profit & Loss', icon: <TrendingUp size={15} /> },
      { key: 'balance-sheet', label: 'Balance Sheet', icon: <BarChart3 size={15} /> },
      { key: 'general-ledger', label: 'General Ledger', icon: <FileText size={15} /> },
      { key: 'cash-book', label: 'Cash Book', icon: <ArrowDownLeft size={15} /> },
      { key: 'bank-book', label: 'Bank Book', icon: <ArrowUpRight size={15} /> },
      { key: 'day-book', label: 'Day Book', icon: <CalendarDays size={15} /> },
      { key: 'receivables', label: 'Receivables', icon: <ArrowDownLeft size={15} /> },
      { key: 'payables', label: 'Payables', icon: <ArrowUpRight size={15} /> },
      { key: 'customer-ledger', label: 'Customer Ledger', icon: <UserRound size={15} /> },
      { key: 'supplier-ledger', label: 'Supplier Ledger', icon: <UsersRound size={15} /> },
      { key: 'expense-report', label: 'Expense Report', icon: <Percent size={15} /> },
      { key: 'cash-flow', label: 'Cash Flow', icon: <Activity size={15} /> },
    ],
  },
  {
    label: 'Stock',
    items: [
      { key: 'stock-balance', label: 'Stock Balance', icon: <Boxes size={15} /> },
      { key: 'stock-ledger', label: 'Stock Ledger', icon: <FileText size={15} /> },
      { key: 'stock-valuation', label: 'Stock Valuation', icon: <Boxes size={15} /> },
      { key: 'stock-movements', label: 'Stock Movements', icon: <Activity size={15} /> },
      { key: 'low-stock', label: 'Low Stock', icon: <AlertTriangle size={15} /> },
      { key: 'stock-ageing', label: 'Stock Ageing', icon: <CalendarDays size={15} /> },
      { key: 'item-profitability', label: 'Item Profitability', icon: <TrendingUp size={15} /> },
      { key: 'warehouse-stock', label: 'Warehouse Stock', icon: <Boxes size={15} /> },
    ],
  },
  {
    label: 'Tax',
    items: [
      { key: 'sales-vat-register', label: 'Sales VAT Register', icon: <Percent size={15} /> },
      { key: 'purchase-vat-register', label: 'Purchase VAT Register', icon: <Percent size={15} /> },
      { key: 'vat-return-summary', label: 'VAT Return Summary', icon: <FileText size={15} /> },
      { key: 'sales-return-vat', label: 'Sales Return VAT', icon: <RotateCcw size={15} /> },
      { key: 'purchase-return-vat', label: 'Purchase Return VAT', icon: <RotateCcw size={15} /> },
    ],
  },
]

const REPORT_DESCRIPTIONS: Record<TabKey, string> = {
  summary: 'Track sales, discounts, collections, and returns across the selected period.',
  'sales-register': 'Review invoices, customer details, payment status, and cashier activity.',
  'by-item': 'Compare product sales, quantities, discounts, tax, and average selling price.',
  'by-category': 'Review sales performance across product categories.',
  'by-customer': 'Compare customer purchase totals, collections, and outstanding balances.',
  'by-cashier': 'Review invoice totals and collections by cashier.',
  'sales-returns': 'Review returned sales, tax reversals, refunds, and original invoices.',
  purchases: 'Review purchase totals, returns, supplier balances, and payment activity.',
  pl: 'Review recognized revenue, cost of goods sold, expenses, and profit.',
  vat: 'Compare output VAT on sales against input VAT on purchases.',
  stock: 'Review current quantities and average-cost inventory value by warehouse.',
  'low-stock': 'Identify active items at or below their reorder level.',
  movements: 'Review receipts, sales, returns, and adjustments to inventory.',
  receivables: 'Review customer balances awaiting collection.',
  payables: 'Review supplier balances awaiting payment.',
  daybook: 'Review invoices, payments, and returns posted on a selected day.',
  'day-book': 'Review posted vouchers, total debits, and credits for the selected period.',
  'daily-sales': 'Compare daily sales totals, discounts, tax, receipts, and balances.',
  'discount-report': 'Review invoice-level discounts and the staff who processed them.',
  'payment-collection': 'Review completed customer receipts and supplier payments.',
  'sales-item-history': 'Inspect dated sales transactions for a selected item.',
  'purchase-register': 'Review confirmed purchase invoices, tax, payments, and supplier balances.',
  'purchase-by-item': 'Compare item quantities, purchase costs, and invoice counts.',
  'purchase-by-supplier': 'Review confirmed purchases, payments, and balances by supplier.',
  'purchase-return-register': 'Review completed supplier returns and their original invoices.',
  'purchase-item-history': 'Inspect dated purchase transactions for a selected item.',
  'balance-sheet': 'Review asset, liability, and equity balances through the selected date.',
  'trial-balance': 'Compare opening balances, posted debits, credits, and closing balances.',
  'general-ledger': 'Inspect posted account entries and running balances.',
  'cash-book': 'Review posted cash account entries for the selected period.',
  'bank-book': 'Review posted bank account entries for the selected period.',
  'customer-ledger': 'Inspect posted journal activity associated with a selected customer.',
  'supplier-ledger': 'Inspect posted journal activity associated with a selected supplier.',
  'expense-report': 'Review posted expense account entries and amounts.',
  'cash-flow': 'Review posted movements through cash and bank accounts.',
  'profit-loss': 'Review recognized revenue, cost of goods sold, expenses, and profit.',
  'stock-balance': 'Review current item quantities and values by warehouse.',
  'stock-valuation': 'Review current quantities and average-cost inventory value by warehouse.',
  'stock-movements': 'Review receipts, sales, returns, and adjustments to inventory.',
  'stock-ledger': 'Inspect dated inventory movements and running quantities for an item.',
  'stock-ageing': 'Review on-hand value and days since the most recent stock receipt.',
  'item-profitability': 'Compare item revenue, historical cost of goods sold, and gross profit.',
  'warehouse-stock': 'Review item balances and valuation by warehouse.',
  'sales-vat-register': 'Review confirmed sales invoices and their recorded VAT.',
  'purchase-vat-register': 'Review confirmed purchase invoices and their recorded VAT.',
  'vat-return-summary': 'Summarize output and input VAT, including recorded return adjustments.',
  'sales-return-vat': 'Review VAT reversals recorded on completed sales returns.',
  'purchase-return-vat': 'Review completed purchase returns and their recorded amounts.',
}

// ---------------------------------------------------------------
// Shared loading / error / empty wrapper used by every tab
// ---------------------------------------------------------------

interface ReportSectionProps<T> {
  url: string
  emptyTitle?: string
  emptyDescription?: string
  isEmpty?: (data: T) => boolean
  children: (data: T) => ReactNode
}

function ReportSection<T>({
  url,
  emptyTitle = 'No data',
  emptyDescription,
  isEmpty,
  children,
}: ReportSectionProps<T>) {
  const { data, loading, error, reload } = useFetch<T>(url)

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (data == null || (isEmpty && isEmpty(data))) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }
  return <>{children(data)}</>
}

function SummaryRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: ReactNode
  strong?: boolean
  tone?: 'emerald' | 'red' | 'slate'
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={cn('text-ink-3', strong && 'font-medium text-ink')}>{label}</dt>
      <dd
        className={cn(
          'tabular-nums text-ink',
          strong && 'font-semibold',
          tone === 'emerald' && 'text-brand-green',
          tone === 'red' && 'text-brand-crimson',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line-2 bg-white/70 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums text-ink">{value}</p>
    </div>
  )
}

function ReportPagination({
  page,
  limit,
  total,
  onPageChange,
}: {
  page: number
  limit: number
  total: number
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / limit))
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-line-2 px-5 py-3">
      <span className="text-xs text-ink-3">
        Page {page} of {pageCount} · {formatNumber(total)} records
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Individual reports
// ---------------------------------------------------------------

function SalesSummaryTab({ range }: { range: string }) {
  return (
    <ReportSection<SalesSummaryData> url={`/reports/sales-summary?${range}`}>
      {(data) => (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Grand Total"
              value={formatCurrency(data.grandTotal)}
              hint={`${data.invoiceCount} confirmed invoice(s)`}
              icon={<BarChart3 size={18} />}
              tone="indigo"
            />
            <StatCard
              label="Net Sales"
              value={formatCurrency(data.netSales)}
              hint={`After ${formatCurrency(data.returnAmount)} of returns`}
              icon={<TrendingUp size={18} />}
              tone="emerald"
            />
            <StatCard
              label="Paid"
              value={formatCurrency(data.paidAmount)}
              hint="Collected from customers"
              icon={<ArrowDownLeft size={18} />}
              tone="emerald"
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(data.outstandingAmount)}
              hint="Still due from customers"
              icon={<ArrowUpRight size={18} />}
              tone="amber"
            />
          </div>

          <Card>
            <CardHeader
              title="Sales Summary"
              subtitle={periodLabel(data.from, data.to)}
              action={
                <span className="text-xs text-ink-3">{data.invoiceCount} invoice(s)</span>
              }
            />
            <dl className="grid grid-cols-1 gap-x-10 gap-y-3 px-5 py-4 sm:grid-cols-2">
              <SummaryRow label="Subtotal" value={formatCurrency(data.subtotal)} />
              <SummaryRow label="Discount" value={formatCurrency(data.discount)} />
              <SummaryRow label="Taxable Amount" value={formatCurrency(data.taxableAmount)} />
              <SummaryRow label="Tax (VAT)" value={formatCurrency(data.taxAmount)} />
              <SummaryRow label="Grand Total" value={formatCurrency(data.grandTotal)} strong />
              <SummaryRow label="Paid Amount" value={formatCurrency(data.paidAmount)} />
              <SummaryRow label="Outstanding" value={formatCurrency(data.outstandingAmount)} />
              <SummaryRow label="Returns" value={`${data.returnCount} return(s)`} />
              <SummaryRow label="Return Amount" value={formatCurrency(data.returnAmount)} />
              <SummaryRow
                label="Net Sales"
                value={formatCurrency(data.netSales)}
                strong
                tone="emerald"
              />
            </dl>
          </Card>
        </>
      )}
    </ReportSection>
  )
}

function SalesRegisterTab({ range }: { range: string }) {
  const navigate = useNavigate()
  const emptyFilters = { search: '', cashier: '', paymentStatus: '', paymentMethod: '', status: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [applied, setApplied] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const url = useMemo(() => {
    const params = new URLSearchParams(range)
    params.set('page', String(page))
    params.set('limit', '50')
    for (const [key, value] of Object.entries(applied)) {
      if (value) params.set(key, value)
    }
    return `/reports/sales-register?${params.toString()}`
  }, [range, applied, page])
  const { data, loading, error, reload } = useFetch<ReportPage<SalesRegisterRow>>(url)
  const columns: Column<SalesRegisterRow>[] = [
    {
      header: 'Invoice',
      cell: (row) => (
        <button
          type="button"
          className="font-medium text-accent hover:underline"
          onClick={() => navigate(`/sales?invoiceId=${encodeURIComponent(row.id)}`)}
        >
          {row.invoiceNumber}
        </button>
      ),
    },
    { header: 'Date', cell: (row) => formatDate(row.invoiceDate) },
    { header: 'Customer', cell: (row) => row.customer?.name ?? 'Walk-in' },
    { header: 'Phone', cell: (row) => row.customer?.phone ?? '—' },
    { header: 'Cashier', cell: (row) => row.cashier?.fullName ?? '—' },
    { header: 'Subtotal', align: 'right', cell: (row) => formatCurrency(row.subtotal) },
    { header: 'Discount', align: 'right', cell: (row) => formatCurrency(row.discountAmount) },
    { header: 'Tax', align: 'right', cell: (row) => formatCurrency(row.taxAmount) },
    {
      header: 'Grand Total',
      align: 'right',
      cell: (row) => <span className="font-semibold">{formatCurrency(row.grandTotal)}</span>,
    },
    { header: 'Paid', align: 'right', cell: (row) => formatCurrency(row.paidAmount) },
    { header: 'Outstanding', align: 'right', cell: (row) => formatCurrency(row.outstandingAmount) },
    {
      header: 'Payment',
      cell: (row) => <Badge tone={row.paymentStatus === 'paid' ? 'green' : row.paymentStatus === 'partial' ? 'amber' : 'red'}>{row.paymentStatus}</Badge>,
    },
    { header: 'Method', cell: (row) => row.paymentMethod?.replaceAll('_', ' ') ?? '—' },
    {
      header: 'Status',
      cell: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{row.status.replaceAll('_', ' ')}</Badge>,
    },
  ]

  return (
    <Card>
      <CardHeader title="Sales Register" subtitle="Posted invoices with payment and cashier details" />
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <Field label="Invoice / customer" className="min-w-[220px] flex-1">
          <Input
            placeholder="Search invoice, customer, or phone"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          />
        </Field>
        <Field label="Cashier">
          <Input value={filters.cashier} onChange={(event) => setFilters((prev) => ({ ...prev, cashier: event.target.value }))} />
        </Field>
        <Field label="Payment status">
          <Select value={filters.paymentStatus} onChange={(event) => setFilters((prev) => ({ ...prev, paymentStatus: event.target.value }))}>
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </Select>
        </Field>
        <Field label="Payment method">
          <Select value={filters.paymentMethod} onChange={(event) => setFilters((prev) => ({ ...prev, paymentMethod: event.target.value }))}>
            <option value="">All</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option>
            <option value="digital_wallet">Digital wallet</option>
            <option value="qr">QR</option>
            <option value="customer_credit">Customer credit</option>
            <option value="split">Split</option>
          </Select>
        </Field>
        <Field label="Invoice status">
          <Select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
            <option value="">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="draft">Draft</option>
            <option value="returned">Returned</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Button onClick={() => { setApplied(filters); setPage(1) }}>Apply</Button>
        <Button variant="outline" onClick={() => {
          setFilters(emptyFilters)
          setApplied(emptyFilters)
          setPage(1)
        }}>Clear</Button>
      </div>
      {data?.summary && (
        <div className="grid grid-cols-2 gap-2 px-5 pb-4 sm:grid-cols-3 xl:grid-cols-5">
          <ReportMetric label="Invoices" value={formatNumber(data.summary.invoiceCount)} />
          <ReportMetric label="Gross sales" value={formatCurrency(data.summary.grossSales)} />
          <ReportMetric label="Discount" value={formatCurrency(data.summary.discount)} />
          <ReportMetric label="Collected" value={formatCurrency(data.summary.collected)} />
          <ReportMetric label="Outstanding" value={formatCurrency(data.summary.outstanding)} />
        </div>
      )}
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No sales invoices"
        emptyDescription="No invoices matched the selected filters."
      />
      {data && <ReportPagination page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />}
    </Card>
  )
}

function SalesReturnRegisterTab({ range }: { range: string }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const url = useMemo(() => {
    const params = new URLSearchParams(range)
    params.set('page', String(page))
    params.set('limit', '50')
    if (appliedSearch) params.set('search', appliedSearch)
    return `/reports/sales-return-register?${params.toString()}`
  }, [range, appliedSearch, page])
  const { data, loading, error, reload } = useFetch<ReportPage<SalesReturnRow>>(url)
  const columns: Column<SalesReturnRow>[] = [
    { header: 'Return', cell: (row) => <span className="font-medium text-ink">{row.returnNumber}</span> },
    {
      header: 'Original Invoice',
      cell: (row) => (
        <button
          type="button"
          className="font-medium text-accent hover:underline"
          onClick={() => navigate(`/sales?invoiceId=${encodeURIComponent(row.originalInvoice.id)}`)}
        >
          {row.originalInvoice.invoiceNumber}
        </button>
      ),
    },
    { header: 'Date', cell: (row) => formatDate(row.returnDate) },
    { header: 'Customer', cell: (row) => row.customer?.name ?? 'Walk-in' },
    {
      header: 'Items',
      cell: (row) => (
        <span title={row.items.map((entry) => `${entry.item.name} (${entry.item.itemCode})`).join(', ')}>
          {row.items.map((entry) => entry.item.name).join(', ') || '—'}
        </span>
      ),
    },
    { header: 'Qty', align: 'right', cell: (row) => formatNumber(row.returnedQuantity, 2) },
    { header: 'Return Amount', align: 'right', cell: (row) => formatCurrency(row.totalAmount) },
    { header: 'Tax Reversal', align: 'right', cell: (row) => formatCurrency(row.taxAmount) },
    { header: 'Refund', align: 'right', cell: (row) => formatCurrency(row.refundAmount) },
    { header: 'Method', cell: (row) => row.refundMethod?.replaceAll('_', ' ') ?? '—' },
    { header: 'Processed By', cell: (row) => row.processedByName ?? '—' },
  ]

  return (
    <Card>
      <CardHeader title="Sales Return Register" subtitle="Completed sales returns and refunds" />
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <Field label="Search return, invoice, customer, or item" className="min-w-[260px] flex-1">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} />
        </Field>
        <Button onClick={() => { setAppliedSearch(search); setPage(1) }}>Apply</Button>
        <Button variant="outline" onClick={() => { setSearch(''); setAppliedSearch(''); setPage(1) }}>Clear</Button>
      </div>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No sales returns"
        emptyDescription="No returns matched the selected filters."
      />
      {data && <ReportPagination page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />}
    </Card>
  )
}

function SalesByItemTab({ range }: { range: string }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ search: '', categoryId: '', invoice: '', customer: '', cashier: '' })
  const [applied, setApplied] = useState(filters)
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<SalesByItemRow | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const { data: categories } = useFetch<Array<{ id: number; name: string }>>('/categories')
  const historyUrl = useMemo(() => {
    const params = new URLSearchParams(range)
    params.set('itemId', String(selectedItem?.itemId ?? ''))
    params.set('page', String(historyPage))
    params.set('limit', '25')
    return `/reports/workspace/sales-item-history?${params.toString()}`
  }, [historyPage, range, selectedItem?.itemId])
  const history = useFetch<ReportPage<SalesItemHistoryRow>>(historyUrl, selectedItem !== null)
  const url = useMemo(() => {
    const params = new URLSearchParams(range)
    params.set('page', String(page))
    params.set('limit', '50')
    for (const [key, value] of Object.entries(applied)) {
      if (value) params.set(key, value)
    }
    return `/reports/sales-by-item?${params.toString()}`
  }, [range, applied, page])
  const { data, loading, error, reload } = useFetch<ReportPage<SalesByItemRow>>(url)
  const columns: Column<SalesByItemRow>[] = [
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-ink-3">{row.itemCode}</span>,
    },
    {
      header: 'Item',
      cell: (row) => (
        <button
          type="button"
          className="text-left font-medium text-accent hover:underline"
          onClick={() => {
            setSelectedItem(row)
            setHistoryPage(1)
          }}
        >
          {row.name}<span className="block text-xs font-normal text-ink-3">{row.category}</span>
        </button>
      ),
    },
    {
      header: 'Quantity',
      align: 'right',
      cell: (row) => formatNumber(row.quantity, 2),
    },
    {
      header: 'Sales',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-ink">{formatCurrency(row.revenue)}</span>
      ),
    },
    { header: 'Discount', align: 'right', cell: (row) => formatCurrency(row.discount) },
    {
      header: 'Tax',
      align: 'right',
      cell: (row) => <span className="text-ink-3">{formatCurrency(row.tax)}</span>,
    },
    { header: 'Net Revenue', align: 'right', cell: (row) => formatCurrency(row.netRevenue) },
    { header: 'Transactions', align: 'right', cell: (row) => formatNumber(row.transactionCount) },
    { header: 'Avg. Price', align: 'right', cell: (row) => formatCurrency(row.averageSellingPrice) },
  ]

  return (
    <Card>
      <CardHeader title="Sales by Item" subtitle="Search by item, category, customer, cashier, or invoice" />
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <Field label="Search item" className="min-w-[220px] flex-1">
          <Input
            placeholder="Name, code, or barcode"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          />
        </Field>
        <Field label="Category">
          <Select
            value={filters.categoryId}
            onChange={(event) => setFilters((prev) => ({ ...prev, categoryId: event.target.value }))}
          >
            <option value="">All categories</option>
            {(categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Invoice">
          <Input
            value={filters.invoice}
            onChange={(event) => setFilters((prev) => ({ ...prev, invoice: event.target.value }))}
          />
        </Field>
        <Field label="Customer">
          <Input
            value={filters.customer}
            onChange={(event) => setFilters((prev) => ({ ...prev, customer: event.target.value }))}
          />
        </Field>
        <Field label="Cashier">
          <Input
            value={filters.cashier}
            onChange={(event) => setFilters((prev) => ({ ...prev, cashier: event.target.value }))}
          />
        </Field>
        <Button onClick={() => { setApplied(filters); setPage(1) }}>Apply</Button>
        <Button variant="outline" onClick={() => {
          const cleared = { search: '', categoryId: '', invoice: '', customer: '', cashier: '' }
          setFilters(cleared)
          setApplied(cleared)
          setPage(1)
        }}>Clear</Button>
      </div>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(row) => row.itemId}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No item sales"
        emptyDescription="No confirmed sales matched the selected filters."
      />
      {data && (
        <ReportPagination
          page={data.page}
          limit={data.limit}
          total={data.total}
          onPageChange={setPage}
        />
      )}
      <Modal
        open={selectedItem !== null}
        title={selectedItem ? `Sales history · ${selectedItem.name}` : 'Sales history'}
        size="lg"
        onClose={() => setSelectedItem(null)}
      >
        {selectedItem && (
          <>
            <DataTable
              columns={[
                { header: 'Date', cell: (row) => formatDate(String(row.date)) },
                {
                  header: 'Invoice',
                  cell: (row) => (
                    <button
                      type="button"
                      className="font-medium text-accent hover:underline"
                      onClick={() => navigate(`/sales?invoiceId=${encodeURIComponent(String(row.id))}`)}
                    >{row.reference}</button>
                  ),
                },
                { header: 'Customer', cell: (row) => row.customer || '—' },
                { header: 'Quantity', align: 'right', cell: (row) => formatNumber(row.quantity, 2) },
                { header: 'Unit Price', align: 'right', cell: (row) => formatCurrency(row.unitPrice) },
                { header: 'Discount', align: 'right', cell: (row) => formatCurrency(row.discount) },
                { header: 'Tax', align: 'right', cell: (row) => formatCurrency(row.tax) },
                { header: 'Amount', align: 'right', cell: (row) => formatCurrency(row.amount) },
              ]}
              rows={history.data?.data ?? []}
              rowKey={(row) => String(row.id)}
              loading={history.loading}
              error={history.error}
              onRetry={history.reload}
              emptyTitle="No item sales"
              emptyDescription="No sales transactions matched this item and date range."
            />
            {history.data && (
              <ReportPagination
                page={history.data.page}
                limit={history.data.limit}
                total={history.data.total}
                onPageChange={setHistoryPage}
              />
            )}
          </>
        )}
      </Modal>
    </Card>
  )
}

function SalesByCategoryTab({ range }: { range: string }) {
  const columns: Column<SalesByCategoryRow>[] = [
    {
      header: 'Category',
      cell: (row) => <span className="font-medium text-ink">{row.category}</span>,
    },
    {
      header: 'Quantity',
      align: 'right',
      cell: (row) => formatNumber(row.quantity, 2),
    },
    {
      header: 'Revenue',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-ink">{formatCurrency(row.revenue)}</span>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader title="Sales by Category" subtitle="Revenue grouped by product category" />
      <ReportSection<{ data: SalesByCategoryRow[] }>
        url={`/reports/sales-by-category?${range}`}
        emptyTitle="No category sales"
        emptyDescription="No confirmed sales were recorded for the selected period."
        isEmpty={(d) => d.data.length === 0}
      >
        {(d) => <DataTable columns={columns} rows={d.data} rowKey={(row) => row.categoryId} />}
      </ReportSection>
    </Card>
  )
}

function SalesByCustomerTab({ range }: { range: string }) {
  const columns: Column<SalesByCustomerRow>[] = [
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-ink-3">{row.customerCode}</span>,
    },
    {
      header: 'Customer',
      cell: (row) => <span className="font-medium text-ink">{row.name}</span>,
    },
    { header: 'Phone', cell: (row) => row.phone ?? '—' },
    {
      header: 'Invoices',
      align: 'right',
      cell: (row) => formatNumber(row.invoiceCount),
    },
    {
      header: 'Sales',
      align: 'right',
      cell: (row) => <span className="font-semibold">{formatCurrency(row.revenue)}</span>,
    },
    {
      header: 'Collected',
      align: 'right',
      cell: (row) => formatCurrency(row.paidAmount),
    },
    {
      header: 'Outstanding',
      align: 'right',
      cell: (row) => (
        <span className={toNumber(row.outstanding) > 0 ? 'text-brand-crimson' : 'text-ink-3'}>
          {formatCurrency(row.outstanding)}
        </span>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader title="Sales by Customer" subtitle="Confirmed sales grouped by customer" />
      <ReportSection<{ data: SalesByCustomerRow[] }>
        url={`/reports/sales-by-customer?${range}`}
        emptyTitle="No customer sales"
        emptyDescription="No confirmed sales were recorded for the selected period."
        isEmpty={(data) => data.data.length === 0}
      >
        {(data) => <DataTable columns={columns} rows={data.data} rowKey={(row) => row.customerId} />}
      </ReportSection>
    </Card>
  )
}

function SalesByCashierTab({ range }: { range: string }) {
  const columns: Column<SalesByCashierRow>[] = [
    {
      header: 'Cashier',
      cell: (row) => <span className="font-medium text-ink">{row.cashier}</span>,
    },
    {
      header: 'Invoices',
      align: 'right',
      cell: (row) => formatNumber(row.invoiceCount),
    },
    {
      header: 'Sales',
      align: 'right',
      cell: (row) => <span className="font-semibold">{formatCurrency(row.revenue)}</span>,
    },
    {
      header: 'Collected',
      align: 'right',
      cell: (row) => formatCurrency(row.paidAmount),
    },
  ]

  return (
    <Card>
      <CardHeader title="Sales by Cashier" subtitle="Confirmed invoices grouped by cashier" />
      <ReportSection<{ data: SalesByCashierRow[] }>
        url={`/reports/sales-by-cashier?${range}`}
        emptyTitle="No cashier sales"
        emptyDescription="No confirmed sales were recorded for the selected period."
        isEmpty={(data) => data.data.length === 0}
      >
        {(data) => (
          <DataTable
            columns={columns}
            rows={data.data}
            rowKey={(row) => row.cashierId ?? 'unassigned'}
          />
        )}
      </ReportSection>
    </Card>
  )
}

function PurchaseSummaryTab({ range }: { range: string }) {
  const columns: Column<PurchaseSupplierRow>[] = [
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-ink-3">{row.supplierCode}</span>,
    },
    {
      header: 'Supplier',
      cell: (row) => <span className="font-medium text-ink">{row.name}</span>,
    },
    {
      header: 'Invoices',
      align: 'right',
      cell: (row) => formatNumber(row.invoiceCount),
    },
    {
      header: 'Purchases',
      align: 'right',
      cell: (row) => <span className="font-semibold">{formatCurrency(row.purchases)}</span>,
    },
    {
      header: 'Paid',
      align: 'right',
      cell: (row) => formatCurrency(row.paidAmount),
    },
    {
      header: 'Outstanding',
      align: 'right',
      cell: (row) => (
        <span className={toNumber(row.outstanding) > 0 ? 'text-brand-amber' : 'text-ink-3'}>
          {formatCurrency(row.outstanding)}
        </span>
      ),
    },
  ]

  return (
    <ReportSection<PurchaseSummaryData>
      url={`/reports/purchase-summary?${range}`}
      emptyTitle="No purchases"
      emptyDescription="No confirmed purchases were recorded for the selected period."
      isEmpty={(data) => data.invoiceCount === 0 && data.returnCount === 0}
    >
      {(data) => (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Purchases"
              value={formatCurrency(data.totalPurchases)}
              hint={`${data.invoiceCount} confirmed invoice(s)`}
              icon={<ShoppingCart size={18} />}
              tone="indigo"
            />
            <StatCard
              label="Net Purchases"
              value={formatCurrency(data.netPurchases)}
              hint="After purchase returns"
              icon={<TrendingUp size={18} />}
              tone="emerald"
            />
            <StatCard
              label="Returns"
              value={formatCurrency(data.returnAmount)}
              hint={`${data.returnCount} completed return(s)`}
              icon={<ArrowUpRight size={18} />}
              tone="amber"
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(data.outstandingAmount)}
              hint="Still due to suppliers"
              icon={<ArrowDownLeft size={18} />}
              tone="red"
            />
          </div>
          <Card>
            <CardHeader title="Purchases by Supplier" subtitle={periodLabel(data.from, data.to)} />
            <DataTable columns={columns} rows={data.suppliers} rowKey={(row) => row.supplierId} />
          </Card>
        </div>
      )}
    </ReportSection>
  )
}

function ProfitLossTab({ range }: { range: string }) {
  return (
    <ReportSection<ProfitLossData> url={`/reports/profit-loss?${range}`}>
      {(data) => {
        const netPositive = toNumber(data.netProfit) >= 0
        return (
          <Card>
            <CardHeader title="Profit & Loss" subtitle={periodLabel(data.from, data.to)} />
            <div className="space-y-5 px-5 py-4">
              <section>
                <div className="flex items-center justify-between border-b border-line-2 pb-2">
                  <span className="text-sm font-semibold text-ink">Revenue</span>
                  <span className="text-sm font-semibold tabular-nums text-brand-green">
                    {formatCurrency(data.revenue)}
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {data.revenueAccounts.map((line) => (
                    <li
                      key={line.accountCode}
                      className="flex items-center justify-between text-sm text-ink-3"
                    >
                      <span className="truncate">
                        <span className="mr-2 font-mono text-xs text-ink-3">
                          {line.accountCode}
                        </span>
                        {line.name}
                      </span>
                      <span className="tabular-nums text-brand-green">
                        {formatCurrency(line.amount)}
                      </span>
                    </li>
                  ))}
                  {data.revenueAccounts.length === 0 && (
                    <li className="text-xs text-ink-3">No revenue accounts in this period.</li>
                  )}
                </ul>
              </section>

              <section className="space-y-1.5 border-t border-line-2 pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink-3">Cost of Goods Sold</span>
                  <span className="tabular-nums text-brand-crimson">- {formatCurrency(data.cogs)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-2 font-semibold text-ink">
                  <span>Gross Profit</span>
                  <span className="tabular-nums">{formatCurrency(data.grossProfit)}</span>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between border-b border-line-2 pb-2">
                  <span className="text-sm font-semibold text-ink">Expenses</span>
                  <span className="text-sm font-semibold tabular-nums text-brand-crimson">
                    {formatCurrency(data.expenses)}
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {data.expenseAccounts.map((line) => (
                    <li
                      key={line.accountCode}
                      className="flex items-center justify-between text-sm text-ink-3"
                    >
                      <span className="truncate">
                        <span className="mr-2 font-mono text-xs text-ink-3">
                          {line.accountCode}
                        </span>
                        {line.name}
                      </span>
                      <span className="tabular-nums">{formatCurrency(line.amount)}</span>
                    </li>
                  ))}
                  {data.expenseAccounts.length === 0 && (
                    <li className="text-xs text-ink-3">No expense accounts in this period.</li>
                  )}
                </ul>
              </section>

              <div
                className={cn(
                  'flex items-center justify-between rounded-2xl px-4 py-3',
                  netPositive ? 'bg-[#e3f2ec]' : 'bg-[#f9e4e7]',
                )}
              >
                <span
                  className={cn(
                    'text-sm font-semibold',
                    netPositive ? 'text-brand-green' : 'text-brand-crimson',
                  )}
                >
                  Net Profit
                </span>
                <span
                  className={cn(
                    'text-lg font-semibold tabular-nums',
                    netPositive ? 'text-brand-green' : 'text-brand-crimson',
                  )}
                >
                  {formatCurrency(data.netProfit)}
                </span>
              </div>
            </div>
          </Card>
        )
      }}
    </ReportSection>
  )
}

function VatReportTab({ range }: { range: string }) {
  return (
    <ReportSection<VatData> url={`/reports/vat-report?${range}`}>
      {(data) => (
        <Card>
          <CardHeader title="VAT Report" subtitle={periodLabel(data.from, data.to)} />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-line p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Sales</p>
              <dl className="mt-3 space-y-2 text-sm">
                <SummaryRow
                  label="Taxable Amount"
                  value={formatCurrency(data.sales.taxableAmount)}
                />
                <SummaryRow
                  label="Non-taxable Amount"
                  value={formatCurrency(data.sales.nonTaxableAmount)}
                />
                <SummaryRow
                  label="Output VAT"
                  value={formatCurrency(data.sales.outputVat)}
                  strong
                />
              </dl>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Purchases
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <SummaryRow
                  label="Taxable Amount"
                  value={formatCurrency(data.purchases.taxableAmount)}
                />
                <SummaryRow label="Input VAT" value={formatCurrency(data.purchases.inputVat)} strong />
              </dl>
            </div>
          </div>
          <div className="mx-5 mb-5 flex items-center justify-between rounded-2xl bg-line-2 px-4 py-3">
            <span className="text-sm font-semibold text-ink">Net VAT Payable</span>
            <span
              className={cn(
                'text-lg font-semibold tabular-nums',
                toNumber(data.netVatPayable) >= 0 ? 'text-ink' : 'text-brand-crimson',
              )}
            >
              {formatCurrency(data.netVatPayable)}
            </span>
          </div>
        </Card>
      )}
    </ReportSection>
  )
}

function StockValuationTab() {
  const columns: Column<StockValuationRow>[] = [
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-ink-3">{row.itemCode}</span>,
    },
    {
      header: 'Item',
      cell: (row) => <span className="font-medium text-ink">{row.name}</span>,
    },
    { header: 'Warehouse', cell: (row) => row.warehouse },
    {
      header: 'Quantity',
      align: 'right',
      cell: (row) => formatNumber(row.quantity, 2),
    },
    {
      header: 'Avg. Cost',
      align: 'right',
      cell: (row) => <span className="text-ink-3">{formatCurrency(row.averageCost)}</span>,
    },
    {
      header: 'Value',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-ink">{formatCurrency(row.value)}</span>
      ),
    },
  ]

  return (
    <ReportSection<StockValuationData>
      url="/reports/stock-valuation"
      emptyTitle="No stock on hand"
      emptyDescription="Stock balances will appear once items are received."
      isEmpty={(d) => d.data.length === 0}
    >
      {(data) => (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label="Total Stock Value"
              value={formatCurrency(data.totalValue)}
              hint="Average-cost valuation"
              icon={<Boxes size={18} />}
              tone="indigo"
            />
            <StatCard
              label="Total Quantity"
              value={formatNumber(data.totalQuantity, 2)}
              hint="Units across all warehouses"
              icon={<Package size={18} />}
              tone="slate"
            />
          </div>
          <Card>
            <CardHeader title="Stock Valuation" subtitle="By item and warehouse" />
            <DataTable columns={columns} rows={data.data} rowKey={(row) => row.itemId} />
          </Card>
        </>
      )}
    </ReportSection>
  )
}

function LowStockTab() {
  const columns: Column<LowStockRow>[] = [
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-ink-3">{row.itemCode}</span>,
    },
    {
      header: 'Item',
      cell: (row) => <span className="font-medium text-ink">{row.name}</span>,
    },
    {
      header: 'On Hand',
      align: 'right',
      cell: (row) => (
        <span className={toNumber(row.quantity) <= 0 ? 'font-semibold text-brand-crimson' : 'text-brand-amber'}>
          {formatNumber(row.quantity, 2)}
        </span>
      ),
    },
    {
      header: 'Reorder At',
      align: 'right',
      cell: (row) => formatNumber(row.reorderLevel, 2),
    },
    {
      header: 'Suggested Order',
      align: 'right',
      cell: (row) => <span className="font-semibold">{formatNumber(row.suggestedOrder, 2)}</span>,
    },
    {
      header: 'Stock Value',
      align: 'right',
      cell: (row) => formatCurrency(row.value),
    },
  ]

  return (
    <Card>
      <CardHeader
        title="Low Stock"
        subtitle="Active items at or below reorder level; quantities are combined across warehouses"
      />
      <ReportSection<{ data: LowStockRow[]; itemCount: number }>
        url="/reports/low-stock"
        emptyTitle="Stock levels look good"
        emptyDescription="No active items are at or below their reorder level."
        isEmpty={(data) => data.data.length === 0}
      >
        {(data) => <DataTable columns={columns} rows={data.data} rowKey={(row) => row.itemId} />}
      </ReportSection>
    </Card>
  )
}

function InventoryMovementsTab({ range }: { range: string }) {
  const columns: Column<InventoryMovementRow>[] = [
    {
      header: 'Date',
      cell: (row) => formatDateTime(row.createdAt),
    },
    {
      header: 'Movement',
      cell: (row) => (
        <Badge tone={toNumber(row.quantity) < 0 ? 'red' : 'green'}>
          {row.movementType.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      header: 'Item',
      cell: (row) => (
        <span className="font-medium text-ink">
          {row.item} <span className="font-mono text-xs text-ink-3">({row.itemCode})</span>
        </span>
      ),
    },
    { header: 'Warehouse', cell: (row) => row.warehouse },
    {
      header: 'Quantity',
      align: 'right',
      cell: (row) => (
        <span
          className={
            toNumber(row.quantity) < 0
              ? 'font-semibold text-brand-crimson'
              : 'font-semibold text-brand-green'
          }
        >
          {formatNumber(row.quantity, 2)}
        </span>
      ),
    },
    {
      header: 'Unit Cost',
      align: 'right',
      cell: (row) => (row.unitCost == null ? '—' : formatCurrency(row.unitCost)),
    },
    {
      header: 'Reference',
      cell: (row) => row.narration ?? row.referenceType ?? '—',
    },
  ]

  return (
    <Card>
      <CardHeader
        title="Stock Movements"
        subtitle="Inventory receipts, sales, returns, and adjustments"
      />
      <ReportSection<{ data: InventoryMovementRow[]; limit: number }>
        url={`/reports/inventory-movements?${range}`}
        emptyTitle="No stock movements"
        emptyDescription="No inventory movements were recorded for the selected period."
        isEmpty={(data) => data.data.length === 0}
      >
        {(data) => (
          <>
            <p className="px-5 py-3 text-xs text-ink-3">
              Showing up to the latest {formatNumber(data.limit)} movements in this date range.
            </p>
            <DataTable columns={columns} rows={data.data} rowKey={(row) => row.id} />
          </>
        )}
      </ReportSection>
    </Card>
  )
}

function DayBookSection<T>({
  title,
  subtitle,
  rows,
  columns,
  rowKey,
  emptyNote,
}: {
  title: string
  subtitle: string
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  emptyNote: string
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={
        <span className="text-xs text-ink-3">{rows.length} record(s)</span>
      } />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-3">{emptyNote}</p>
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={rowKey} />
      )}
    </Card>
  )
}

function DayBookTab({ date }: { date: string }) {
  const salesColumns: Column<DayBookInvoice>[] = [
    {
      header: 'Invoice',
      cell: (row) => <span className="font-medium text-ink">{row.invoiceNumber}</span>,
    },
    { header: 'Customer', cell: (row) => row.customer?.name ?? 'Walk-in' },
    {
      header: 'Status',
      cell: (row) => (
        <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{row.status.replace('_', ' ')}</Badge>
      ),
    },
    {
      header: 'Total',
      align: 'right',
      cell: (row) => <span className="font-medium">{formatCurrency(row.grandTotal)}</span>,
    },
    {
      header: 'Due',
      align: 'right',
      cell: (row) => (
        <span className={toNumber(row.outstandingAmount) > 0 ? 'text-brand-crimson' : 'text-ink-3'}>
          {formatCurrency(row.outstandingAmount)}
        </span>
      ),
    },
  ]

  const purchaseColumns: Column<DayBookInvoice>[] = [
    {
      header: 'Invoice',
      cell: (row) => <span className="font-medium text-ink">{row.invoiceNumber}</span>,
    },
    { header: 'Supplier', cell: (row) => row.supplier?.name ?? '—' },
    {
      header: 'Status',
      cell: (row) => (
        <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{row.status.replace('_', ' ')}</Badge>
      ),
    },
    {
      header: 'Total',
      align: 'right',
      cell: (row) => <span className="font-medium">{formatCurrency(row.grandTotal)}</span>,
    },
    {
      header: 'Due',
      align: 'right',
      cell: (row) => (
        <span className={toNumber(row.outstandingAmount) > 0 ? 'text-brand-crimson' : 'text-ink-3'}>
          {formatCurrency(row.outstandingAmount)}
        </span>
      ),
    },
  ]

  const paymentColumns: Column<DayBookPayment>[] = [
    {
      header: 'Payment',
      cell: (row) => <span className="font-medium text-ink">{row.paymentNumber}</span>,
    },
    {
      header: 'Party',
      cell: (row) => row.customer?.name ?? row.supplier?.name ?? '—',
    },
    { header: 'Method', cell: (row) => row.paymentMethod },
    {
      header: 'Amount',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-ink">{formatCurrency(row.amount)}</span>
      ),
    },
  ]

  const returnColumns: Column<DayBookReturn>[] = [
    {
      header: 'Return',
      cell: (row) => <span className="font-medium text-ink">{row.returnNumber}</span>,
    },
    { header: 'Customer', cell: (row) => row.customer?.name ?? 'Walk-in' },
    {
      header: 'Amount',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-brand-amber">{formatCurrency(row.totalAmount)}</span>
      ),
    },
  ]

  return (
    <ReportSection<DayBookData>
      url={`/reports/day-book?date=${date}`}
      emptyTitle="No activity"
      emptyDescription="Nothing was recorded on the selected date."
    >
      {(data) => (
        <div className="space-y-4">
          <DayBookSection
            title="Sales Invoices"
            subtitle={formatDate(data.date)}
            rows={data.salesInvoices}
            columns={salesColumns}
            rowKey={(row) => String(row.id)}
            emptyNote="No sales invoices were recorded on this date."
          />
          <DayBookSection
            title="Purchase Invoices"
            subtitle={formatDate(data.date)}
            rows={data.purchaseInvoices}
            columns={purchaseColumns}
            rowKey={(row) => String(row.id)}
            emptyNote="No purchase invoices were recorded on this date."
          />
          <DayBookSection
            title="Payments"
            subtitle={formatDate(data.date)}
            rows={data.payments}
            columns={paymentColumns}
            rowKey={(row) => String(row.id)}
            emptyNote="No payments were recorded on this date."
          />
          <DayBookSection
            title="Sales Returns"
            subtitle={formatDate(data.date)}
            rows={data.salesReturns}
            columns={returnColumns}
            rowKey={(row) => String(row.id)}
            emptyNote="No sales returns were recorded on this date."
          />
        </div>
      )}
    </ReportSection>
  )
}

function getVisibleReportTable(container: HTMLDivElement | null) {
  const table = container?.querySelector('table')
  if (table) {
    const columns = Array.from(table.querySelectorAll('thead th')).map((cell) =>
      (cell.textContent ?? '').trim(),
    )
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) =>
        (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
    )
    if (columns.length) return { columns, rows, html: table.outerHTML }
  }
  const details = container?.innerText.trim()
  if (!details) return null
  const escapeHtml = (value: string) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const rows = details.split(/\r?\n/).map((line) => [line.trim()]).filter(([line]) => line)
  const htmlRows = rows.map(([line]) => `<tr><td>${escapeHtml(line)}</td></tr>`).join('')
  return {
    columns: ['Report details'],
    rows,
    html: `<table><thead><tr><th>Report details</th></tr></thead><tbody>${htmlRows}</tbody></table>`,
  }
}

function downloadReportCsv(
  title: string,
  dateRange: string,
  report: ReturnType<typeof getVisibleReportTable>,
) {
  if (!report) {
    window.alert('There is no report table to export yet.')
    return
  }
  const escapeCell = (value: string) => {
    const safeValue = /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value
    return `"${safeValue.replaceAll('"', '""')}"`
  }
  const contents = [
    ['Company', 'Pyloom POS'],
    ['Report', title],
    ...(dateRange ? [['Date range', dateRange]] : []),
    ['Generated', new Date().toLocaleString()],
    [],
    report.columns,
    ...report.rows,
  ]
    .map((row) => row.map(escapeCell).join(','))
    .join('\r\n')
  const blob = new Blob(['\uFEFF', contents], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

interface WorkspaceReportResponse {
  data: Record<string, unknown>[]
  total: number
  page: number
  limit: number
  summary?: Record<string, unknown>
}

interface WorkspaceOptionResponse {
  data: { id: number; label: string }[]
}

function workspaceFilter(report: TabKey): { optionType: string; param: string; label: string } | null {
  if (['general-ledger', 'trial-balance', 'profit-loss', 'expense-report'].includes(report)) {
    return { optionType: 'accounts', param: 'accountId', label: 'Account' }
  }
  if (['sales-item-history', 'purchase-item-history', 'stock-ledger', 'stock-balance', 'stock-valuation', 'stock-movements', 'stock-ageing', 'item-profitability', 'purchase-by-item'].includes(report)) {
    return { optionType: 'items', param: 'itemId', label: 'Item' }
  }
  if (['cash-book', 'bank-book'].includes(report)) {
    return { optionType: 'accounts', param: 'accountId', label: 'Account' }
  }
  if (['customer-ledger', 'sales-by-customer', 'receivables'].includes(report)) {
    return { optionType: 'customers', param: 'partyId', label: 'Customer' }
  }
  if (['supplier-ledger', 'purchase-register', 'purchase-by-supplier', 'purchase-return-register', 'payables'].includes(report)) {
    return { optionType: 'suppliers', param: 'partyId', label: 'Supplier' }
  }
  if (['warehouse-stock', 'stock-balance', 'stock-valuation', 'stock-ledger', 'stock-movements', 'stock-ageing'].includes(report)) {
    return { optionType: 'warehouses', param: 'warehouseId', label: 'Warehouse' }
  }
  if (['discount-report', 'sales-by-cashier'].includes(report)) {
    return { optionType: 'cashiers', param: 'cashierId', label: 'Cashier' }
  }
  return null
}

function isMoneyColumn(key: string) {
  if (/count|items|invoices|quantity|days/i.test(key)) return false
  return /amount|revenue|discount|tax|paid|outstanding|debit|credit|balance|cost|profit|subtotal|collected|vat|cogs|total|price|assets|liabilities|equity|earnings/i.test(key)
}

function formatWorkspaceValue(key: string, value: unknown): ReactNode {
  if (value == null || value === '') return '—'
  if (key === 'date' || key.endsWith('Date')) return formatDate(String(value))
  if (key === 'status') {
    const status = String(value)
    return <Badge tone={STATUS_TONES[status] ?? 'slate'}>{status.replaceAll('_', ' ')}</Badge>
  }
  if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))) {
    return isMoneyColumn(key)
      ? formatCurrency(toNumber(value as Money))
      : formatNumber(toNumber(value as Money))
  }
  return String(value)
}

function WorkspaceReportTab({
  report,
  range,
  onQueryChange,
  refreshKey,
}: {
  report: TabKey
  range: string
  onQueryChange: (query: string) => void
  refreshKey: number
}) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [filterValue, setFilterValue] = useState('')
  const [warehouseValue, setWarehouseValue] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [sortKey, setSortKey] = useState('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const filter = useMemo(() => workspaceFilter(report), [report])
  const needsSelection = [
    'general-ledger', 'sales-item-history', 'purchase-item-history', 'stock-ledger',
    'customer-ledger', 'supplier-ledger',
  ].includes(report)
  const canLoad = !needsSelection || Boolean(filterValue)
  const options = useFetch<WorkspaceOptionResponse>(
    `/reports/workspace-options/${filter?.optionType ?? 'items'}`,
  )
  const warehouseOptions = useFetch<WorkspaceOptionResponse>('/reports/workspace-options/warehouses')
  const params = useMemo(() => {
    const query = new URLSearchParams(range)
    query.set('page', String(page))
    query.set('limit', String(limit))
    query.set('refresh', String(refreshKey))
    if (search.trim()) query.set('search', search.trim())
    if (filter && filterValue) query.set(filter.param, filterValue)
    if (warehouseValue) query.set('warehouseId', warehouseValue)
    if (paymentMethod) query.set('paymentMethod', paymentMethod)
    return query.toString()
  }, [filter, filterValue, limit, page, paymentMethod, range, refreshKey, search, warehouseValue])
  useEffect(() => onQueryChange(params), [onQueryChange, params])
  const { data, loading, error, reload } = useFetch<WorkspaceReportResponse>(
    `/reports/workspace/${report}?${params}`,
    canLoad,
  )
  const records = data?.data ?? []
  const keys = useMemo(() => {
    const first = records[0]
    return first
      ? Object.keys(first).filter((key) =>
          !['id', 'sortname', 'referenceType', 'referenceId'].includes(key),
        )
      : []
  }, [records])
  const columns = useMemo<Column<Record<string, unknown>>[]>(() =>
    keys.map((key) => ({
      header: key === 'date' ? 'Date' : key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()),
      align: isMoneyColumn(key) || /quantity|count|days/i.test(key) ? 'right' : 'left',
      className: 'whitespace-nowrap',
      sortKey: key,
      cell: (row) => {
        const value = row[key]
        if (key === 'reference' && typeof value === 'string' &&
          ['sales-item-history', 'sales-vat-register', 'purchase-item-history', 'purchase-register', 'purchase-vat-register'].includes(report)) {
          return (
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() => navigate(
                ['purchase-item-history', 'purchase-register', 'purchase-vat-register'].includes(report)
                  ? `/purchases?invoiceId=${encodeURIComponent(String(row.id))}`
                  : `/sales?invoiceId=${encodeURIComponent(String(row.id))}`,
              )}
            >
              {value}
            </button>
          )
        }
        if (['reference', 'voucherNumber'].includes(key) && typeof value === 'string' &&
          ['general-ledger', 'day-book'].includes(report) && row.referenceId) {
          const target = row.referenceType === 'sales_invoice'
            ? `/sales?invoiceId=${encodeURIComponent(String(row.referenceId))}`
            : row.referenceType === 'purchase_invoice'
              ? `/purchases?invoiceId=${encodeURIComponent(String(row.referenceId))}`
              : null
          if (target) {
            return (
              <button
                type="button"
                className="font-medium text-accent hover:underline"
                onClick={() => navigate(target)}
              >
                {value}
              </button>
            )
          }
        }
        return formatWorkspaceValue(key, value)
      },
    })), [keys, navigate, report])
  const sortedRecords = useMemo(() => {
    if (!sortKey) return records
    return [...records].sort((a, b) => {
      const left = a[sortKey]
      const right = b[sortKey]
      let comparison = 0
      if (typeof left === 'number' && typeof right === 'number') comparison = left - right
      else comparison = String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true })
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [records, sortDirection, sortKey])
  const metrics = Object.entries(data?.summary ?? {}).filter(
    ([, value]) => typeof value === 'number' && Number.isFinite(value),
  )
  function changeSort(key: string) {
    if (sortKey === key) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-line-2 px-4 py-4 sm:px-5">
        <Field label="Search report" className="min-w-[220px] flex-1">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search names, codes, references…"
          />
        </Field>
        {filter && (
          <Field label={filter.label} className="w-full sm:w-64">
            <Select
              value={filterValue}
              onChange={(event) => {
                setFilterValue(event.target.value)
                setPage(1)
              }}
            >
              <option value="">
                {needsSelection ? `Select ${filter.label.toLowerCase()}…` : `All ${filter.label.toLowerCase()}s`}
              </option>
              {(options.data?.data ?? []).map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </Select>
          </Field>
        )}
        {options.error && <span className="pb-2 text-xs text-brand-crimson">{options.error}</span>}
        {['warehouse-stock', 'stock-balance', 'stock-valuation', 'stock-movements', 'stock-ageing', 'stock-ledger'].includes(report) && (
            <Field label="Warehouse" className="w-full sm:w-56">
              <Select value={warehouseValue} onChange={(event) => setWarehouseValue(event.target.value)}>
                <option value="">All warehouses</option>
                {(warehouseOptions.data?.data ?? []).map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </Select>
            </Field>
          )}
        {warehouseOptions.error && ['warehouse-stock', 'stock-balance', 'stock-valuation', 'stock-movements', 'stock-ageing', 'stock-ledger'].includes(report) &&
          <span className="pb-2 text-xs text-brand-crimson">{warehouseOptions.error}</span>}
        {report === 'payment-collection' && (
          <Field label="Payment method" className="w-full sm:w-48">
            <Select value={paymentMethod} onChange={(event) => {
              setPaymentMethod(event.target.value)
              setPage(1)
            }}>
              <option value="">All methods</option>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="card">Card</option>
              <option value="digital_wallet">Digital wallet</option>
              <option value="qr">QR</option>
              <option value="customer_credit">Customer credit</option>
              <option value="split">Split</option>
            </Select>
          </Field>
        )}
        <Field label="Rows per page" className="w-28">
          <Select value={limit} onChange={(event) => {
            setLimit(Number(event.target.value))
            setPage(1)
          }}>
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </Select>
        </Field>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSearch('')
            setFilterValue('')
            setWarehouseValue('')
            setPaymentMethod('')
            setPage(1)
          }}
        >
          Clear
        </Button>
        {canLoad && <span className="pb-2 text-xs text-ink-3">{formatNumber(data?.total ?? 0)} records</span>}
      </div>
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-3 px-4 pt-4 sm:grid-cols-4 sm:px-5">
          {metrics.map(([key, value]) => (
            <ReportMetric
              key={key}
              label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}
              value={isMoneyColumn(key)
                ? formatCurrency(toNumber(value as Money))
                : formatNumber(toNumber(value as Money))}
            />
          ))}
        </div>
      )}
      {!canLoad ? (
        <EmptyState
          title={`Select ${filter?.label.toLowerCase() ?? 'a filter'}`}
          description="Choose a record above to load this report."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={sortedRecords}
          rowKey={(row) => String(row.id ?? JSON.stringify(row))}
          loading={loading}
          error={error}
          onRetry={reload}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={changeSort}
          emptyTitle="No report data found"
          emptyDescription="Try a different date range or clear the selected filters."
        />
      )}
      {canLoad && data && (
        <ReportPagination
          page={data.page}
          limit={data.limit}
          total={data.total}
          onPageChange={setPage}
        />
      )}
    </Card>
  )
}

function workspaceExportTable(records: Record<string, unknown>[]) {
  if (!records.length) return null
  const keys = Object.keys(records[0]).filter((key) =>
    !['id', 'sortname', 'referenceType', 'referenceId'].includes(key),
  )
  const columns = keys.map((key) =>
    key === 'date' ? 'Date' : key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()),
  )
  const rows = records.map((record) => keys.map((key) => {
    const value = record[key]
    if (value == null || value === '') return ''
    if (key === 'date' || key.endsWith('Date')) return formatDate(String(value))
    if (key === 'status') return String(value).replaceAll('_', ' ')
    if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))) {
      return isMoneyColumn(key)
        ? formatCurrency(toNumber(value as Money))
        : formatNumber(toNumber(value as Money))
    }
    return String(value)
  }))
  const escapeHtml = (value: string) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')
  const body = rows.map((row) =>
    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
  ).join('')
  return {
    columns,
    rows,
    html: `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`,
  }
}

function ReportActions({
  title,
  dateRange,
  tableRef,
  onRefresh,
  loadExport,
}: {
  title: string
  dateRange: string
  tableRef: RefObject<HTMLDivElement | null>
  onRefresh: () => void
  loadExport?: () => Promise<ReturnType<typeof getVisibleReportTable>>
}) {
  async function getExportData() {
    if (loadExport) return loadExport()
    return getVisibleReportTable(tableRef.current)
  }

  async function exportExcel() {
    const report = await getExportData()
    if (!report) {
      window.alert('There is no report table to export yet.')
      return
    }
    try {
      const { data } = await api.post<Blob>(
        '/reports/export/xlsx',
        { title, dateRange, columns: report.columns, rows: report.rows },
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Excel export failed.'
      window.alert(message)
    }
  }

  function printReport() {
    void getExportData().then((report) => {
      if (!report) {
        window.alert('There is no report table to print yet.')
        return
      }
      openPrintWindow(
        title,
        `<h1>${title}</h1><p class="muted">Pyloom POS${dateRange ? ` · ${dateRange}` : ''} · Generated ${new Date().toLocaleString()}</p>${report.html}`,
      )
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Print preparation failed.'
      window.alert(message)
    })
  }

  async function exportCsv() {
    try {
      downloadReportCsv(title, dateRange, await getExportData())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CSV export failed.'
      window.alert(message)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="Export Excel"
        aria-label="Export Excel"
        onClick={() => void exportExcel()}
        className="rounded-md p-2 text-ink-2 transition hover:bg-blue-50 hover:text-accent"
      >
        <FileSpreadsheet size={16} />
      </button>
      <button
        type="button"
        title="Export CSV"
        aria-label="Export CSV"
        onClick={() => void exportCsv()}
        className="rounded-md p-2 text-ink-2 transition hover:bg-blue-50 hover:text-accent"
      >
        <Download size={16} />
      </button>
      <button
        type="button"
        title="Print or save as PDF"
        aria-label="Print or save as PDF"
        onClick={printReport}
        className="rounded-md p-2 text-ink-2 transition hover:bg-blue-50 hover:text-accent"
      >
        <Printer size={16} />
      </button>
      <button
        type="button"
        title="Refresh report"
        aria-label="Refresh report"
        onClick={onRefresh}
        className="rounded-md p-2 text-ink-2 transition hover:bg-blue-50 hover:text-accent"
      >
        <RefreshCw size={16} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------
// Page
// ---------------------------------------------------------------

export function ReportsPage({ accountingOnly = false }: { accountingOnly?: boolean }) {
  const visibleReportGroups = accountingOnly
    ? REPORT_GROUPS.filter((group) => group.label === 'Finance')
    : REPORT_GROUPS.filter((group) => group.label !== 'Finance')
  const now = new Date()
  const defaultFrom = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
  const defaultTo = toISODate(now)

  const [tab, setTab] = useState<TabKey>(accountingOnly ? 'profit-loss' : 'summary')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [applied, setApplied] = useState({ from: defaultFrom, to: defaultTo })
  const [day, setDay] = useState(defaultTo)
  const [appliedDay, setAppliedDay] = useState(defaultTo)
  const [refreshKey, setRefreshKey] = useState(0)
  const [workspaceQuery, setWorkspaceQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState(() => visibleReportGroups.map((group) => group.label))
  const reportContentRef = useRef<HTMLDivElement>(null)

  const range = `from=${encodeURIComponent(applied.from)}&to=${encodeURIComponent(applied.to)}`
  const usesDateRange = ![
    'stock', 'stock-valuation', 'low-stock', 'receivables', 'payables',
    'stock-ageing', 'stock-balance', 'warehouse-stock',
  ].includes(tab)
  const activeGroup = visibleReportGroups.find((group) => group.items.some((item) => item.key === tab))
  const activeReport = activeGroup?.items.find((item) => item.key === tab)
  const exportDateRange = tab === 'daybook'
    ? formatDate(appliedDay)
    : usesDateRange ? periodLabel(applied.from, applied.to) : ''

  async function loadWorkspaceExport() {
    if (!WORKSPACE_TABS.includes(tab)) return null
    const query = new URLSearchParams(workspaceQuery)
    query.set('limit', '100')
    let page = 1
    let total = 0
    const records: Record<string, unknown>[] = []
    do {
      query.set('page', String(page))
      const response = await api.get<WorkspaceReportResponse>(
        `/reports/workspace/${tab}?${query.toString()}`,
      )
      total = response.data.total
      if (total > 50_000) {
        throw new Error('This export exceeds 50,000 rows. Narrow the report filters and try again.')
      }
      records.push(...response.data.data)
      page += 1
    } while (records.length < total)
    return workspaceExportTable(records)
  }

  function clearFilters() {
    setFrom(defaultFrom)
    setTo(defaultTo)
    setApplied({ from: defaultFrom, to: defaultTo })
  }

  function applyPreset(preset: 'today' | 'yesterday' | 'week' | 'month') {
    const dates = preset === 'yesterday'
      ? (() => {
          const yesterday = new Date()
          yesterday.setDate(yesterday.getDate() - 1)
          const date = toISODate(yesterday)
          return { from: date, to: date }
        })()
      : presetRange(preset)
    setFrom(dates.from)
    setTo(dates.to)
    setApplied(dates)
  }

  return (
    <div className="report-workspace grid min-w-0 gap-4 xl:grid-cols-[248px_minmax(0,1fr)]">
      <nav
        aria-label="Report sections"
        className="surface max-h-[34vh] overflow-y-auto rounded-xl p-2 xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:self-start"
      >
        <div className="mb-1 flex items-center justify-between px-2.5 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink">Reports</span>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            {formatNumber(visibleReportGroups.reduce((count, group) => count + group.items.length, 0))}
          </span>
        </div>
        {visibleReportGroups.map((group) => {
          const expanded = expandedGroups.includes(group.label)
          return (
            <section key={group.label} className="border-t border-line-2 py-1">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedGroups((current) =>
                  expanded
                    ? current.filter((label) => label !== group.label)
                    : [...current, group.label],
                )}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3 hover:bg-blue-50/70"
              >
                {group.label}
                <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} />
              </button>
              {expanded && (
                <div className="space-y-0.5 pb-1">
                  {group.items.map((item) => {
                    const active = tab === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                          setWorkspaceQuery('')
                          setTab(item.key)
                        }}
                        className={cn(
                          'flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
                          active
                            ? 'bg-blue-50 text-blue-700 shadow-[inset_2px_0_0_#0b6aba]'
                            : 'text-ink-2 hover:bg-line-2 hover:text-ink',
                        )}
                      >
                        <span className={cn('shrink-0', active ? 'text-accent' : 'text-ink-3')}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </nav>

      <div className="min-w-0 space-y-4">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-ink-3">
                <span>Reports</span>
                <span aria-hidden="true">/</span>
                <span>{activeGroup?.label}</span>
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {activeReport?.label ?? 'Reports'}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-ink-3">
                {REPORT_DESCRIPTIONS[tab]}
              </p>
            </div>
            <ReportActions
              title={activeReport?.label ?? 'Report'}
              dateRange={exportDateRange}
              tableRef={reportContentRef}
              onRefresh={() => setRefreshKey((key) => key + 1)}
              loadExport={WORKSPACE_TABS.includes(tab) ? loadWorkspaceExport : undefined}
            />
          </div>
          {usesDateRange && (
            <div className="border-t border-line-2 bg-blue-50/35 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-end gap-3">
                {tab === 'daybook' ? (
                  <>
                    <Field label="Date" className="w-full sm:w-44">
                      <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
                    </Field>
                    <Button onClick={() => setAppliedDay(day)}>Apply</Button>
                    <Button variant="outline" onClick={() => {
                      setDay(defaultTo)
                      setAppliedDay(defaultTo)
                    }}>Today</Button>
                  </>
                ) : (
                  <>
                    <Field label="From date" className="w-full sm:w-44">
                      <Input
                        type="date"
                        value={from}
                        max={to || undefined}
                        onChange={(event) => setFrom(event.target.value)}
                      />
                    </Field>
                    <Field label="To date" className="w-full sm:w-44">
                      <Input
                        type="date"
                        value={to}
                        min={from || undefined}
                        onChange={(event) => setTo(event.target.value)}
                      />
                    </Field>
                    <DateRangePresets
                      from={from}
                      to={to}
                      onPick={(dates) => {
                        setFrom(dates.from)
                        setTo(dates.to)
                        setApplied(dates)
                      }}
                      className="mb-0.5"
                    />
                    <Button onClick={() => setApplied({ from: from || defaultFrom, to: to || defaultTo })}>
                      Apply
                    </Button>
                    <Button variant="outline" onClick={clearFilters}>Clear</Button>
                    <div className="ml-auto flex gap-1">
                      <button type="button" className="rounded-md px-2 py-1.5 text-xs text-ink-3 hover:bg-white hover:text-accent" onClick={() => applyPreset('yesterday')}>Yesterday</button>
                      <button type="button" className="rounded-md px-2 py-1.5 text-xs text-ink-3 hover:bg-white hover:text-accent" onClick={() => applyPreset('today')}>Today</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </Card>

        <div ref={reportContentRef} className="min-w-0 space-y-4">
          {tab === 'summary' && <SalesSummaryTab key={refreshKey} range={range} />}
          {tab === 'sales-register' && <SalesRegisterTab key={refreshKey} range={range} />}
          {tab === 'by-item' && <SalesByItemTab key={refreshKey} range={range} />}
          {tab === 'by-category' && <SalesByCategoryTab key={refreshKey} range={range} />}
          {tab === 'by-customer' && <SalesByCustomerTab key={refreshKey} range={range} />}
          {tab === 'by-cashier' && <SalesByCashierTab key={refreshKey} range={range} />}
          {tab === 'sales-returns' && <SalesReturnRegisterTab key={refreshKey} range={range} />}
          {tab === 'purchases' && <PurchaseSummaryTab key={refreshKey} range={range} />}
          {tab === 'pl' && <ProfitLossTab key={refreshKey} range={range} />}
          {tab === 'vat' && <VatReportTab key={refreshKey} range={range} />}
          {tab === 'stock' && <StockValuationTab key={refreshKey} />}
          {tab === 'low-stock' && <LowStockTab key={refreshKey} />}
          {tab === 'movements' && <InventoryMovementsTab key={refreshKey} range={range} />}
          {tab === 'daybook' && <DayBookTab key={refreshKey} date={appliedDay} />}
          {WORKSPACE_TABS.includes(tab) && (
            <WorkspaceReportTab
              key={tab}
              report={tab}
              range={range}
              onQueryChange={setWorkspaceQuery}
              refreshKey={refreshKey}
            />
          )}
        </div>
      </div>
    </div>
  )
}
