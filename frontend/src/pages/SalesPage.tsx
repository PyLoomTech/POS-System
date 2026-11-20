import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Eye,
  Mail,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/Card'
import { FeedList, initials } from '@/components/ui/FeedList'
import type { FeedColumn } from '@/components/ui/FeedList'
import { Field, Input, Select } from '@/components/ui/Input'
import { DateRangePresets } from '@/components/ui/DateRangePresets'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import {
  formatCurrency as formatCurrencyBase,
  formatDate,
  formatDateTime,
  formatNumber,
  getPriceListDisplayName,
  openPrintWindow,
  toNumber,
} from '@/lib/utils'
import type { CompanySettings, Customer, Paginated } from '@/types'

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
  priceList?: { id: number; name: string } | null
  unit?: { id: number; name: string; abbreviation: string | null } | null
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
  emailNotificationStatus?: 'pending' | 'sent' | 'skipped' | 'not_configured' | 'failed'
  emailSentAt?: string | null
  emailNotificationError?: string | null
  emailNotification?: {
    status: 'sent' | 'skipped' | 'not_configured' | 'failed'
    message: string
    email?: string
  }
  customer: { id: number; name: string; phone: string | null; email: string | null } | null
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const { data: company } = useFetch<CompanySettings>('/settings/company')
  const formatCurrency = (value: unknown) => formatCurrencyBase(value, company)

  const [openId, setOpenId] = useState<string | number | null>(null)
  const [detail, setDetail] = useState<InvoiceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [emailSending, setEmailSending] = useState(false)
  const [emailActionError, setEmailActionError] = useState<string | null>(null)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('from', filters.from)
    params.set('to', filters.to)
    if (filters.status) params.set('status', filters.status)
    if (filters.customer) params.set('customer', filters.customer)
    if (filters.search) params.set('search', filters.search)
    params.set('page', '1')
    params.set('limit', '50')
    return params.toString()
  }, [filters])

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
  }

  async function openDetail(id: string | number) {
    setOpenId(id)
    setDetail(null)
    setDetailError(null)
    setEmailActionError(null)
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

  async function resendInvoiceEmail() {
    if (!detail) return
    setEmailSending(true)
    setEmailActionError(null)
    try {
      const { data: result } = await api.post<Pick<InvoiceDetail,
        'emailNotificationStatus' | 'emailSentAt' | 'emailNotificationError' | 'emailNotification'
      >>(`/sales/${detail.id}/email`)
      setDetail((current) => current ? { ...current, ...result } : null)
    } catch (err) {
      setEmailActionError(getErrorMessage(err))
    } finally {
      setEmailSending(false)
    }
  }

  useEffect(() => {
    const invoiceId = searchParams.get('invoiceId')
    if (invoiceId) void openDetail(invoiceId)
  }, [searchParams])

  function closeDetail() {
    setOpenId(null)
    setDetail(null)
    setDetailError(null)
    setEmailActionError(null)
    if (searchParams.has('invoiceId')) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('invoiceId')
      setSearchParams(nextParams, { replace: true })
    }
  }

  function goToReturn() {
    if (!detail) return
    const invoiceNumber = detail.invoiceNumber
    closeDetail()
    navigate(`/returns?invoice=${encodeURIComponent(invoiceNumber)}`)
  }

  function reprintInvoice() {
    if (!detail) return
    const storeName = company?.tradingName || company?.companyName || 'Pyloom POS'
    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character)
    const logo = company?.invoiceLogo || company?.companyLogo
    const companyInfo = [
      company?.addressLine1,
      company?.addressLine2,
      [company?.city, company?.stateProvince, company?.country].filter(Boolean).join(', '),
      [company?.phone, company?.email, company?.website].filter(Boolean).join(' · '),
      company?.panVatNumber ? `PAN/VAT: ${company.panVatNumber}` : '',
    ].filter((line): line is string => Boolean(line))
    const companyHeader = `
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" style="display:block;max-height:64px;max-width:220px;object-fit:contain;margin:0 auto 10px;" />` : ''}
      <h2 style="margin:0 0 4px;text-align:center;">${escapeHtml(storeName)}</h2>
      ${companyInfo.map((line) => `<div class="muted" style="text-align:center;">${escapeHtml(line)}</div>`).join('')}
    `
    const lines = detail.items
      .map((line) => {
        const unit =
          line.unit?.abbreviation ?? line.unit?.name ??
          line.item?.unit?.abbreviation ?? line.item?.unit?.name ?? ''
        const displayPriceListName = getPriceListDisplayName(
          line.priceList?.name,
          `${line.unit?.name ?? ''} ${line.unit?.abbreviation ?? ''}`,
        )
        return `<tr>
          <td>${line.item?.name ?? `Item #${line.itemId}`}${displayPriceListName ? ` (${displayPriceListName})` : ''}${line.item?.itemCode ? ` (${line.item.itemCode})` : ''}</td>
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
      ${companyHeader}
      <h1>Sales Invoice — ${detail.invoiceNumber}</h1>
      <p class="muted">
        ${formatDate(detail.invoiceDate)}<br />
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

  const columns: FeedColumn<InvoiceRow>[] = [
    {
      header: 'Total',
      width: '130px',
      align: 'right',
      cell: (row) => <span className="fv font-semibold text-ink">{formatCurrency(row.grandTotal)}</span>,
    },
    {
      header: 'Paid',
      width: '130px',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="fv">{formatCurrency(row.paidAmount)}</span>,
    },
    {
      header: 'Outstanding',
      width: '140px',
      align: 'right',
      cell: (row) => (
        <span
          className={
            toNumber(row.outstandingAmount) > 0
              ? 'fv font-medium text-brand-crimson'
              : 'fv text-ink-3'
          }
        >
          {formatCurrency(row.outstandingAmount)}
        </span>
      ),
    },
    {
      header: 'Status',
      width: '120px',
      align: 'center',
      cell: (row) => (
        <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{row.status.replace('_', ' ')}</Badge>
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

      <FeedList
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        lead={(row) => initials(row.customer?.name ?? 'Walk-in')}
        title={(row) => row.invoiceNumber}
        subtitle={(row) => row.customer?.name ?? 'Walk-in'}
        onRowClick={(row) => void openDetail(row.id)}
        rowAction={(row) => (
          <Button
            variant="outline"
            size="sm"
            icon={<Eye size={14} />}
            onClick={() => void openDetail(row.id)}
          >
            View
          </Button>
        )}
        groupByDate={(row) => (row.invoiceDate ? row.invoiceDate.slice(0, 10) : '—')}
        dayLabel={(groupRows) => {
          const total = groupRows.reduce((sum, row) => sum + toNumber(row.grandTotal), 0)
          return {
            label: formatDate(groupRows[0].invoiceDate),
            meta: `${groupRows.length} invoice${groupRows.length === 1 ? '' : 's'} · ${formatCurrency(total)}`,
          }
        }}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No invoices found"
        emptyDescription="Adjust the filters or record a new sale at the point of sale."
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Field label="Search invoice / customer" hint="Type a bill number or customer name">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                  />
                  <Input
                    className="pl-9"
                    placeholder="e.g. SALES-INV-00012 or Ram Bahadur"
                    value={filters.search}
                    onChange={(e) => updateFilter('search', e.target.value)}
                  />
                </div>
              </Field>
            </div>
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
            <div className="flex items-end gap-2">
              <DateRangePresets
                from={filters.from}
                to={filters.to}
                onPick={(range) => setFilters((prev) => ({ ...prev, ...range }))}
              />
              <Button variant="outline" icon={<RotateCcw size={14} />} onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </div>
        }
      />

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
              <div className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">
                {detailError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-3">Customer</dt>
                  <dd className="text-right font-medium text-ink">
                    {detail.customer?.name ?? 'Walk-in'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-3">Phone</dt>
                  <dd className="text-right text-ink-2">{detail.customer?.phone ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-3">Cashier</dt>
                  <dd className="text-right text-ink-2">{detail.cashier?.fullName ?? '—'}</dd>
                </div>
              </dl>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-3">Invoice date</dt>
                  <dd className="text-right text-ink-2">{formatDate(detail.invoiceDate)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-3">Due date</dt>
                  <dd className="text-right text-ink-2">{formatDate(detail.dueDate)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-3">Status</dt>
                  <dd className="text-right">
                    <Badge tone={STATUS_TONES[detail.status] ?? 'slate'}>
                      {detail.status.replace('_', ' ')}
                    </Badge>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-3 py-2 text-left text-[12.5px] font-medium text-ink-3">Item</th>
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Qty</th>
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Unit price</th>
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Discount</th>
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Tax</th>
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((line) => {
                    const unit = line.item?.unit?.abbreviation ?? line.item?.unit?.name
                    return (
                      <tr key={line.id} className="border-t border-line-2">
                        <td className="px-3 py-2">
                          <p className="font-medium text-ink">
                            {line.item?.name ?? `Item #${line.itemId}`}
                          </p>
                          {line.item?.itemCode && (
                            <p className="font-mono text-[11px] text-ink-3">
                              {line.item.itemCode}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-2">
                          {formatNumber(line.quantity, 2)}
                          {unit ? <span className="ml-1 text-xs text-ink-3">{unit}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-2">
                          {formatCurrency(line.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-2">
                          {formatCurrency(line.discountAmount)}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-2">
                          {formatCurrency(line.taxAmount)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-ink">
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
                <div className="flex justify-between text-ink-3">
                  <dt>Subtotal</dt>
                  <dd>{formatCurrency(detail.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-ink-3">
                  <dt>Discount</dt>
                  <dd>- {formatCurrency(detail.discountAmount)}</dd>
                </div>
                <div className="flex justify-between text-ink-3">
                  <dt>Taxable</dt>
                  <dd>{formatCurrency(detail.taxableAmount)}</dd>
                </div>
                <div className="flex justify-between text-ink-3">
                  <dt>Non-taxable</dt>
                  <dd>{formatCurrency(detail.nonTaxableAmount)}</dd>
                </div>
                <div className="flex justify-between text-ink-3">
                  <dt>VAT</dt>
                  <dd>{formatCurrency(detail.taxAmount)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                  <dt>Grand Total</dt>
                  <dd>{formatCurrency(detail.grandTotal)}</dd>
                </div>
                <div className="flex justify-between text-ink-3">
                  <dt>Paid</dt>
                  <dd>{formatCurrency(detail.paidAmount)}</dd>
                </div>
                <div
                  className={
                    toNumber(detail.outstandingAmount) > 0
                      ? 'flex justify-between font-medium text-brand-crimson'
                      : 'flex justify-between text-ink-3'
                  }
                >
                  <dt>Outstanding</dt>
                  <dd>{formatCurrency(detail.outstandingAmount)}</dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
              <div className="flex items-start gap-2 text-sm">
                <Mail size={16} className="mt-0.5 shrink-0 text-accent-2" />
                <div>
                  <p className="font-medium text-ink">
                    Invoice email · {detail.emailNotification?.status ?? detail.emailNotificationStatus ?? 'unknown'}
                  </p>
                  <p className="text-ink-3">
                    {emailActionError
                      ?? detail.emailNotification?.message
                      ?? detail.emailNotificationError
                      ?? 'No delivery result has been recorded.'}
                  </p>
                  {detail.customer?.email && (
                    <p className="text-xs text-ink-3">Recipient: {detail.customer.email}</p>
                  )}
                </div>
              </div>
              {detail.status === 'confirmed' && detail.customer?.email && (
                <Button
                  variant="outline"
                  size="sm"
                  loading={emailSending}
                  icon={<Mail size={14} />}
                  onClick={() => void resendInvoiceEmail()}
                >
                  {detail.emailNotificationStatus === 'sent' ? 'Send again' : 'Retry email'}
                </Button>
              )}
            </div>

            {detail.paymentAllocations && detail.paymentAllocations.length > 0 && (
              <div className="rounded-xl border border-line p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Payments
                </p>
                <ul className="space-y-1.5 text-sm">
                  {detail.paymentAllocations.map((allocation) => (
                    <li key={allocation.id} className="flex justify-between">
                      <span className="capitalize text-ink-2">
                        {(allocation.payment?.paymentMethod ?? 'payment').replace('_', ' ')}
                        {allocation.payment?.paymentNumber ? (
                          <span className="ml-1 text-xs text-ink-3">
                            {allocation.payment.paymentNumber}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-medium text-ink">
                        {formatCurrency(allocation.payment?.amount ?? allocation.allocatedAmount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.notes && (
              <div className="rounded-xl bg-line-2 px-3 py-2 text-xs text-ink-2">{detail.notes}</div>
            )}

            <p className="text-[11px] text-ink-3">Created {formatDateTime(detail.createdAt)}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
