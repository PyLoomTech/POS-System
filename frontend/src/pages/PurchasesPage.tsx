import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import { formatCurrency, formatDate, formatNumber, toNumber } from '@/lib/utils'
import type { Item, Paginated, Supplier, TaxRate } from '@/types'

// The backend exposes no warehouse list endpoint — use the seeded default store.
const DEFAULT_WAREHOUSE_ID = 1

interface PurchaseInvoiceRow {
  id: string | number
  invoiceNumber: string
  supplierInvoiceRef: string | null
  supplierId: number
  invoiceDate: string
  dueDate: string | null
  subtotal: string
  taxAmount: string
  grandTotal: string
  paidAmount: string
  outstandingAmount: string
  status: string
  notes: string | null
  supplier: { id: number; name: string }
}

interface PurchaseInvoiceLine {
  id: string | number
  itemId: number
  quantity: string
  unitCost: string
  discountPct: string
  taxType: string | null
  taxRate: string
  taxAmount: string
  lineTotal: string
  item: {
    id: number
    name: string
    itemCode: string
    unit: { id: number; name: string; abbreviation: string | null } | null
  } | null
}

interface PurchaseInvoiceDetail extends PurchaseInvoiceRow {
  items: PurchaseInvoiceLine[]
}

interface DraftLine {
  key: string
  itemId: number | null
  name: string
  itemCode: string
  quantity: string
  unitCost: string
  discountPct: string
  taxType: string
  taxRate: number
  taxRateId: number | null
}

interface PickerSelection {
  id: number
  name: string
  itemCode: string
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'digital_wallet', label: 'Digital wallet' },
  { value: 'qr', label: 'QR / Fonepay' },
  { value: 'split', label: 'Split' },
]

function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function statusTone(status: string): 'green' | 'red' | 'amber' | 'slate' {
  switch (status) {
    case 'confirmed':
      return 'green'
    case 'draft':
      return 'slate'
    case 'cancelled':
      return 'red'
    case 'returned':
      return 'amber'
    default:
      return 'slate'
  }
}

function statusLabel(status: string): string {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : '—'
}

function emptyLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    itemId: null,
    name: '',
    itemCode: '',
    quantity: '1',
    unitCost: '0',
    discountPct: '0',
    taxType: 'taxable_exclusive',
    taxRate: 0,
    taxRateId: null,
  }
}

function computeLine(line: DraftLine) {
  const qty = toNumber(line.quantity)
  const price = toNumber(line.unitCost)
  const discPct = toNumber(line.discountPct)
  const rate = line.taxRate
  const gross = qty * price
  const discount = (gross * discPct) / 100
  const base = gross - discount
  switch (line.taxType) {
    case 'taxable_inclusive': {
      const tax = rate > 0 ? (base * rate) / (100 + rate) : 0
      return { base, taxable: base - tax, tax, nonTaxable: 0, lineTotal: base }
    }
    case 'non_taxable':
    case 'zero_rated':
    case 'exempt':
      return { base, taxable: 0, tax: 0, nonTaxable: base, lineTotal: base }
    default:
      return {
        base,
        taxable: base,
        tax: (base * rate) / 100,
        nonTaxable: 0,
        lineTotal: base + (base * rate) / 100,
      }
  }
}

function ItemPicker({
  selected,
  onSelect,
}: {
  selected: PickerSelection | null
  onSelect: (item: Item | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setResults([])
      setOpen(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get<Item[]>(
          `/items/search?q=${encodeURIComponent(term)}&limit=20`,
        )
        if (!cancelled) {
          setResults(data)
          setOpen(true)
        }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  if (selected && !query) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-800">{selected.name}</p>
          <p className="font-mono text-[11px] text-slate-400">{selected.itemCode}</p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <Input
          className="pl-8"
          placeholder="Search item by name or code…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true)
          }}
        />
      </div>
      {open && (
        <div className="mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">No items found.</p>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item)
                  setQuery('')
                  setResults([])
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-800">{item.name}</span>
                  <span className="block font-mono text-[11px] text-slate-400">
                    {item.itemCode}
                  </span>
                </span>
                <span className="whitespace-nowrap text-xs text-slate-500">
                  {formatCurrency(item.purchasePrice)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function PurchasesPage() {
  const today = useMemo(() => new Date(), [])
  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today])

  // ── List filters ────────────────────────────────────────────
  const [from, setFrom] = useState(isoDate(monthStart))
  const [to, setTo] = useState(isoDate(today))
  const [supplierFilter, setSupplierFilter] = useState('')
  const [applied, setApplied] = useState({
    from: isoDate(monthStart),
    to: isoDate(today),
    supplier: '',
  })

  const listUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (applied.from) params.set('from', applied.from)
    if (applied.to) params.set('to', applied.to)
    if (applied.supplier) params.set('supplier', applied.supplier)
    params.set('limit', '100')
    return `/purchases?${params.toString()}`
  }, [applied])

  const { data, loading, error, reload } = useFetch<Paginated<PurchaseInvoiceRow>>(listUrl)
  const { data: suppliers } = useFetch<Paginated<Supplier>>('/suppliers?limit=100')
  const { data: taxRates } = useFetch<TaxRate[]>('/items/tax-rates')

  const invoices = data?.data ?? []

  // ── New purchase modal ──────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [supplierInvoiceRef, setSupplierInvoiceRef] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(isoDate(today))
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [paidAmount, setPaidAmount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // ── View invoice modal ──────────────────────────────────────
  const [viewOpen, setViewOpen] = useState(false)
  const [viewDetail, setViewDetail] = useState<PurchaseInvoiceDetail | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)

  function openCreate() {
    setSupplierId('')
    setSupplierInvoiceRef('')
    setInvoiceDate(isoDate(new Date()))
    setDueDate('')
    setNotes('')
    setLines([emptyLine()])
    setPaidAmount('0')
    setPaymentMethod('cash')
    setFormError(null)
    setOpen(true)
  }

  function resolveTax(item: Item) {
    const list = taxRates ?? []
    const matched = list.find((rate) => rate.id === item.taxRateId)
    const fallback = list.find((rate) => rate.isDefault)
    const chosen = matched ?? fallback
    const isTaxable = !['non_taxable', 'zero_rated', 'exempt'].includes(item.taxType)
    return {
      taxRate: isTaxable ? chosen?.rate ?? 0 : 0,
      taxRateId: isTaxable ? chosen?.id ?? null : null,
    }
  }

  function selectItem(key: string, item: Item | null) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line
        if (!item) return { ...line, itemId: null, name: '', itemCode: '' }
        const { taxRate, taxRateId } = resolveTax(item)
        return {
          ...line,
          itemId: item.id,
          name: item.name,
          itemCode: item.itemCode,
          unitCost: String(toNumber(item.purchasePrice)),
          taxType: item.taxType,
          taxRate,
          taxRateId,
        }
      }),
    )
  }

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key))
  }

  const totals = useMemo(() => {
    let subtotal = 0
    let tax = 0
    for (const line of lines) {
      const calc = computeLine(line)
      subtotal += calc.taxable + calc.nonTaxable
      tax += calc.tax
    }
    return { subtotal, tax, grandTotal: subtotal + tax }
  }, [lines])

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    if (!supplierId) {
      setFormError('Select a supplier.')
      return
    }
    const validLines = lines.filter(
      (line) => line.itemId !== null && toNumber(line.quantity) > 0,
    )
    if (validLines.length === 0) {
      setFormError('Add at least one item line.')
      return
    }
    setSaving(true)
    try {
      await api.post('/purchases', {
        supplierId: Number(supplierId),
        supplierInvoiceRef: supplierInvoiceRef.trim() || null,
        invoiceDate,
        dueDate: dueDate || null,
        warehouseId: DEFAULT_WAREHOUSE_ID,
        notes: notes.trim() || undefined,
        paidAmount: toNumber(paidAmount),
        paymentMethod,
        items: validLines.map((line) => ({
          itemId: line.itemId,
          quantity: toNumber(line.quantity),
          unitCost: toNumber(line.unitCost),
          discountPct: toNumber(line.discountPct),
          taxType: line.taxType,
          taxRate: line.taxRate,
          taxRateId: line.taxRateId,
        })),
      })
      setOpen(false)
      reload()
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
      const { data: detail } = await api.get<PurchaseInvoiceDetail>(`/purchases/${id}`)
      setViewDetail(detail)
    } catch (err) {
      setViewError(getErrorMessage(err))
    } finally {
      setViewLoading(false)
    }
  }

  const columns: Column<PurchaseInvoiceRow>[] = [
    {
      header: 'Invoice #',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.invoiceNumber}</p>
          <p className="text-[11px] text-slate-400">{row.supplierInvoiceRef ?? 'No supplier ref'}</p>
        </div>
      ),
    },
    {
      header: 'Date',
      cell: (row) => <span className="whitespace-nowrap">{formatDate(row.invoiceDate)}</span>,
    },
    { header: 'Supplier', cell: (row) => row.supplier?.name ?? '—' },
    {
      header: 'Total',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-slate-800">{formatCurrency(row.grandTotal)}</span>
      ),
    },
    {
      header: 'Paid',
      align: 'right',
      cell: (row) => formatCurrency(row.paidAmount),
    },
    {
      header: 'Outstanding',
      align: 'right',
      cell: (row) => {
        const outstanding = toNumber(row.outstandingAmount)
        return (
          <span className={outstanding > 0 ? 'font-medium text-red-600' : 'text-slate-500'}>
            {formatCurrency(outstanding)}
          </span>
        )
      },
    },
    {
      header: 'Status',
      align: 'center',
      cell: (row) => <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-800">Purchases</h1>
        <Button icon={<Plus size={16} />} onClick={openCreate}>
          New Purchase
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Field label="Supplier">
            <Select
              value={supplierFilter}
              onChange={(event) => setSupplierFilter(event.target.value)}
            >
              <option value="">All suppliers</option>
              {(suppliers?.data ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              className="flex-1"
              onClick={() => setApplied({ from, to, supplier: supplierFilter })}
            >
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const start = isoDate(new Date(today.getFullYear(), today.getMonth(), 1))
                const end = isoDate(new Date())
                setFrom(start)
                setTo(end)
                setSupplierFilter('')
                setApplied({ from: start, to: end, supplier: '' })
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={invoices}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No purchase invoices"
          emptyDescription="Record a purchase to bring stock into inventory."
        />
      </Card>

      <Modal
        open={open}
        title="New Purchase"
        size="lg"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="purchase-form" loading={saving}>
              Save Purchase
            </Button>
          </>
        }
      >
        <form id="purchase-form" onSubmit={submitPurchase} className="space-y-5">
          {formError && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Supplier" required>
              <Select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                required
              >
                <option value="">— Select —</option>
                {(suppliers?.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier invoice ref">
              <Input
                value={supplierInvoiceRef}
                onChange={(event) => setSupplierInvoiceRef(event.target.value)}
                placeholder="Supplier's own invoice number"
              />
            </Field>
            <Field label="Invoice date" required>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                required
              />
            </Field>
            <Field label="Due date">
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes for this purchase"
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Items
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                Add line
              </Button>
            </div>

            <div className="space-y-3 px-4 py-3">
              {lines.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-400">
                  No lines yet. Click “Add line” to begin.
                </p>
              ) : (
                lines.map((line) => {
                  const calc = computeLine(line)
                  return (
                    <div
                      key={line.key}
                      className="grid grid-cols-12 items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3"
                    >
                      <div className="col-span-12 sm:col-span-4">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">
                          Item
                        </span>
                        <ItemPicker
                          selected={line.itemId ? { id: line.itemId, name: line.name, itemCode: line.itemCode } : null}
                          onSelect={(item) => selectItem(line.key, item)}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">Qty</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.quantity}
                          onChange={(event) => patchLine(line.key, { quantity: event.target.value })}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">
                          Unit cost
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unitCost}
                          onChange={(event) => patchLine(line.key, { unitCost: event.target.value })}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-1">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">
                          Disc %
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={line.discountPct}
                          onChange={(event) =>
                            patchLine(line.key, { discountPct: event.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-12 flex items-center justify-between gap-2 sm:col-span-3">
                        <span className="ml-auto text-sm font-semibold text-slate-800">
                          {formatCurrency(calc.lineTotal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove line"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_240px]">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Paid amount">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paidAmount}
                  onChange={(event) => setPaidAmount(event.target.value)}
                />
              </Field>
              <Field label="Payment method">
                <Select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                >
                  {PAYMENT_METHODS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <dl className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
              <div className="flex justify-between text-slate-500">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>Tax</dt>
                <dd>{formatCurrency(totals.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                <dt>Grand total</dt>
                <dd>{formatCurrency(totals.grandTotal)}</dd>
              </div>
              {toNumber(paidAmount) > 0 && (
                <div className="flex justify-between text-xs text-red-600">
                  <dt>Outstanding</dt>
                  <dd>{formatCurrency(Math.max(0, totals.grandTotal - toNumber(paidAmount)))}</dd>
                </div>
              )}
            </dl>
          </div>
        </form>
      </Modal>

      <Modal
        open={viewOpen}
        title={viewDetail ? `Purchase ${viewDetail.invoiceNumber}` : 'Purchase Invoice'}
        size="lg"
        onClose={() => setViewOpen(false)}
        footer={
          <Button variant="outline" onClick={() => setViewOpen(false)}>
            Close
          </Button>
        }
      >
        {viewLoading ? (
          <Spinner label="Loading invoice…" />
        ) : viewError ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{viewError}</p>
        ) : viewDetail ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">{viewDetail.supplier?.name}</p>
                <p className="text-xs text-slate-500">
                  {formatDate(viewDetail.invoiceDate)}
                  {viewDetail.dueDate ? ` · Due ${formatDate(viewDetail.dueDate)}` : ''}
                </p>
                {viewDetail.supplierInvoiceRef && (
                  <p className="text-xs text-slate-400">Ref: {viewDetail.supplierInvoiceRef}</p>
                )}
              </div>
              <Badge tone={statusTone(viewDetail.status)}>{statusLabel(viewDetail.status)}</Badge>
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
                      Unit cost
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
                  {viewDetail.items.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <p className="text-slate-800">{line.item?.name ?? `Item #${line.itemId}`}</p>
                        <p className="font-mono text-[11px] text-slate-400">
                          {line.item?.itemCode ?? ''}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right">{formatNumber(line.quantity, 2)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(line.unitCost)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(line.taxAmount)}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">
                        {formatCurrency(line.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-500">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(viewDetail.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>Tax</dt>
                <dd>{formatCurrency(viewDetail.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900">
                <dt>Grand total</dt>
                <dd>{formatCurrency(viewDetail.grandTotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>Paid</dt>
                <dd>{formatCurrency(viewDetail.paidAmount)}</dd>
              </div>
              {toNumber(viewDetail.outstandingAmount) > 0 && (
                <div className="flex justify-between text-red-600">
                  <dt>Outstanding</dt>
                  <dd>{formatCurrency(viewDetail.outstandingAmount)}</dd>
                </div>
              )}
            </dl>

            {viewDetail.notes && (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {viewDetail.notes}
              </p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
