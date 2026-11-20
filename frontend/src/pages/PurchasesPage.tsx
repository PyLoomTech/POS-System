import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FeedList, initials } from '@/components/ui/FeedList'
import type { FeedColumn } from '@/components/ui/FeedList'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { DateRangePresets } from '@/components/ui/DateRangePresets'
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
  unitId?: number | null
  conversionFactor?: string
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
    unitConversions?: Item['unitConversions']
  } | null
  unit?: { id: number; name: string; abbreviation: string | null } | null
}

interface PurchaseInvoiceDetail extends PurchaseInvoiceRow {
  items: PurchaseInvoiceLine[]
}

interface DraftLine {
  key: string
  itemId: number | null
  name: string
  itemCode: string
  unitId: number | null
  unitLabel: string
  conversionFactor: number
  basePurchasePrice: string
  units: Array<{ id: number; name: string; abbreviation: string | null; factor: number }>
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
    unitId: null,
    unitLabel: '',
    conversionFactor: 1,
    basePurchasePrice: '0',
    units: [],
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
      <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{selected.name}</p>
          <p className="font-mono text-[11px] text-ink-3">{selected.itemCode}</p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="shrink-0 text-xs font-medium text-accent hover:underline"
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
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
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
        <div className="mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-white shadow-sm">
          {loading ? (
            <p className="px-3 py-2 text-xs text-ink-3">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink-3">No items found.</p>
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
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-line-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{item.name}</span>
                  <span className="block font-mono text-[11px] text-ink-3">{item.itemCode}</span>
                </span>
                <span className="whitespace-nowrap text-xs text-ink-3">
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedInvoiceId = searchParams.get('invoiceId')
  const openedInvoiceRef = useRef<string | null>(null)
  const today = useMemo(() => new Date(), [])
  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today])

  // ── List filters ────────────────────────────────────────────
  const [from, setFrom] = useState(isoDate(monthStart))
  const [to, setTo] = useState(isoDate(today))
  const [supplierFilter, setSupplierFilter] = useState('')

  const listUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (supplierFilter) params.set('supplier', supplierFilter)
    params.set('limit', '100')
    return `/purchases?${params.toString()}`
  }, [from, to, supplierFilter])

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
        if (!item) {
          return {
            ...line,
            itemId: null,
            name: '',
            itemCode: '',
            unitId: null,
            unitLabel: '',
            conversionFactor: 1,
            basePurchasePrice: '0',
            units: [],
          }
        }
        const { taxRate, taxRateId } = resolveTax(item)
        return {
          ...line,
          itemId: item.id,
          name: item.name,
          itemCode: item.itemCode,
          unitId: item.unit?.id ?? null,
          unitLabel: item.unit?.abbreviation || item.unit?.name || '',
          conversionFactor: 1,
          basePurchasePrice: String(toNumber(item.purchasePrice)),
          units: [
            ...(item.unit ? [{
              id: item.unit.id,
              name: item.unit.name,
              abbreviation: item.unit.abbreviation,
              factor: 1,
            }] : []),
            ...(item.unitConversions ?? []).map((conversion) => ({
              ...conversion.unit,
              factor: toNumber(conversion.factor),
            })),
          ],
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
          unitId: line.unitId ?? undefined,
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

  useEffect(() => {
    if (linkedInvoiceId && linkedInvoiceId !== openedInvoiceRef.current) {
      openedInvoiceRef.current = linkedInvoiceId
      void openView(linkedInvoiceId)
    }
  }, [linkedInvoiceId])

  function closeView() {
    setViewOpen(false)
    if (linkedInvoiceId) {
      const next = new URLSearchParams(searchParams)
      next.delete('invoiceId')
      setSearchParams(next, { replace: true })
      openedInvoiceRef.current = null
    }
  }

  const columns: FeedColumn<PurchaseInvoiceRow>[] = [
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
      cell: (row) => <span className="fv text-ink-2">{formatCurrency(row.paidAmount)}</span>,
    },
    {
      header: 'Outstanding',
      width: '140px',
      align: 'right',
      cell: (row) => {
        const outstanding = toNumber(row.outstandingAmount)
        return (
          <span className={outstanding > 0 ? 'fv font-medium text-brand-crimson' : 'fv text-ink-3'}>
            {formatCurrency(outstanding)}
          </span>
        )
      },
    },
    {
      header: 'Status',
      width: '120px',
      align: 'center',
      cell: (row) => <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>,
    },
  ]

  return (
    <div className="space-y-4">
      <FeedList
        rows={invoices}
        rowKey={(row) => row.id}
        columns={columns}
        lead={(row) => initials(row.supplier?.name ?? 'Supplier')}
        title={(row) => row.invoiceNumber}
        subtitle={(row) =>
          row.supplierInvoiceRef
            ? `${row.supplier?.name ?? '—'} · ${row.supplierInvoiceRef}`
            : row.supplier?.name ?? '—'
        }
        onRowClick={(row) => void openView(row.id)}
        rowAction={(row) => (
          <Button
            variant="outline"
            size="sm"
            icon={<Eye size={14} />}
            onClick={() => void openView(row.id)}
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
        emptyTitle="No purchase invoices"
        emptyDescription="Record a purchase to bring stock into inventory."
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
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
            <div className="ml-auto flex items-end gap-2">
              <DateRangePresets
                from={from}
                to={to}
                onPick={(range) => {
                  setFrom(range.from)
                  setTo(range.to)
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFrom(isoDate(new Date(today.getFullYear(), today.getMonth(), 1)))
                  setTo(isoDate(new Date()))
                  setSupplierFilter('')
                }}
              >
                Clear
              </Button>
              <Button icon={<Plus size={16} />} onClick={openCreate}>
                New Purchase
              </Button>
            </div>
          </div>
        }
      />

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
            <div className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">
              {formError}
            </div>
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

          <div className="rounded-2xl border border-line">
            <div className="flex items-center justify-between border-b border-line-2 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
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
                <p className="py-2 text-center text-xs text-ink-3">
                  No lines yet. Click “Add line” to begin.
                </p>
              ) : (
                lines.map((line) => {
                  const calc = computeLine(line)
                  return (
                    <div
                      key={line.key}
                      className="grid grid-cols-2 items-end gap-2 rounded-xl border border-line bg-line-2/50 p-3 sm:grid-cols-12"
                    >
                      <div className="col-span-2 sm:col-span-3">
                        <span className="mb-1 block text-[11px] font-medium text-ink-3">
                          Item
                        </span>
                        <ItemPicker
                          selected={line.itemId ? { id: line.itemId, name: line.name, itemCode: line.itemCode } : null}
                          onSelect={(item) => selectItem(line.key, item)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-medium text-ink-3">UOM</span>
                        <Select
                          value={line.unitId ?? ''}
                          disabled={line.units.length < 2}
                          onChange={(event) => {
                            const selected = line.units.find((unit) => unit.id === Number(event.target.value))
                            if (!selected) return
                            patchLine(line.key, {
                              unitId: selected.id,
                              unitLabel: selected.abbreviation || selected.name,
                              conversionFactor: selected.factor,
                              unitCost: String(toNumber(line.basePurchasePrice) * selected.factor),
                            })
                          }}
                        >
                          {line.units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.name}{unit.factor !== 1 ? ` (${unit.factor} base units)` : ''}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-medium text-ink-3">
                          Qty ({line.unitLabel || 'unit'})
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.quantity}
                          onChange={(event) => patchLine(line.key, { quantity: event.target.value })}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-medium text-ink-3">
                          Cost / {line.unitLabel || 'unit'}
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unitCost}
                          onChange={(event) => patchLine(line.key, { unitCost: event.target.value })}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-1">
                        <span className="mb-1 block text-[11px] font-medium text-ink-3">
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
                      <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-2">
                        {line.conversionFactor !== 1 && (
                          <span className="mr-auto text-[11px] text-ink-3">
                            {formatNumber(line.quantity, 2)} {line.unitLabel} ={' '}
                            {formatNumber(toNumber(line.quantity) * line.conversionFactor, 2)} Pcs
                          </span>
                        )}
                        <span className="ml-auto text-sm font-semibold text-ink">
                          {formatCurrency(calc.lineTotal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="rounded-lg p-1.5 text-ink-3 hover:bg-[#f9e4e7] hover:text-brand-crimson"
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
            <dl className="space-y-1.5 rounded-2xl border border-line bg-line-2/60 p-4 text-sm">
              <div className="flex justify-between text-ink-3">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-3">
                <dt>Tax</dt>
                <dd>{formatCurrency(totals.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                <dt>Grand total</dt>
                <dd>{formatCurrency(totals.grandTotal)}</dd>
              </div>
              {toNumber(paidAmount) > 0 && (
                <div className="flex justify-between text-xs text-brand-crimson">
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
        onClose={closeView}
        footer={
          <>
            {viewDetail && viewDetail.status !== 'cancelled' && (
              <Button
                variant="outline"
                onClick={() =>
                  navigate(
                    `/returns?tab=purchases&purchaseInvoiceId=${encodeURIComponent(String(viewDetail.id))}`,
                  )
                }
              >
                Return items
              </Button>
            )}
            <Button variant="outline" onClick={closeView}>
              Close
            </Button>
          </>
        }
      >
        {viewLoading ? (
          <Spinner label="Loading invoice…" />
        ) : viewError ? (
          <p className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">{viewError}</p>
        ) : viewDetail ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">{viewDetail.supplier?.name}</p>
                <p className="text-xs text-ink-3">
                  {formatDate(viewDetail.invoiceDate)}
                  {viewDetail.dueDate ? ` · Due ${formatDate(viewDetail.dueDate)}` : ''}
                </p>
                {viewDetail.supplierInvoiceRef && (
                  <p className="text-xs text-ink-3">Ref: {viewDetail.supplierInvoiceRef}</p>
                )}
              </div>
              <Badge tone={statusTone(viewDetail.status)}>{statusLabel(viewDetail.status)}</Badge>
            </div>

            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-3 py-2 text-left text-[12.5px] font-medium text-ink-3">Item</th>
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Qty</th>
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Unit cost</th>
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Tax</th>
                    <th className="px-3 py-2 text-right text-[12.5px] font-medium text-ink-3">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewDetail.items.map((line) => (
                    <tr key={line.id} className="border-t border-line-2">
                      <td className="px-3 py-2">
                        <p className="text-ink">{line.item?.name ?? `Item #${line.itemId}`}</p>
                        <p className="font-mono text-[11px] text-ink-3">
                          {line.item?.itemCode ?? ''}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right text-ink-2">
                        {formatNumber(line.quantity, 2)} {line.unit?.abbreviation || line.unit?.name || line.item?.unit?.abbreviation || line.item?.unit?.name || ''}
                      </td>
                      <td className="px-3 py-2 text-right text-ink-2">{formatCurrency(line.unitCost)}</td>
                      <td className="px-3 py-2 text-right text-ink-2">{formatCurrency(line.taxAmount)}</td>
                      <td className="px-3 py-2 text-right font-medium text-ink">
                        {formatCurrency(line.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-ink-3">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(viewDetail.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-3">
                <dt>Tax</dt>
                <dd>{formatCurrency(viewDetail.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold text-ink">
                <dt>Grand total</dt>
                <dd>{formatCurrency(viewDetail.grandTotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-3">
                <dt>Paid</dt>
                <dd>{formatCurrency(viewDetail.paidAmount)}</dd>
              </div>
              {toNumber(viewDetail.outstandingAmount) > 0 && (
                <div className="flex justify-between text-brand-crimson">
                  <dt>Outstanding</dt>
                  <dd>{formatCurrency(viewDetail.outstandingAmount)}</dd>
                </div>
              )}
            </dl>

            {viewDetail.notes && (
              <p className="rounded-xl bg-line-2 px-3 py-2 text-xs text-ink-2">
                {viewDetail.notes}
              </p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
