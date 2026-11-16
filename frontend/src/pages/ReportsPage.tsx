import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  FolderTree,
  Package,
  Percent,
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
import { Field, Input } from '@/components/ui/Input'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { cn, formatCurrency, formatDate, formatDateTime, formatNumber, toNumber } from '@/lib/utils'

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
  quantity: Money
  revenue: Money
  tax: Money
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

interface LedgerRow {
  customerId?: number
  supplierId?: number
  customerCode?: string | null
  supplierCode?: string | null
  name: string
  phone: string | null
  outstanding: Money
  invoiceCount: number
}

interface LedgerData {
  data: LedgerRow[]
  total: Money
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
  | 'by-item'
  | 'by-category'
  | 'by-customer'
  | 'by-cashier'
  | 'purchases'
  | 'pl'
  | 'vat'
  | 'stock'
  | 'low-stock'
  | 'movements'
  | 'receivables'
  | 'payables'
  | 'daybook'

const REPORT_GROUPS: { label: string; items: { key: TabKey; label: string; icon: ReactNode }[] }[] = [
  {
    label: 'Sales',
    items: [
      { key: 'summary', label: 'Sales Summary', icon: <BarChart3 size={15} /> },
      { key: 'by-item', label: 'Sales by Item', icon: <Package size={15} /> },
      { key: 'by-category', label: 'Sales by Category', icon: <FolderTree size={15} /> },
      { key: 'by-customer', label: 'Sales by Customer', icon: <UsersRound size={15} /> },
      { key: 'by-cashier', label: 'Sales by Cashier', icon: <UserRound size={15} /> },
    ],
  },
  {
    label: 'Buying',
    items: [{ key: 'purchases', label: 'Purchases', icon: <ShoppingCart size={15} /> }],
  },
  {
    label: 'Finance',
    items: [
      { key: 'pl', label: 'Profit & Loss', icon: <TrendingUp size={15} /> },
      { key: 'vat', label: 'VAT Report', icon: <Percent size={15} /> },
      { key: 'receivables', label: 'Receivables', icon: <ArrowDownLeft size={15} /> },
      { key: 'payables', label: 'Payables', icon: <ArrowUpRight size={15} /> },
      { key: 'daybook', label: 'Day Book', icon: <CalendarDays size={15} /> },
    ],
  },
  {
    label: 'Stock',
    items: [
      { key: 'stock', label: 'Stock Valuation', icon: <Boxes size={15} /> },
      { key: 'low-stock', label: 'Low Stock', icon: <AlertTriangle size={15} /> },
      { key: 'movements', label: 'Stock Movements', icon: <Activity size={15} /> },
    ],
  },
]

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

function SalesByItemTab({ range }: { range: string }) {
  const columns: Column<SalesByItemRow>[] = [
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-ink-3">{row.itemCode}</span>,
    },
    {
      header: 'Item',
      cell: (row) => <span className="font-medium text-ink">{row.name}</span>,
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
    {
      header: 'Tax',
      align: 'right',
      cell: (row) => <span className="text-ink-3">{formatCurrency(row.tax)}</span>,
    },
  ]

  return (
    <Card>
      <CardHeader title="Sales by Item" subtitle="Revenue grouped by product" />
      <ReportSection<{ data: SalesByItemRow[] }>
        url={`/reports/sales-by-item?${range}`}
        emptyTitle="No item sales"
        emptyDescription="No confirmed sales were recorded for the selected period."
        isEmpty={(d) => d.data.length === 0}
      >
        {(d) => <DataTable columns={columns} rows={d.data} rowKey={(row) => row.itemId} />}
      </ReportSection>
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

function ReceivablesTab() {
  const columns: Column<LedgerRow>[] = [
    {
      header: 'Code',
      cell: (row) => (
        <span className="font-mono text-xs text-ink-3">{row.customerCode ?? '—'}</span>
      ),
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
      header: 'Outstanding',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-brand-crimson">{formatCurrency(row.outstanding)}</span>
      ),
    },
  ]

  return (
    <ReportSection<LedgerData>
      url="/reports/receivables"
      emptyTitle="No receivables"
      emptyDescription="Every customer invoice has been fully settled."
      isEmpty={(d) => d.data.length === 0}
    >
      {(data) => (
        <Card>
          <CardHeader
            title="Receivables"
            subtitle="Outstanding balances owed by customers"
            action={
              <span className="text-sm font-semibold text-ink">
                {formatCurrency(data.total)}
              </span>
            }
          />
          <DataTable
            columns={columns}
            rows={data.data}
            rowKey={(row) => row.customerId ?? row.name}
          />
        </Card>
      )}
    </ReportSection>
  )
}

function PayablesTab() {
  const columns: Column<LedgerRow>[] = [
    {
      header: 'Code',
      cell: (row) => (
        <span className="font-mono text-xs text-ink-3">{row.supplierCode ?? '—'}</span>
      ),
    },
    {
      header: 'Supplier',
      cell: (row) => <span className="font-medium text-ink">{row.name}</span>,
    },
    { header: 'Phone', cell: (row) => row.phone ?? '—' },
    {
      header: 'Invoices',
      align: 'right',
      cell: (row) => formatNumber(row.invoiceCount),
    },
    {
      header: 'Outstanding',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-brand-amber">{formatCurrency(row.outstanding)}</span>
      ),
    },
  ]

  return (
    <ReportSection<LedgerData>
      url="/reports/payables"
      emptyTitle="No payables"
      emptyDescription="Every supplier invoice has been fully settled."
      isEmpty={(d) => d.data.length === 0}
    >
      {(data) => (
        <Card>
          <CardHeader
            title="Payables"
            subtitle="Outstanding balances owed to suppliers"
            action={
              <span className="text-sm font-semibold text-ink">
                {formatCurrency(data.total)}
              </span>
            }
          />
          <DataTable
            columns={columns}
            rows={data.data}
            rowKey={(row) => row.supplierId ?? row.name}
          />
        </Card>
      )}
    </ReportSection>
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

// ---------------------------------------------------------------
// Page
// ---------------------------------------------------------------

export function ReportsPage() {
  const now = new Date()
  const defaultFrom = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
  const defaultTo = toISODate(now)

  const [tab, setTab] = useState<TabKey>('summary')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [applied, setApplied] = useState({ from: defaultFrom, to: defaultTo })
  const [day, setDay] = useState(defaultTo)
  const [appliedDay, setAppliedDay] = useState(defaultTo)

  const range = `from=${applied.from}&to=${applied.to}`
  const usesDateRange = !['stock', 'low-stock', 'receivables', 'payables'].includes(tab)

  function clearFilters() {
    setFrom(defaultFrom)
    setTo(defaultTo)
    setApplied({ from: defaultFrom, to: defaultTo })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[236px_minmax(0,1fr)]">
      <nav
        aria-label="Report sections"
        className="surface space-y-2 rounded-xl p-2 lg:sticky lg:top-4 lg:self-start"
      >
        {REPORT_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = tab === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setTab(item.key)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors',
                      active
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-ink-2 hover:bg-line-2 hover:text-ink',
                    )}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="min-w-0 space-y-4">
      {usesDateRange && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            {tab === 'daybook' ? (
              <>
                <Field label="Date" className="w-48">
                  <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
                </Field>
                <Button onClick={() => setAppliedDay(day)}>Apply</Button>
                <Button variant="outline" onClick={() => setAppliedDay(defaultTo)}>
                  Today
                </Button>
              </>
            ) : (
              <>
                <Field label="From" className="w-48">
                  <Input
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </Field>
                <Field label="To" className="w-48">
                  <Input
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </Field>
                <Button onClick={() => setApplied({ from: from || defaultFrom, to: to || defaultTo })}>
                  Apply
                </Button>
                <Button variant="outline" onClick={clearFilters}>
                  Clear
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {tab === 'summary' && <SalesSummaryTab range={range} />}
      {tab === 'by-item' && <SalesByItemTab range={range} />}
      {tab === 'by-category' && <SalesByCategoryTab range={range} />}
      {tab === 'by-customer' && <SalesByCustomerTab range={range} />}
      {tab === 'by-cashier' && <SalesByCashierTab range={range} />}
      {tab === 'purchases' && <PurchaseSummaryTab range={range} />}
      {tab === 'pl' && <ProfitLossTab range={range} />}
      {tab === 'vat' && <VatReportTab range={range} />}
      {tab === 'stock' && <StockValuationTab />}
      {tab === 'low-stock' && <LowStockTab />}
      {tab === 'movements' && <InventoryMovementsTab range={range} />}
      {tab === 'receivables' && <ReceivablesTab />}
      {tab === 'payables' && <PayablesTab />}
      {tab === 'daybook' && <DayBookTab date={appliedDay} />}
      </div>
    </div>
  )
}
