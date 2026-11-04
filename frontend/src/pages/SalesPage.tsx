import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Eye,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, StatCard } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  openPrintWindow,
  toNumber,
} from '@/lib/utils'
import type { Customer, Paginated } from '@/types'

type BadgeTone = 'green' | 'red' | 'amber' | 'slate' | 'indigo'

const STATUS_TONES: Record<string, BadgeTone> = {
  confirmed: 'green',
  cancelled: 'red',
  returned: 'amber',
  draft: 'slate',
}

interface InvoiceRow {
  id: string | number
  invoiceNumber: string
  invoiceDate: string
  grandTotal: string
  paidAmount: string
  outstandingAmount: string
  status: string
  customer: { id: number; name: string; phone: string | null } | null
}

interface InvoiceLineItem {
  id: string | number
  itemId: number
  quantity: string
  unitPrice: string
  discountAmount: string
  taxAmount: string
  lineTotal: string
  item: {
    id: number
    name: string
    itemCode: string
    unit: { id: number; name: string; abbreviation: string | null } | null
  } | null
}

interface PaymentAllocationRow {
  id: string | number
  allocatedAmount: string
  payment: {
    paymentMethod: string
    amount: string
    paymentNumber: string
    paymentDate: string
  } | null
}

interface InvoiceDetail extends InvoiceRow {
  subtotal: string
  discountAmount: string
  taxableAmount: string
  taxAmount: string
  nonTaxableAmount: string
  isCredit: boolean
  dueDate: string | null
  notes: string | null
  createdAt: string
  cashier: { id: number; fullName: string } | null
  items: InvoiceLineItem[]
  paymentAllocations?: PaymentAllocationRow[]
}

interface Filters {
  from: string
  to: string
  status: string
  customer: string
  search: string
}

const todayIso = new Date().toISOString().slice(0, 10)
const monthStartIso = `${todayIso.slice(0, 7)}-01`

const DEFAULT_FILTERS: Filters = {
  from: monthStartIso,
  to: todayIso,
  status: '',
  customer: '',
  search: '',
}

export function SalesPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS)

  const [openId, setOpenId] = useState<string | number | null>(null)
  const [detail, setDetail] = useState<InvoiceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('from', applied.from)
    params.set('to', applied.to)
    if (applied.status) params.set('status', applied.status)
    if (applied.customer) params.set('customer', applied.customer)
    if (applied.search) params.set('search', applied.search)
    params.set('page', '1')
    params.set('limit', '50')
    return params.toString()
  }, [applied])

  const { data, loading, error, reload } = useFetch<Paginated<InvoiceRow>>(`/sales?${query}`)
  const { data: customers } = useFetch<Paginated<Customer>>('/customers?limit=100')

  const rows = data?.data ?? []
  const invoiceCount = data?.total ?? rows.length

  const totals = useMemo(() => {
    let totalSales = 0
    let totalOutstanding = 0
    for (const row of rows) {
      totalSales += toNumber(row.grandTotal)
      totalOutstanding += toNumber(row.outstandingAmount)
    }
    return { totalSales, totalOutstanding }
  }, [rows])

  function updateFilter<K extends keyof Filters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
    setApplied(DEFAULT_FILTERS)
  }

  async function openDetail(id: string | number) {
    setOpenId(id)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const { data: full } = await api.get<InvoiceDetail>(`/sales/${id}`)
      setDetail(full)
    } catch (err) {
      setDetailError(getErrorMessage(err))
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setOpenId(null)
    setDetail(null)
    setDetailError(null)
  }

  function goToReturn() {
    if (!detail) return
    const invoiceNumber = detail.invoiceNumber
    closeDetail()
    navigate(`/returns?invoice=${encodeURIComponent(invoiceNumber)}`)
  }

  function reprintInvoice() {
    if (!detail) return
    const storeName = 'Pyloom POS'
    const lines = detail.items
      .map((line) => {
        const unit = line.item?.unit?.abbreviation ?? line.item?.unit?.name ?? ''
        return `<tr>
          <td>${line.item?.name ?? `Item #${line.itemId}`}${line.item?.itemCode ? ` (${line.item.itemCode})` : ''}</td>
          <td class="num">${formatNumber(line.quantity, 2)}${unit ? ` ${unit}` : ''}</td>
          <td class="num">${formatCurrency(line.unitPrice)}</td>
          <td class="num">${formatCurrency(line.taxAmount)}</td>
          <td class="num">${formatCurrency(line.lineTotal)}</td>
        </tr>`
      })
      .join('')
    const payments = (detail.paymentAllocations ?? [])
      .map((allocation) => {
        const method = allocation.payment?.paymentMethod?.replace('_', ' ') ?? 'payment'
        const amount = allocation.payment?.amount ?? allocation.allocatedAmount
        return `<tr><td>Paid via ${method}</td><td class="num">${formatCurrency(amount)}</td></tr>`
      })
      .join('')
    const html = `
      <h1>Sales Invoice — ${detail.invoiceNumber}</h1>
      <p class="muted">
        ${storeName} · ${formatDate(detail.invoiceDate)}<br />
        Customer: ${detail.customer?.name ?? 'Walk-in'}${detail.customer?.phone ? ` · ${detail.customer.phone}` : ''}<br />
        Cashier: ${detail.cashier?.fullName ?? '—'} · Status: ${detail.status.replace('_', ' ')}
      </p>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Tax</th><th class="num">Total</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>
      <table style="margin-top:12px; width:320px; margin-left:auto; border:none;">
        <tbody>
          <tr><td style="border:none;">Subtotal</td><td class="num" style="border:none;">${formatCurrency(detail.subtotal)}</td></tr>
          <tr><td style="border:none;">Discount</td><td class="num" style="border:none;">- ${formatCurrency(detail.discountAmount)}</td></tr>
          <tr><td style="border:none;">VAT</td><td class="num" style="border:none;">${formatCurrency(detail.taxAmount)}</td></tr>
          <tr><td style="border:none; font-weight:700;">Grand Total</td><td class="num" style="border:none; font-weight:700;">${formatCurrency(detail.grandTotal)}</td></tr>
          <tr><td style="border:none;">Paid</td><td class="num" style="border:none;">${formatCurrency(detail.paidAmount)}</td></tr>
          <tr><td style="border:none;">Outstanding</td><td class="num" style="border:none;">${formatCurrency(detail.outstandingAmount)}</td></tr>
          ${payments}
        </tbody>
      </table>
      ${detail.notes ? `<p class="muted">Note: ${detail.notes}</p>` : ''}
    `
    openPrintWindow(`Invoice ${detail.invoiceNumber}`, html)
  }

  const columns: Column<InvoiceRow>[] = [
    {
      header: 'Invoice #',
      cell: (row) => <span className="font-medium text-slate-800">{row.invoiceNumber}</span>,
    },
    { header: 'Date', cell: (row) => formatDate(row.invoiceDate) },
    { header: 'Customer', cell: (row) => row.customer?.name ?? 'Walk-in' },
    {
      header: 'Total',
      align: 'right',
      cell: (row) => <span className="font-medium text-slate-800">{formatCurrency(row.grandTotal)}</span>,
    },
    {
      header: 'Paid',
      align: 'right',
      cell: (row) => <span className="text-slate-600">{formatCurrency(row.paidAmount)}</span>,
    },
    {
      header: 'Outstanding',
      align: 'right',
      cell: (row) => (
        <span className={toNumber(row.outstandingAmount) > 0 ? 'font-medium text-red-600' : 'text-slate-400'}>
          {formatCurrency(row.outstandingAmount)}
        </span>
      ),
    },
    {
      header: 'Status',
      align: 'center',
      cell: (row) => (
        <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>
          {row.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          icon={<Eye size={14} />}
          onClick={() => void openDetail(row.id)}
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Invoices"
          value={formatNumber(invoiceCount)}
          hint="In the selected range"
          icon={<Receipt size={18} />}
          tone="indigo"
        />
        <StatCard
          label="Total Sales"
          value={formatCurrency(totals.totalSales)}
          hint={`Across ${formatNumber(rows.length)} loaded invoice${rows.length === 1 ? '' : 's'}`}
          icon={<Wallet size={18} />}
          tone="emerald"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(totals.totalOutstanding)}
          hint="Unpaid balance on loaded invoices"
          icon={<AlertTriangle size={18} />}
          tone="amber"
        />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field
            label="Search invoice / customer"
            className="sm:col-span-2"
            hint="Type a bill number or customer name"
          >
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                className="pl-9"
                placeholder="e.g. SALES-INV-00012 or Ram Bahadur"
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setApplied(filters)
                  }
                }}
              />
            </div>
          </Field>
          <Field label="From">
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => updateFilter('from', e.target.value)}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => updateFilter('to', e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
              <option value="">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="returned">Returned</option>
              <option value="draft">Draft</option>
            </Select>
          </Field>
          <Field label="Customer">
            <Select
              value={filters.customer}
              onChange={(e) => updateFilter('customer', e.target.value)}
            >
              <option value="">All customers</option>
              {(customers?.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
            <Button icon={<Search size={16} />} onClick={() => setApplied(filters)}>
              Search
            </Button>
            <Button variant="outline" icon={<RotateCcw size={14} />} onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No invoices found"
          emptyDescription="Adjust the filters or record a new sale at the point of sale."
        />
      </Card>

      <Modal
        open={openId !== null}
        title={detail ? `Invoice ${detail.invoiceNumber}` : 'Invoice'}
        size="lg"
        onClose={closeDetail}
        footer={
          <>
            <Button variant="outline" onClick={closeDetail}>
              Close
            </Button>
            {detail && (
              <Button variant="outline" icon={<Printer size={16} />} onClick={reprintInvoice}>
                Reprint
              </Button>
            )}
            {detail && detail.status === 'confirmed' && (
              <Button variant="danger" icon={<RotateCcw size={16} />} onClick={goToReturn}>
                Return
              </Button>
            )}
          </>
        }
      >
        {detailLoading && <Spinner label="Loading invoice…" />}

        {detailError && !detail && (
          <ErrorState
            message={detailError}
            onRetry={() => {
              if (openId !== null) void openDetail(openId)
            }}
          />
        )}

        {detail && (
          <div className="space-y-5">
            {detailError && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{detailError}</div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Customer</dt>
                  <dd className="text-right font-medium text-slate-800">
                    {detail.customer?.name ?? 'Walk-in'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="text-right text-slate-700">{detail.customer?.phone ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Cashier</dt>
                  <dd className="text-right text-slate-700">{detail.cashier?.fullName ?? '—'}</dd>
                </div>
              </dl>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Invoice date</dt>
                  <dd className="text-right text-slate-700">{formatDate(detail.invoiceDate)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Due date</dt>
                  <dd className="text-right text-slate-700">{formatDate(detail.dueDate)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="text-right">
                    <Badge tone={STATUS_TONES[detail.status] ?? 'slate'}>
                      {detail.status.replace('_', ' ')}
                    </Badge>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Item
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Qty
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Unit price
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Discount
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tax
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Line total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.items.map((line) => {
                    const unit = line.item?.unit?.abbreviation ?? line.item?.unit?.name
                    return (
                      <tr key={line.id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-800">
                            {line.item?.name ?? `Item #${line.itemId}`}
                          </p>
                          {line.item?.itemCode && (
                            <p className="font-mono text-[11px] text-slate-400">
                              {line.item.itemCode}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {formatNumber(line.quantity, 2)}
                          {unit ? <span className="ml-1 text-xs text-slate-400">{unit}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {formatCurrency(line.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {formatCurrency(line.discountAmount)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {formatCurrency(line.taxAmount)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">
                          {formatCurrency(line.lineTotal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
              <dl className="w-full space-y-1.5 text-sm sm:max-w-xs">
                <div className="flex justify-between text-slate-500">
                  <dt>Subtotal</dt>
                  <dd>{formatCurrency(detail.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-slate-500">
                  <dt>Discount</dt>
                  <dd>- {formatCurrency(detail.discountAmount)}</dd>
                </div>
                <div className="flex justify-between text-slate-500">
                  <dt>Taxable</dt>
                  <dd>{formatCurrency(detail.taxableAmount)}</dd>
                </div>
                <div className="flex justify-between text-slate-500">
                  <dt>Non-taxable</dt>
                  <dd>{formatCurrency(detail.nonTaxableAmount)}</dd>
                </div>
                <div className="flex justify-between text-slate-500">
                  <dt>VAT</dt>
                  <dd>{formatCurrency(detail.taxAmount)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold text-slate-900">
                  <dt>Grand Total</dt>
                  <dd>{formatCurrency(detail.grandTotal)}</dd>
                </div>
                <div className="flex justify-between text-slate-500">
                  <dt>Paid</dt>
                  <dd>{formatCurrency(detail.paidAmount)}</dd>
                </div>
                <div
                  className={
                    toNumber(detail.outstandingAmount) > 0
                      ? 'flex justify-between font-medium text-red-600'
                      : 'flex justify-between text-slate-500'
                  }
                >
                  <dt>Outstanding</dt>
                  <dd>{formatCurrency(detail.outstandingAmount)}</dd>
                </div>
              </dl>
            </div>

            {detail.paymentAllocations && detail.paymentAllocations.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Payments
                </p>
                <ul className="space-y-1.5 text-sm">
                  {detail.paymentAllocations.map((allocation) => (
                    <li key={allocation.id} className="flex justify-between">
                      <span className="capitalize text-slate-600">
                        {(allocation.payment?.paymentMethod ?? 'payment').replace('_', ' ')}
                        {allocation.payment?.paymentNumber ? (
                          <span className="ml-1 text-xs text-slate-400">
                            {allocation.payment.paymentNumber}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-medium text-slate-800">
                        {formatCurrency(allocation.payment?.amount ?? allocation.allocatedAmount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.notes && (
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {detail.notes}
              </div>
            )}

            <p className="text-[11px] text-slate-400">Created {formatDateTime(detail.createdAt)}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
