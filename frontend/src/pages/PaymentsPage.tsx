import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Eye,
  HandCoins,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, StatCard } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import { cn, formatCurrency, formatDate, formatNumber, toNumber } from '@/lib/utils'
import type { Customer, Paginated, Supplier } from '@/types'

type Tab = 'payments' | 'receivables' | 'payables'

interface PaymentRecord {
  id: string | number
  paymentNumber: string
  paymentDate: string
  paymentType: string
  partyType: string | null
  customerId: number | null
  supplierId: number | null
  paymentMethod: string
  amount: string
  transactionRef: string | null
  paymentStatus: string
  narration: string | null
  customer: { id: number; name: string } | null
  supplier: { id: number; name: string } | null
}

interface PaymentAllocationRecord {
  id: string | number
  invoiceType: string
  salesInvoiceId: string | number | null
  purchaseInvoiceId: string | number | null
  allocatedAmount: string
  salesInvoice?: { id: string | number; invoiceNumber: string } | null
  purchaseInvoice?: { id: string | number; invoiceNumber: string } | null
}

interface PaymentDetail extends PaymentRecord {
  allocations: PaymentAllocationRecord[]
}

interface OutstandingCustomerRow {
  customerId: number
  customerCode: string | null
  name: string
  phone: string | null
  outstanding: number
  invoiceCount: number
}

interface OutstandingSupplierRow {
  supplierId: number
  supplierCode: string | null
  name: string
  phone: string | null
  outstanding: number
  invoiceCount: number
}

interface OutstandingInvoice {
  id: string | number
  invoiceNumber: string
  invoiceDate: string
  outstandingAmount: string
}

interface AllocationDraft {
  key: string
  invoiceType: 'sales' | 'purchase'
  invoiceId: number
  invoiceNumber: string
  invoiceDate: string
  outstanding: number
  selected: boolean
  amount: string
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'digital_wallet', label: 'Digital wallet' },
  { value: 'qr', label: 'QR / Fonepay' },
  { value: 'customer_credit', label: 'Customer credit' },
  { value: 'split', label: 'Split' },
]

const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((method) => [method.value, method.label]),
)

function methodLabel(value: string): string {
  return METHOD_LABELS[value] ?? value
}

function statusTone(status: string): 'green' | 'red' | 'amber' | 'slate' {
  switch (status) {
    case 'completed':
      return 'green'
    case 'failed':
      return 'red'
    case 'pending':
      return 'amber'
    default:
      return 'slate'
  }
}

function statusLabel(status: string): string {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : '—'
}

export function PaymentsPage() {
  const [tab, setTab] = useState<Tab>('payments')

  // ── Payments list filters ───────────────────────────────────
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [partyTypeFilter, setPartyTypeFilter] = useState('')
  const [partyFilterId, setPartyFilterId] = useState('')
  const [applied, setApplied] = useState({ from: '', to: '', partyType: '', partyId: '' })

  const paymentsUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (applied.from) params.set('from', applied.from)
    if (applied.to) params.set('to', applied.to)
    if (applied.partyType) {
      params.set('partyType', applied.partyType)
      if (applied.partyId) {
        if (applied.partyType === 'customer') params.set('customerId', applied.partyId)
        else params.set('supplierId', applied.partyId)
      }
    }
    params.set('limit', '100')
    return `/payments?${params.toString()}`
  }, [applied])

  const { data, loading, error, reload } = useFetch<Paginated<PaymentRecord>>(paymentsUrl)
  const receivables = useFetch<{ data: OutstandingCustomerRow[]; total: number }>(
    '/payments/outstanding/customers',
  )
  const payables = useFetch<{ data: OutstandingSupplierRow[]; total: number }>(
    '/payments/outstanding/suppliers',
  )
  const { data: customers } = useFetch<Paginated<Customer>>('/customers?limit=100')
  const { data: suppliers } = useFetch<Paginated<Supplier>>('/suppliers?limit=100')

  const payments = data?.data ?? []

  // ── Record payment modal ────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer')
  const [partyId, setPartyId] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [method, setMethod] = useState('cash')
  const [amount, setAmount] = useState('')
  const [transactionRef, setTransactionRef] = useState('')
  const [narration, setNarration] = useState('')
  const [allocations, setAllocations] = useState<AllocationDraft[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // ── View payment modal ──────────────────────────────────────
  const [viewOpen, setViewOpen] = useState(false)
  const [viewDetail, setViewDetail] = useState<PaymentDetail | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)

  const partyOptions: Array<{ id: number; name: string }> =
    partyType === 'customer'
      ? (customers?.data ?? []).map((customer) => ({ id: customer.id, name: customer.name }))
      : (suppliers?.data ?? []).map((supplier) => ({ id: supplier.id, name: supplier.name }))

  const filterPartyOptions: Array<{ id: number; name: string }> =
    partyTypeFilter === 'customer'
      ? (customers?.data ?? []).map((customer) => ({ id: customer.id, name: customer.name }))
      : partyTypeFilter === 'supplier'
        ? (suppliers?.data ?? []).map((supplier) => ({ id: supplier.id, name: supplier.name }))
        : []

  function openPayment(nextPartyType: 'customer' | 'supplier', nextPartyId = '') {
    setPartyType(nextPartyType)
    setPartyId(nextPartyId)
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setMethod('cash')
    setAmount('')
    setTransactionRef('')
    setNarration('')
    setAllocations([])
    setFormError(null)
    setOpen(true)
  }

  function changePartyType(next: 'customer' | 'supplier') {
    setPartyType(next)
    setPartyId('')
    setAllocations([])
  }

  // Load the selected party's outstanding invoices for the allocations editor.
  useEffect(() => {
    if (!open || !partyId) {
      setAllocations([])
      return
    }
    let cancelled = false
    setLoadingInvoices(true)
    const url =
      partyType === 'customer'
        ? `/sales?customer=${partyId}&limit=100`
        : `/purchases?supplier=${partyId}&limit=100`
    api
      .get<{ data: OutstandingInvoice[] }>(url)
      .then(({ data: response }) => {
        if (cancelled) return
        const rows = response.data.filter((row) => toNumber(row.outstandingAmount) > 0)
        setAllocations(
          rows.map((row) => {
            const outstanding = toNumber(row.outstandingAmount)
            return {
              key: `${partyType}-${row.id}`,
              invoiceType: partyType === 'customer' ? 'sales' : 'purchase',
              invoiceId: Number(row.id),
              invoiceNumber: row.invoiceNumber,
              invoiceDate: row.invoiceDate,
              outstanding,
              selected: false,
              amount: outstanding.toFixed(2),
            }
          }),
        )
      })
      .catch(() => {
        if (!cancelled) setAllocations([])
      })
      .finally(() => {
        if (!cancelled) setLoadingInvoices(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, partyId, partyType])

  const selectedAllocationTotal = allocations
    .filter((line) => line.selected)
    .reduce((sum, line) => sum + toNumber(line.amount), 0)

  useEffect(() => {
    if (selectedAllocationTotal > 0 && amount === '') {
      setAmount(selectedAllocationTotal.toFixed(2))
    }
  }, [selectedAllocationTotal, amount])

  function toggleAllocation(key: string) {
    setAllocations((prev) =>
      prev.map((line) =>
        line.key === key
          ? { ...line, selected: !line.selected, amount: line.amount || line.outstanding.toFixed(2) }
          : line,
      ),
    )
  }

  function setAllocationAmount(key: string, value: string) {
    setAllocations((prev) =>
      prev.map((line) =>
        line.key === key
          ? { ...line, amount: String(Math.min(toNumber(value), line.outstanding)) }
          : line,
      ),
    )
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    if (!partyId) {
      setFormError(`Select a ${partyType === 'customer' ? 'customer' : 'supplier'}.`)
      return
    }
    const parsedAmount = toNumber(amount)
    if (parsedAmount <= 0) {
      setFormError('Enter an amount greater than zero.')
      return
    }
    const selected = allocations.filter((line) => line.selected && toNumber(line.amount) > 0)
    if (selected.reduce((sum, line) => sum + toNumber(line.amount), 0) > parsedAmount + 0.001) {
      setFormError('Total allocated amount exceeds the payment amount.')
      return
    }
    setSaving(true)
    try {
      await api.post('/payments', {
        paymentDate: paymentDate || undefined,
        partyType,
        ...(partyType === 'customer'
          ? { customerId: Number(partyId) }
          : { supplierId: Number(partyId) }),
        paymentMethod: method,
        amount: parsedAmount,
        transactionRef: transactionRef.trim() || null,
        narration: narration.trim() || null,
        allocations: selected.map((line) => ({
          invoiceType: line.invoiceType,
          invoiceId: line.invoiceId,
          amount: toNumber(line.amount),
        })),
      })
      setOpen(false)
      reload()
      receivables.reload()
      payables.reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function openView(id: string | number) {
    setViewOpen(true)
    setViewDetail(null)
    setViewError(null)
    setViewLoading(true)
    try {
      const { data: detail } = await api.get<PaymentDetail>(`/payments/${id}`)
      setViewDetail(detail)
    } catch (err) {
      setViewError(getErrorMessage(err))
    } finally {
      setViewLoading(false)
    }
  }

  const received = payments
    .filter((payment) => payment.partyType === 'customer')
    .reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  const paidOut = payments
    .filter((payment) => payment.partyType === 'supplier')
    .reduce((sum, payment) => sum + toNumber(payment.amount), 0)

  const paymentColumns: Column<PaymentRecord>[] = [
    {
      header: 'Date',
      cell: (row) => <span className="whitespace-nowrap">{formatDate(row.paymentDate)}</span>,
    },
    {
      header: 'Party',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">
            {row.customer?.name ?? row.supplier?.name ?? '—'}
          </p>
          <p className="font-mono text-[11px] text-slate-400">{row.paymentNumber}</p>
        </div>
      ),
    },
    {
      header: 'Type',
      cell: (row) => (
        <Badge tone={row.partyType === 'supplier' ? 'indigo' : 'green'}>
          {row.partyType === 'supplier' ? 'Payment' : 'Receipt'}
        </Badge>
      ),
    },
    { header: 'Method', cell: (row) => methodLabel(row.paymentMethod) },
    { header: 'Reference', cell: (row) => row.transactionRef ?? '—' },
    {
      header: 'Amount',
      align: 'right',
      cell: (row) => (
        <span
          className={cn(
            'font-semibold',
            row.partyType === 'supplier' ? 'text-amber-600' : 'text-emerald-600',
          )}
        >
          {formatCurrency(row.amount)}
        </span>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <Button variant="outline" size="sm" icon={<Eye size={14} />} onClick={() => openView(row.id)}>
          View
        </Button>
      ),
    },
  ]

  const receivableColumns: Column<OutstandingCustomerRow>[] = [
    {
      header: 'Customer',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.name}</p>
          <p className="font-mono text-[11px] text-slate-400">{row.customerCode ?? '—'}</p>
        </div>
      ),
    },
    { header: 'Phone', cell: (row) => row.phone ?? '—' },
    { header: 'Open invoices', align: 'right', cell: (row) => formatNumber(row.invoiceCount) },
    {
      header: 'Outstanding',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-red-600">{formatCurrency(row.outstanding)}</span>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <Button
          size="sm"
          icon={<HandCoins size={14} />}
          onClick={() => openPayment('customer', String(row.customerId))}
        >
          Receive payment
        </Button>
      ),
    },
  ]

  const payableColumns: Column<OutstandingSupplierRow>[] = [
    {
      header: 'Supplier',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.name}</p>
          <p className="font-mono text-[11px] text-slate-400">{row.supplierCode ?? '—'}</p>
        </div>
      ),
    },
    { header: 'Phone', cell: (row) => row.phone ?? '—' },
    { header: 'Open invoices', align: 'right', cell: (row) => formatNumber(row.invoiceCount) },
    {
      header: 'Outstanding',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-red-600">{formatCurrency(row.outstanding)}</span>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          icon={<HandCoins size={14} />}
          onClick={() => openPayment('supplier', String(row.supplierId))}
        >
          Make payment
        </Button>
      ),
    },
  ]

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'payments', label: 'Payments' },
    { id: 'receivables', label: 'Receivables' },
    { id: 'payables', label: 'Payables' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                tab === entry.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <Button icon={<HandCoins size={16} />} onClick={() => openPayment('customer')}>
          Receive / Make Payment
        </Button>
      </div>

      {tab === 'payments' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Received"
              value={formatCurrency(received)}
              hint={`${payments.filter((p) => p.partyType === 'customer').length} receipts`}
              icon={<ArrowDownToLine size={18} />}
              tone="emerald"
            />
            <StatCard
              label="Paid out"
              value={formatCurrency(paidOut)}
              hint={`${payments.filter((p) => p.partyType === 'supplier').length} payments`}
              icon={<ArrowUpFromLine size={18} />}
              tone="amber"
            />
            <StatCard
              label="Number of payments"
              value={formatNumber(payments.length)}
              hint="Matching the current filters"
              icon={<Wallet size={18} />}
              tone="indigo"
            />
          </div>

          <Card className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="From">
                <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </Field>
              <Field label="To">
                <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </Field>
              <Field label="Party type">
                <Select
                  value={partyTypeFilter}
                  onChange={(event) => {
                    setPartyTypeFilter(event.target.value)
                    setPartyFilterId('')
                  }}
                >
                  <option value="">All parties</option>
                  <option value="customer">Customer</option>
                  <option value="supplier">Supplier</option>
                </Select>
              </Field>
              <Field label="Party">
                <Select
                  value={partyFilterId}
                  disabled={!partyTypeFilter}
                  onChange={(event) => setPartyFilterId(event.target.value)}
                >
                  <option value="">All</option>
                  {filterPartyOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => setApplied({ from, to, partyType: partyTypeFilter, partyId: partyFilterId })}
                >
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFrom('')
                    setTo('')
                    setPartyTypeFilter('')
                    setPartyFilterId('')
                    setApplied({ from: '', to: '', partyType: '', partyId: '' })
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <DataTable
              columns={paymentColumns}
              rows={payments}
              rowKey={(row) => row.id}
              loading={loading}
              error={error}
              onRetry={reload}
              emptyTitle="No payments recorded"
              emptyDescription="Record a receipt from a customer or a payment to a supplier."
            />
          </Card>
        </>
      )}

      {tab === 'receivables' && (
        <Card>
          <DataTable
            columns={receivableColumns}
            rows={receivables.data?.data ?? []}
            rowKey={(row) => row.customerId}
            loading={receivables.loading}
            error={receivables.error}
            onRetry={receivables.reload}
            emptyTitle="No outstanding receivables"
            emptyDescription="Customers with unpaid invoices will appear here."
          />
        </Card>
      )}

      {tab === 'payables' && (
        <Card>
          <DataTable
            columns={payableColumns}
            rows={payables.data?.data ?? []}
            rowKey={(row) => row.supplierId}
            loading={payables.loading}
            error={payables.error}
            onRetry={payables.reload}
            emptyTitle="No outstanding payables"
            emptyDescription="Suppliers with unpaid purchase invoices will appear here."
          />
        </Card>
      )}

      <Modal
        open={open}
        title="Record Payment"
        size="lg"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="payment-form" loading={saving}>
              Save Payment
            </Button>
          </>
        }
      >
        <form id="payment-form" onSubmit={submitPayment} className="space-y-5">
          {formError && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Party type</span>
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(['customer', 'supplier'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changePartyType(value)}
                  className={cn(
                    'rounded-lg px-4 py-1.5 text-xs font-medium capitalize transition-colors',
                    partyType === value
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={partyType === 'customer' ? 'Customer' : 'Supplier'} required>
              <Select value={partyId} onChange={(event) => setPartyId(event.target.value)}>
                <option value="">— Select —</option>
                {partyOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" required>
              <Input
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                required
              />
            </Field>
            <Field label="Payment method" required>
              <Select value={method} onChange={(event) => setMethod(event.target.value)}>
                {PAYMENT_METHODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" required hint="Total received / paid">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </Field>
            <Field label="Transaction reference">
              <Input
                value={transactionRef}
                onChange={(event) => setTransactionRef(event.target.value)}
                placeholder="Cheque no., txn id…"
              />
            </Field>
            <Field label="Narration" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={narration}
                onChange={(event) => setNarration(event.target.value)}
                placeholder="Optional notes about this payment"
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Allocate to invoices
              </p>
              {selectedAllocationTotal > 0 && (
                <span className="text-xs text-slate-500">
                  Allocated: {formatCurrency(selectedAllocationTotal)}
                </span>
              )}
            </div>

            {!partyId ? (
              <p className="py-2 text-xs text-slate-400">
                Select a {partyType === 'customer' ? 'customer' : 'supplier'} to load their
                outstanding invoices.
              </p>
            ) : loadingInvoices ? (
              <Spinner label="Loading invoices…" />
            ) : allocations.length === 0 ? (
              <p className="py-2 text-xs text-slate-400">
                This party has no outstanding invoices. The payment will be recorded on account.
              </p>
            ) : (
              <ul className="space-y-2">
                {allocations.map((line) => (
                  <li
                    key={line.key}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                      checked={line.selected}
                      onChange={() => toggleAllocation(line.key)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {line.invoiceNumber}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {formatDate(line.invoiceDate)} · Outstanding {formatCurrency(line.outstanding)}
                      </p>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={line.outstanding}
                      disabled={!line.selected}
                      value={line.amount}
                      onChange={(event) => setAllocationAmount(line.key, event.target.value)}
                      className="h-8 w-28 rounded-lg border border-slate-300 px-2 text-right text-xs disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </Modal>

      <Modal
        open={viewOpen}
        title={viewDetail ? `Payment ${viewDetail.paymentNumber}` : 'Payment'}
        size="md"
        onClose={() => setViewOpen(false)}
        footer={
          <Button variant="outline" onClick={() => setViewOpen(false)}>
            Close
          </Button>
        }
      >
        {viewLoading ? (
          <Spinner label="Loading payment…" />
        ) : viewError ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{viewError}</p>
        ) : viewDetail ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">
                  {viewDetail.customer?.name ?? viewDetail.supplier?.name ?? '—'}
                </p>
                <p className="text-xs text-slate-500">{formatDate(viewDetail.paymentDate)}</p>
              </div>
              <Badge tone={statusTone(viewDetail.paymentStatus)}>
                {statusLabel(viewDetail.paymentStatus)}
              </Badge>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
              <div>
                <dt className="text-slate-500">Type</dt>
                <dd className="font-medium text-slate-800">
                  {viewDetail.partyType === 'supplier' ? 'Payment' : 'Receipt'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Method</dt>
                <dd className="font-medium text-slate-800">{methodLabel(viewDetail.paymentMethod)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Reference</dt>
                <dd className="font-medium text-slate-800">{viewDetail.transactionRef ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Amount</dt>
                <dd className="font-medium text-slate-800">{formatCurrency(viewDetail.amount)}</dd>
              </div>
            </dl>

            {viewDetail.narration && (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {viewDetail.narration}
              </p>
            )}

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <CheckCircle2 size={14} /> Allocations
              </p>
              {viewDetail.allocations.length === 0 ? (
                <p className="text-xs text-slate-400">No invoice allocations recorded.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {viewDetail.allocations.map((allocation) => (
                    <li key={allocation.id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-slate-800">
                          {allocation.salesInvoice?.invoiceNumber ??
                            allocation.purchaseInvoice?.invoiceNumber ??
                            '—'}
                        </p>
                        <p className="text-[11px] capitalize text-slate-400">
                          {allocation.invoiceType} invoice
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-800">
                        {formatCurrency(allocation.allocatedAmount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
