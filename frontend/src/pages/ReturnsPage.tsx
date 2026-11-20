import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FeedList, initials } from '@/components/ui/FeedList'
import type { FeedColumn } from '@/components/ui/FeedList'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { DateRangePresets } from '@/components/ui/DateRangePresets'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import { cn, formatCurrency, formatDate, formatDateTime, formatNumber, toNumber } from '@/lib/utils'
import type { Customer, Paginated, Supplier } from '@/types'

const todayIso = new Date().toISOString().slice(0, 10)
const monthStartIso = `${todayIso.slice(0, 7)}-01`

const REFUND_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'digital_wallet', label: 'Digital wallet' },
  { value: 'qr', label: 'QR / Fonepay' },
  { value: 'credit_note', label: 'Credit note' },
]

interface SalesInvoiceOption {
  id: string | number
  invoiceNumber: string
  invoiceDate: string
  customer?: { id: number; name: string } | null
}

interface PurchaseInvoiceOption {
  id: string | number
  invoiceNumber: string
  invoiceDate: string
  supplier: { id: number; name: string } | null
}

interface ReturnableLine {
  id: string | number
  itemId: number
  quantity: string
  returnedQty: string
  unitPrice: string
  unitCost?: string
  lineTotal: string
  item: { id: number; name: string; itemCode: string } | null
}

interface ReturnableInvoice {
  id: string | number
  invoiceNumber: string
  invoiceDate: string
  customer?: { id: number; name: string } | null
  supplier?: { id: number; name: string } | null
  paymentMethod?: string | null
  items: ReturnableLine[]
  paymentAllocations?: {
    id: string | number
    allocatedAmount: string
    payment: { paymentMethod: string; amount: string } | null
  }[]
}

function matchRefundMethod(method?: string | null): string {
  const allowed = ['cash', 'bank_transfer', 'card', 'digital_wallet', 'qr']
  return method && allowed.includes(method) ? method : 'cash'
}

interface SalesReturnRow {
  id: string | number
  returnNumber: string
  originalInvoiceId: string | number
  returnDate: string
  totalAmount: string
  refundAmount: string
  refundMethod: string | null
  status: string
  customer: { id: number; name: string } | null
}

interface SalesReturnDetail extends SalesReturnRow {
  returnReason: string | null
  subtotal: string
  taxAmount: string
  createdAt: string
  originalInvoice: { id: string | number; invoiceNumber: string } | null
  items: {
    id: string | number
    itemId: number
    returnedQty: string
    unitPrice: string
    taxAmount: string
    lineTotal: string
    disposition: string
    item: { id: number; name: string; itemCode: string } | null
  }[]
  creditNotes: {
    id: string | number
    cnNumber: string
    amount: string
    usedAmount: string
    status: string
  }[]
}

interface PurchaseReturnRow {
  id: string | number
  returnNumber: string
  originalInvoiceId: string | number
  returnDate: string
  totalAmount: string
  status: string
  supplier: { id: number; name: string } | null
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-accent text-white shadow-sm' : 'text-ink-2 hover:bg-line-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function QtyInput({
  value,
  max,
  onChange,
}: {
  value: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      step="0.01"
      value={value}
      onChange={(event) => onChange(Math.min(Math.max(toNumber(event.target.value), 0), max))}
      className="h-8 w-24 rounded-lg border border-line bg-white px-2 text-right text-xs text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
    />
  )
}

export function ReturnsPage() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<'sales' | 'purchases'>(
    searchParams.get('tab') === 'purchases' ? 'purchases' : 'sales',
  )

  return (
    <div className="space-y-4">
      <div className="flex w-fit items-center gap-1 rounded-xl border border-line bg-white/70 p-1 shadow-sm">
        <TabButton active={tab === 'sales'} onClick={() => setTab('sales')}>
          Sales Returns
        </TabButton>
        <TabButton active={tab === 'purchases'} onClick={() => setTab('purchases')}>
          Purchase Returns
        </TabButton>
      </div>

      {tab === 'sales' ? <SalesReturnsTab /> : <PurchaseReturnsTab />}
    </div>
  )
}

function SalesReturnsTab() {
  const [filters, setFilters] = useState({ from: monthStartIso, to: todayIso, customer: '' })

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('from', filters.from)
    params.set('to', filters.to)
    if (filters.customer) params.set('customerId', filters.customer)
    params.set('page', '1')
    params.set('limit', '50')
    return params.toString()
  }, [filters])

  const { data, loading, error, reload } = useFetch<Paginated<SalesReturnRow>>(
    `/returns/sales?${query}`,
  )
  const { data: customers } = useFetch<Paginated<Customer>>('/customers?limit=100')
  const { data: invoices } = useFetch<Paginated<SalesInvoiceOption>>('/sales?limit=100')

  const rows = data?.data ?? []

  const invoiceNumbers = useMemo(() => {
    const map = new Map<string, string>()
    for (const invoice of invoices?.data ?? []) map.set(String(invoice.id), invoice.invoiceNumber)
    return map
  }, [invoices])

  const [openId, setOpenId] = useState<string | number | null>(null)
  const [detail, setDetail] = useState<SalesReturnDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [invoiceId, setInvoiceId] = useState('')
  const [invoice, setInvoice] = useState<ReturnableInvoice | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [refundMethod, setRefundMethod] = useState('cash')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [searchOptions, setSearchOptions] = useState<SalesInvoiceOption[]>([])
  const [searching, setSearching] = useState(false)
  const [refundMatched, setRefundMatched] = useState(false)
  const searchTimer = useRef<number | null>(null)
  const deepLinkRef = useRef(false)
  const [searchParams, setSearchParams] = useSearchParams()

  async function openDetail(id: string | number) {
    setOpenId(id)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const { data: full } = await api.get<SalesReturnDetail>(`/returns/sales/${id}`)
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

  function openCreate() {
    setCreateOpen(true)
    setInvoiceId('')
    setInvoice(null)
    setQtys({})
    setRefundMethod('cash')
    setRefundMatched(false)
    setReason('')
    setFormError(null)
    setInvoiceSearch('')
    setSearchOptions([])
  }

  async function loadInvoice(id: string) {
    setInvoiceId(id)
    setInvoice(null)
    setQtys({})
    setFormError(null)
    if (!id) return
    setInvoiceLoading(true)
    try {
      const { data: full } = await api.get<ReturnableInvoice>(`/sales/${id}`)
      setInvoice(full)
      const originalMethod =
        full.paymentMethod ??
        full.paymentAllocations?.find((a) => a.payment?.paymentMethod)?.payment?.paymentMethod
      setRefundMethod(matchRefundMethod(originalMethod))
      setRefundMatched(Boolean(originalMethod))
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setInvoiceLoading(false)
    }
  }

  async function openInvoiceByNumber(invoiceNumber: string) {
    openCreate()
    setInvoiceSearch(invoiceNumber)
    setSearching(true)
    try {
      const { data: found } = await api.get<Paginated<SalesInvoiceOption>>('/sales', {
        params: { limit: 20, search: invoiceNumber },
      })
      setSearchOptions(found.data)
      const match =
        found.data.find((row) => row.invoiceNumber === invoiceNumber) ?? found.data[0]
      if (match) await loadInvoice(String(match.id))
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  function onInvoiceSearch(term: string) {
    setInvoiceSearch(term)
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    if (!term.trim()) {
      setSearchOptions([])
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimer.current = window.setTimeout(async () => {
      try {
        const { data: found } = await api.get<Paginated<SalesInvoiceOption>>('/sales', {
          params: { limit: 20, search: term.trim() },
        })
        setSearchOptions(found.data)
      } catch {
        setSearchOptions([])
      } finally {
        setSearching(false)
      }
    }, 300)
  }

  useEffect(() => {
    const target = searchParams.get('invoice')
    if (!target || deepLinkRef.current) return
    deepLinkRef.current = true
    void openInvoiceByNumber(target)
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const invoiceOptions = invoiceSearch.trim() ? searchOptions : (invoices?.data ?? [])

  async function submitReturn() {
    if (!invoice) {
      setFormError('Select an original invoice first.')
      return
    }
    const selected = invoice.items
      .map((line) => ({ line, qty: qtys[String(line.id)] ?? 0 }))
      .filter((entry) => entry.qty > 0)
    if (selected.length === 0) {
      setFormError('Enter a returned quantity for at least one line item.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.post('/returns/sales', {
        originalInvoiceId: Number(invoiceId),
        returnReason: reason.trim() || null,
        refundMethod,
        items: selected.map(({ line, qty }) => ({
          originalItemId: Number(line.id),
          returnedQty: qty,
        })),
      })
      setCreateOpen(false)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const columns: FeedColumn<SalesReturnRow>[] = [
    {
      header: 'Original invoice',
      width: '170px',
      hideOnMobile: true,
      cell: (row) => (
        <span className="fv text-ink-2">
          {invoiceNumbers.get(String(row.originalInvoiceId)) ?? `#${row.originalInvoiceId}`}
        </span>
      ),
    },
    {
      header: 'Refund amount',
      width: '140px',
      align: 'right',
      cell: (row) => <span className="fv font-semibold text-ink">{formatCurrency(row.refundAmount)}</span>,
    },
    {
      header: 'Refund method',
      width: '150px',
      hideOnMobile: true,
      cell: (row) => (
        <span className="fv capitalize text-ink-3">
          {row.refundMethod?.replace('_', ' ') ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <FeedList
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        lead={(row) => initials(row.customer?.name ?? 'Walk-in')}
        title={(row) => row.returnNumber}
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
        groupByDate={(row) => (row.returnDate ? row.returnDate.slice(0, 10) : '—')}
        dayLabel={(groupRows) => {
          const total = groupRows.reduce((sum, row) => sum + toNumber(row.refundAmount), 0)
          return {
            label: formatDate(groupRows[0].returnDate),
            meta: `${groupRows.length} return${groupRows.length === 1 ? '' : 's'} · ${formatCurrency(total)}`,
          }
        }}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No sales returns"
        emptyDescription="Refund a customer by creating a return against an existing invoice."
        emptyIcon={<RotateCcw size={20} />}
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From">
              <Input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
              />
            </Field>
            <Field label="Customer">
              <Select
                value={filters.customer}
                onChange={(e) => setFilters((prev) => ({ ...prev, customer: e.target.value }))}
              >
                <option value="">All customers</option>
                {(customers?.data ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="ml-auto flex items-end gap-2">
              <DateRangePresets
                from={filters.from}
                to={filters.to}
                onPick={(range) => setFilters((prev) => ({ ...prev, ...range }))}
              />
              <Button
                variant="outline"
                icon={<RotateCcw size={14} />}
                onClick={() => setFilters({ from: monthStartIso, to: todayIso, customer: '' })}
              >
                Clear
              </Button>
              <Button icon={<Plus size={16} />} onClick={openCreate}>
                New Sales Return
              </Button>
            </div>
          </div>
        }
      />

      <Modal
        open={openId !== null}
        title={detail ? `Return ${detail.returnNumber}` : 'Sales Return'}
        size="lg"
        onClose={closeDetail}
        footer={
          <Button variant="outline" onClick={closeDetail}>
            Close
          </Button>
        }
      >
        {detailLoading && <Spinner label="Loading return…" />}

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-3">Customer</dt>
                  <dd className="text-right font-medium text-ink">
                    {detail.customer?.name ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-3">Original invoice</dt>
                  <dd className="text-right text-ink-2">
                    {detail.originalInvoice?.invoiceNumber ??
                      invoiceNumbers.get(String(detail.originalInvoiceId)) ??
                      `#${detail.originalInvoiceId}`}
                  </dd>
                </div>
              </dl>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-3">Return date</dt>
                  <dd className="text-right text-ink-2">{formatDate(detail.returnDate)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-3">Refund method</dt>
                  <dd className="text-right capitalize text-ink-2">
                    {detail.refundMethod?.replace('_', ' ') ?? '—'}
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
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Tax</th>
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Line total</th>
                    <th className="px-3 py-2 text-left text-[12.5px] font-medium text-ink-3">Disposition</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((line) => (
                    <tr key={line.id} className="border-t border-line-2">
                      <td className="px-3 py-2 font-medium text-ink">
                        {line.item?.name ?? `Item #${line.itemId}`}
                      </td>
                      <td className="px-3 py-2 text-right text-ink-2">
                        {formatNumber(line.returnedQty, 2)}
                      </td>
                      <td className="px-3 py-2 text-right text-ink-2">
                        {formatCurrency(line.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-right text-ink-2">
                        {formatCurrency(line.taxAmount)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-ink">
                        {formatCurrency(line.lineTotal)}
                      </td>
                      <td className="px-3 py-2 capitalize text-ink-3">
                        {line.disposition.replace('_', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="ml-auto w-full space-y-1.5 text-sm sm:max-w-xs">
              <div className="flex justify-between text-ink-3">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(detail.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-3">
                <dt>VAT</dt>
                <dd>{formatCurrency(detail.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                <dt>Total refund</dt>
                <dd>{formatCurrency(detail.totalAmount)}</dd>
              </div>
            </dl>

            {detail.creditNotes.length > 0 && (
              <div className="rounded-xl border border-line p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Credit notes
                </p>
                <ul className="space-y-1.5 text-sm">
                  {detail.creditNotes.map((note) => (
                    <li key={note.id} className="flex justify-between">
                      <span className="text-ink-2">{note.cnNumber}</span>
                      <span className="font-medium text-ink">{formatCurrency(note.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.returnReason && (
              <div className="rounded-xl bg-line-2 px-3 py-2 text-xs text-ink-2">
                {detail.returnReason}
              </div>
            )}

            <p className="text-[11px] text-ink-3">Created {formatDateTime(detail.createdAt)}</p>
          </div>
        )}
      </Modal>

      <Modal
        open={createOpen}
        title="New Sales Return"
        size="lg"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={submitReturn}>
              Create Return
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {formError && (
            <div className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Search invoice"
              hint="Type a sales invoice number or customer name"
            >
              <Input
                value={invoiceSearch}
                placeholder="e.g. SALES-INV-00012 or Ram Bahadur"
                onChange={(e) => onInvoiceSearch(e.target.value)}
              />
            </Field>
            <Field label="Original invoice" required hint="Pick the invoice being returned against">
              <Select value={invoiceId} onChange={(e) => void loadInvoice(e.target.value)}>
                <option value="">— Select an invoice —</option>
                {invoiceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.invoiceNumber}
                    {option.customer?.name ? ` · ${option.customer.name}` : ''} ·{' '}
                    {formatDate(option.invoiceDate)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {searching && <Spinner label="Searching invoices…" />}

          {invoiceLoading && <Spinner label="Loading invoice…" />}

          {invoice && (
            <>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="min-w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-3 py-2 text-left text-[12.5px] font-medium text-ink-3">Item</th>
                      <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Sold</th>
                      <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Remaining</th>
                      <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Return qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((line) => {
                      const remaining = Math.max(
                        0,
                        toNumber(line.quantity) - toNumber(line.returnedQty),
                      )
                      return (
                        <tr key={line.id} className="border-t border-line-2">
                          <td className="px-3 py-2">
                            <p className="font-medium text-ink">
                              {line.item?.name ?? `Item #${line.itemId}`}
                            </p>
                            <p className="text-xs text-ink-3">
                              {formatCurrency(line.unitPrice)} each
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right text-ink-2">
                            {formatNumber(line.quantity, 2)}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-2">
                            {formatNumber(remaining, 2)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <QtyInput
                              value={qtys[String(line.id)] ?? 0}
                              max={remaining}
                              onChange={(value) =>
                                setQtys((prev) => ({ ...prev, [String(line.id)]: value }))
                              }
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Refund method"
                  required
                  hint={
                    refundMatched
                      ? 'Matched to the original invoice payment method'
                      : 'Choose how the customer is refunded'
                  }
                >
                  <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                    {REFUND_METHODS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Return reason" hint="Optional note stored with the return">
                  <Textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Damaged on arrival"
                  />
                </Field>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

function PurchaseReturnsTab() {
  const [filters, setFilters] = useState({ from: monthStartIso, to: todayIso, supplier: '' })

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('from', filters.from)
    params.set('to', filters.to)
    if (filters.supplier) params.set('supplierId', filters.supplier)
    params.set('page', '1')
    params.set('limit', '50')
    return params.toString()
  }, [filters])

  const { data, loading, error, reload } = useFetch<Paginated<PurchaseReturnRow>>(
    `/returns/purchases?${query}`,
  )
  const { data: suppliers } = useFetch<Paginated<Supplier>>('/suppliers?limit=100')
  const { data: purchases } = useFetch<Paginated<PurchaseInvoiceOption>>('/purchases?limit=100')

  const rows = data?.data ?? []

  const invoiceNumbers = useMemo(() => {
    const map = new Map<string, string>()
    for (const invoice of purchases?.data ?? []) map.set(String(invoice.id), invoice.invoiceNumber)
    return map
  }, [purchases])

  const [createOpen, setCreateOpen] = useState(false)
  const [invoiceId, setInvoiceId] = useState('')
  const [invoice, setInvoice] = useState<ReturnableInvoice | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkRef = useRef<string | null>(null)

  function openCreate() {
    setCreateOpen(true)
    setInvoiceId('')
    setInvoice(null)
    setQtys({})
    setReason('')
    setFormError(null)
  }

  async function loadInvoice(id: string) {
    setInvoiceId(id)
    setInvoice(null)
    setQtys({})
    setFormError(null)
    if (!id) return
    setInvoiceLoading(true)
    try {
      const { data: full } = await api.get<ReturnableInvoice>(`/purchases/${id}`)
      setInvoice(full)
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setInvoiceLoading(false)
    }
  }

  useEffect(() => {
    const linkedInvoiceId = searchParams.get('purchaseInvoiceId')
    if (!linkedInvoiceId || deepLinkRef.current === linkedInvoiceId) return
    deepLinkRef.current = linkedInvoiceId
    setCreateOpen(true)
    void loadInvoice(linkedInvoiceId)
    const next = new URLSearchParams(searchParams)
    next.delete('purchaseInvoiceId')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function submitReturn() {
    if (!invoice) {
      setFormError('Select an original purchase invoice first.')
      return
    }
    const selected = invoice.items
      .map((line) => ({ line, qty: qtys[String(line.id)] ?? 0 }))
      .filter((entry) => entry.qty > 0)
    if (selected.length === 0) {
      setFormError('Enter a returned quantity for at least one line item.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.post('/returns/purchases', {
        originalInvoiceId: Number(invoiceId),
        returnReason: reason.trim() || null,
        items: selected.map(({ line, qty }) => ({
          originalItemId: Number(line.id),
          returnedQty: qty,
        })),
      })
      setCreateOpen(false)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const columns: FeedColumn<PurchaseReturnRow>[] = [
    {
      header: 'Original invoice',
      width: '170px',
      hideOnMobile: true,
      cell: (row) => (
        <span className="fv text-ink-2">
          {invoiceNumbers.get(String(row.originalInvoiceId)) ?? `#${row.originalInvoiceId}`}
        </span>
      ),
    },
    {
      header: 'Amount',
      width: '140px',
      align: 'right',
      cell: (row) => <span className="fv font-semibold text-ink">{formatCurrency(row.totalAmount)}</span>,
    },
    {
      header: 'Status',
      width: '120px',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.status === 'completed' ? 'green' : 'amber'}>
          {row.status.replace('_', ' ')}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <FeedList
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        lead={(row) => initials(row.supplier?.name ?? 'Supplier')}
        title={(row) => row.returnNumber}
        subtitle={(row) => row.supplier?.name ?? 'Supplier'}
        groupByDate={(row) => (row.returnDate ? row.returnDate.slice(0, 10) : '—')}
        dayLabel={(groupRows) => {
          const total = groupRows.reduce((sum, row) => sum + toNumber(row.totalAmount), 0)
          return {
            label: formatDate(groupRows[0].returnDate),
            meta: `${groupRows.length} return${groupRows.length === 1 ? '' : 's'} · ${formatCurrency(total)}`,
          }
        }}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No purchase returns"
        emptyDescription="Return goods to a supplier against an existing purchase invoice."
        emptyIcon={<RotateCcw size={20} />}
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From">
              <Input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
              />
            </Field>
            <Field label="Supplier">
              <Select
                value={filters.supplier}
                onChange={(e) => setFilters((prev) => ({ ...prev, supplier: e.target.value }))}
              >
                <option value="">All suppliers</option>
                {(suppliers?.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="ml-auto flex items-end gap-2">
              <DateRangePresets
                from={filters.from}
                to={filters.to}
                onPick={(range) => setFilters((prev) => ({ ...prev, ...range }))}
              />
              <Button
                variant="outline"
                icon={<RotateCcw size={14} />}
                onClick={() => setFilters({ from: monthStartIso, to: todayIso, supplier: '' })}
              >
                Clear
              </Button>
              <Button icon={<Plus size={16} />} onClick={openCreate}>
                New Purchase Return
              </Button>
            </div>
          </div>
        }
      />

      <Modal
        open={createOpen}
        title="New Purchase Return"
        size="lg"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={submitReturn}>
              Create Return
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {formError && (
            <div className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">
              {formError}
            </div>
          )}

          <Field label="Original purchase invoice" required hint="Pick the purchase being returned">
            <Select value={invoiceId} onChange={(e) => void loadInvoice(e.target.value)}>
              <option value="">— Select an invoice —</option>
              {(purchases?.data ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.invoiceNumber} · {option.supplier?.name ?? 'Supplier'} ·{' '}
                  {formatDate(option.invoiceDate)}
                </option>
              ))}
            </Select>
          </Field>

          {invoiceLoading && <Spinner label="Loading invoice…" />}

          {invoice && (
            <>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="min-w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-3 py-2 text-left text-[12.5px] font-medium text-ink-3">Item</th>
                      <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Purchased</th>
                      <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Remaining</th>
                      <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Return qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((line) => {
                      const remaining = Math.max(
                        0,
                        toNumber(line.quantity) - toNumber(line.returnedQty),
                      )
                      return (
                        <tr key={line.id} className="border-t border-line-2">
                          <td className="px-3 py-2">
                            <p className="font-medium text-ink">
                              {line.item?.name ?? `Item #${line.itemId}`}
                            </p>
                            <p className="text-xs text-ink-3">
                              {formatCurrency(line.unitCost ?? '0')} each
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right text-ink-2">
                            {formatNumber(line.quantity, 2)}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-2">
                            {formatNumber(remaining, 2)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <QtyInput
                              value={qtys[String(line.id)] ?? 0}
                              max={remaining}
                              onChange={(value) =>
                                setQtys((prev) => ({ ...prev, [String(line.id)]: value }))
                              }
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <Field label="Return reason" hint="Optional note stored with the return">
                <Textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Wrong item supplied"
                />
              </Field>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
