import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Banknote,
  Barcode,
  ImagePlus,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import {
  buildPaymentQrPayload,
  cn,
  formatCurrency,
  formatDate,
  formatNumber,
  toNumber,
} from '@/lib/utils'
import type {
  CompanySettings,
  Customer,
  Item,
  Paginated,
  SalesInvoiceDetail,
  TaxRate,
  WalkinCustomer,
} from '@/types'

interface CartLine {
  itemId: number
  name: string
  itemCode: string
  unitPrice: number
  quantity: number
  discountPct: number
  taxType: string
  taxRate: number
  taxRateId: number | null
  stock: number
  imageUrl: string | null
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'qr', label: 'QR / Fonepay' },
  { value: 'digital_wallet', label: 'Digital wallet' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'credit', label: 'Credit (on account)' },
]

interface CustomerForm {
  name: string
  phone: string
  email: string
  address: string
  panVatNumber: string
  creditLimit: string
}

const EMPTY_CUSTOMER: CustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  panVatNumber: '',
  creditLimit: '0',
}

function imageSrc(value: string | null | undefined): string {
  if (!value) return ''
  if (/^(https?:|data:|blob:|\/)/.test(value)) return value
  return `/${value}`
}

function stockOf(item: Item): number {
  return item.stockBalances.reduce((sum, balance) => sum + toNumber(balance.quantity), 0)
}

function computeLine(line: CartLine) {
  const gross = line.quantity * line.unitPrice
  const discount = (gross * line.discountPct) / 100
  const base = gross - discount
  const rate = line.taxRate
  switch (line.taxType) {
    case 'taxable_inclusive': {
      const tax = rate > 0 ? (base * rate) / (100 + rate) : 0
      return { discount, base, taxable: base - tax, tax, nonTaxable: 0, lineTotal: base }
    }
    case 'non_taxable':
    case 'zero_rated':
    case 'exempt':
      return { discount, base, taxable: 0, tax: 0, nonTaxable: base, lineTotal: base }
    default:
      return {
        discount,
        base,
        taxable: base,
        tax: (base * rate) / 100,
        nonTaxable: 0,
        lineTotal: base + (base * rate) / 100,
      }
  }
}

export function PosPage() {
  const [search, setSearch] = useState('')
  const [catalogue, setCatalogue] = useState<Item[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [scanValue, setScanValue] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const [lines, setLines] = useState<CartLine[]>([])
  const [invoiceDiscount, setInvoiceDiscount] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [method, setMethod] = useState('cash')
  const [tendered, setTendered] = useState('')
  const [qrOpen, setQrOpen] = useState(false)

  const [charging, setCharging] = useState(false)
  const [chargeError, setChargeError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<SalesInvoiceDetail | null>(null)

  const { data: taxRates } = useFetch<TaxRate[]>('/items/tax-rates')
  const { data: walkin } = useFetch<WalkinCustomer>('/customers/walk-in')
  const { data: customers, reload: reloadCustomers } = useFetch<Paginated<Customer>>(
    '/customers?limit=100',
  )
  const { data: company } = useFetch<CompanySettings>('/settings/company')

  const [customerOpen, setCustomerOpen] = useState(false)
  const [customerForm, setCustomerForm] = useState<CustomerForm>(EMPTY_CUSTOMER)
  const [customerSaving, setCustomerSaving] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)

  useEffect(() => {
    if (walkin && !customerId) setCustomerId(String(walkin.id))
  }, [walkin, customerId])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoadingItems(true)
      try {
        if (search.trim()) {
          const { data } = await api.get<Item[]>(
            `/items/search?q=${encodeURIComponent(search.trim())}&limit=48`,
          )
          if (!cancelled) setCatalogue(data)
        } else {
          const { data } = await api.get<Paginated<Item>>('/items?limit=48&active=true')
          if (!cancelled) setCatalogue(data.data)
        }
      } catch {
        if (!cancelled) setCatalogue([])
      } finally {
        if (!cancelled) setLoadingItems(false)
      }
    }, search ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search, refreshKey])

  function resolveTax(item: Item, rates: TaxRate[] | null) {
    const list = rates ?? []
    const matched = list.find((rate) => rate.id === item.taxRateId)
    const fallback = list.find((rate) => rate.isDefault)
    const chosen = matched ?? fallback
    const isTaxable = !['non_taxable', 'zero_rated', 'exempt'].includes(item.taxType)
    return {
      taxRate: isTaxable ? chosen?.rate ?? 0 : 0,
      taxRateId: isTaxable ? chosen?.id ?? null : null,
    }
  }

  function addItem(item: Item) {
    const { taxRate, taxRateId } = resolveTax(item, taxRates)
    setNotice(null)
    setLines((prev) => {
      const existing = prev.find((line) => line.itemId === item.id)
      if (existing) {
        return prev.map((line) =>
          line.itemId === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          itemCode: item.itemCode,
          unitPrice: toNumber(item.sellingPrice),
          quantity: 1,
          discountPct: 0,
          taxType: item.taxType,
          taxRate,
          taxRateId,
          stock: stockOf(item),
          imageUrl: item.imageUrl,
        },
      ]
    })
  }

  function patchLine(itemId: number, patch: Partial<CartLine>) {
    setLines((prev) => prev.map((line) => (line.itemId === itemId ? { ...line, ...patch } : line)))
  }

  function removeLine(itemId: number) {
    setLines((prev) => prev.filter((line) => line.itemId !== itemId))
  }

  async function onScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = scanValue.trim()
    if (!code) return
    try {
      const { data } = await api.get<Item>(`/items/barcode/${encodeURIComponent(code)}`)
      addItem(data)
      setScanValue('')
    } catch {
      if (catalogue.length === 1) {
        addItem(catalogue[0])
        setScanValue('')
      } else {
        setNotice(`No item matched barcode “${code}”.`)
      }
    }
  }

  function openCustomer() {
    setCustomerForm(EMPTY_CUSTOMER)
    setCustomerError(null)
    setCustomerOpen(true)
  }

  function patchCustomer<K extends keyof CustomerForm>(key: K, value: string) {
    setCustomerForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCustomerError(null)
    if (!customerForm.name.trim()) {
      setCustomerError('Customer name is required.')
      return
    }
    setCustomerSaving(true)
    try {
      const { data } = await api.post<Customer>('/customers', {
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim() || null,
        email: customerForm.email.trim() || null,
        address: customerForm.address.trim() || null,
        panVatNumber: customerForm.panVatNumber.trim() || null,
        creditLimit: toNumber(customerForm.creditLimit),
      })
      await reloadCustomers()
      setCustomerId(String(data.id))
      setCustomerOpen(false)
      setCustomerForm(EMPTY_CUSTOMER)
    } catch (err) {
      setCustomerError(getErrorMessage(err))
    } finally {
      setCustomerSaving(false)
    }
  }

  const totals = useMemo(() => {
    let subtotal = 0
    let lineDiscount = 0
    let taxable = 0
    let tax = 0
    let nonTaxable = 0
    for (const line of lines) {
      const calc = computeLine(line)
      subtotal += calc.base
      lineDiscount += calc.discount
      taxable += calc.taxable
      tax += calc.tax
      nonTaxable += calc.nonTaxable
    }
    let grandTotal = taxable + tax + nonTaxable
    let discountAmount = lineDiscount
    const extraDiscount = toNumber(invoiceDiscount)
    if (extraDiscount > 0 && grandTotal > 0) {
      const applied = Math.min(extraDiscount, grandTotal)
      const factor = (grandTotal - applied) / grandTotal
      taxable *= factor
      nonTaxable *= factor
      tax *= factor
      discountAmount += applied
      grandTotal -= applied
    }
    return { subtotal, discountAmount, taxable, tax, nonTaxable, grandTotal }
  }, [lines, invoiceDiscount])

  const isCredit = method === 'credit'
  const tenderedNumber = toNumber(tendered)

  // Reference shown beneath the demo QR. Kept deterministic so it stays stable
  // while the bill is unchanged — the real Fonepay API issues its own
  // transaction reference once merchant credentials are wired up.
  const qrReference = `POS-${totals.grandTotal.toFixed(2)}`

  const qrPayload = buildPaymentQrPayload({
    amount: totals.grandTotal,
    reference: qrReference,
    merchantName: company?.companyName,
    currency: company?.currencyCode,
  })

  const change = method === 'cash' ? Math.max(0, tenderedNumber - totals.grandTotal) : 0
  const canCharge =
    lines.length > 0 &&
    customerId !== '' &&
    !charging &&
    (!isCredit && method === 'cash' ? tenderedNumber >= totals.grandTotal : true)

  async function onCharge() {
    setChargeError(null)
    setNotice(null)
    setCharging(true)
    try {
      const payload = {
        customerId: Number(customerId),
        isCredit,
        invoiceDiscount: toNumber(invoiceDiscount),
        idempotencyKey: crypto.randomUUID(),
        items: lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPct: line.discountPct,
          taxType: line.taxType,
          taxRate: line.taxRate,
          taxRateId: line.taxRateId,
        })),
        payments: isCredit
          ? []
          : [
              {
                method,
                amount: Number(totals.grandTotal.toFixed(2)),
                ...(method === 'cash' ? { cashTendered: tenderedNumber } : {}),
              },
            ],
      }
      const { data } = await api.post<SalesInvoiceDetail>('/sales', payload)
      setReceipt(data)
      setQrOpen(false)
      setLines([])
      setInvoiceDiscount('')
      setTendered('')
      setMethod('cash')
      // Re-pull the catalogue so the on-hand stock badges reflect the sale.
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setChargeError(getErrorMessage(err))
    } finally {
      setCharging(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* ── Catalogue ─────────────────────────────────────── */}
      <div className="space-y-4">
        <Card className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                className="pl-9"
                placeholder="Search items by name, code or barcode…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <form className="flex gap-2" onSubmit={onScan}>
              <div className="relative">
                <Barcode
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  className="w-52 pl-9"
                  placeholder="Scan barcode"
                  value={scanValue}
                  onChange={(event) => setScanValue(event.target.value)}
                />
              </div>
              <Button type="submit" variant="outline">
                Add
              </Button>
            </form>
          </div>
          {notice && <p className="mt-2 text-xs text-amber-600">{notice}</p>}
        </Card>

        {loadingItems ? (
          <Card>
            <Spinner label="Loading catalogue…" />
          </Card>
        ) : catalogue.length === 0 ? (
          <Card className="py-16 text-center">
            <p className="text-sm font-medium text-slate-700">No items found</p>
            <p className="mt-1 text-xs text-slate-500">
              Add products under Items, then come back to bill them.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {catalogue.map((item) => {
              const stock = stockOf(item)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addItem(item)}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                  <div className="flex h-28 items-center justify-center bg-slate-50">
                    {item.imageUrl ? (
                      <img
                        src={imageSrc(item.imageUrl)}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImagePlus size={22} className="text-slate-300" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium text-slate-800">{item.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{item.itemCode}</p>
                    <div className="mt-auto flex items-center justify-between pt-1">
                      <span className="text-sm font-semibold text-blue-600">
                        {formatCurrency(item.sellingPrice)}
                      </span>
                      <Badge tone={stock > 0 ? 'green' : 'red'}>
                        {stock > 0 ? formatNumber(stock, 0) : '0'}
                      </Badge>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Cart ──────────────────────────────────────────── */}
      <Card className="flex h-fit flex-col lg:sticky lg:top-24">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart size={17} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-800">Current Bill</h2>
          </div>
          {lines.length > 0 && (
            <button
              type="button"
              onClick={() => setLines([])}
              className="text-xs font-medium text-slate-400 hover:text-red-600"
            >
              Clear
            </button>
          )}
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Customer">
            <div className="flex gap-2">
              <Select
                className="flex-1"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                {walkin && <option value={walkin.id}>{walkin.name}</option>}
                {(customers?.data ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={openCustomer}
                icon={<UserPlus size={16} />}
                title="Add a new customer"
              >
                New
              </Button>
            </div>
          </Field>

          {lines.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
              <p className="text-sm text-slate-500">Cart is empty</p>
              <p className="mt-1 text-xs text-slate-400">Click an item to start a bill.</p>
            </div>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {lines.map((line) => {
                const calc = computeLine(line)
                return (
                  <li key={line.itemId} className="rounded-2xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{line.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {formatCurrency(line.unitPrice)} · stock {formatNumber(line.stock, 0)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(line.itemId)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove ${line.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            line.quantity > 1
                              ? patchLine(line.itemId, { quantity: line.quantity - 1 })
                              : removeLine(line.itemId)
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={13} />
                        </button>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={(event) =>
                            patchLine(line.itemId, {
                              quantity: Math.max(toNumber(event.target.value), 0.01),
                            })
                          }
                          className="h-7 w-14 rounded-lg border border-slate-300 px-2 text-center text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => patchLine(line.itemId, { quantity: line.quantity + 1 })}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                          aria-label="Increase quantity"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={line.discountPct}
                          onChange={(event) =>
                            patchLine(line.itemId, {
                              discountPct: Math.min(toNumber(event.target.value), 100),
                            })
                          }
                          className="h-7 w-14 rounded-lg border border-slate-300 px-2 text-center text-xs"
                          aria-label="Line discount percent"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <span className="w-20 text-right text-sm font-semibold text-slate-800">
                        {formatCurrency(calc.lineTotal)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-slate-100 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">Invoice discount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={invoiceDiscount}
              onChange={(event) => setInvoiceDiscount(event.target.value)}
              placeholder="0.00"
              className="h-8 w-24 rounded-lg border border-slate-300 px-2 text-right text-xs"
            />
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500">
              <dt>Subtotal</dt>
              <dd>{formatCurrency(totals.subtotal)}</dd>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-slate-500">
                <dt>Discount</dt>
                <dd>- {formatCurrency(totals.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-slate-500">
              <dt>Taxable amount</dt>
              <dd>{formatCurrency(totals.taxable)}</dd>
            </div>
            <div className="flex justify-between text-slate-500">
              <dt>VAT</dt>
              <dd>{formatCurrency(totals.tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold text-slate-900">
              <dt>Total</dt>
              <dd>{formatCurrency(totals.grandTotal)}</dd>
            </div>
          </dl>

          <Field label="Payment method">
            <Select
              value={method}
              onChange={(event) => {
                const next = event.target.value
                setMethod(next)
                // Pop the QR straight up for the customer to scan.
                setQrOpen(next === 'qr' && lines.length > 0)
              }}
            >
              {PAYMENT_METHODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          {method === 'qr' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setQrOpen(true)}
              disabled={totals.grandTotal <= 0}
            >
              Show QR code
            </Button>
          )}

          {method === 'cash' && (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Banknote size={14} /> Cash tendered
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tendered}
                  onChange={(event) => setTendered(event.target.value)}
                  placeholder="0.00"
                  className="h-8 w-24 rounded-lg border border-slate-300 px-2 text-right text-xs"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Change</span>
                <span className="font-medium text-emerald-600">{formatCurrency(change)}</span>
              </div>
            </>
          )}

          {isCredit && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              This sale will be posted to the customer&apos;s account as outstanding credit.
            </p>
          )}

          {chargeError && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{chargeError}</p>
          )}

          <Button
            size="lg"
            className="w-full"
            loading={charging}
            disabled={!canCharge}
            onClick={onCharge}
          >
            {isCredit ? 'Save credit sale' : `Charge ${formatCurrency(totals.grandTotal)}`}
          </Button>
        </div>
      </Card>

      <Modal
        open={customerOpen}
        title="New Customer"
        size="sm"
        onClose={() => setCustomerOpen(false)}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setCustomerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="pos-customer-form" loading={customerSaving}>
              Save &amp; select
            </Button>
          </>
        }
      >
        <form id="pos-customer-form" onSubmit={onCreateCustomer} className="space-y-4">
          {customerError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {customerError}
            </div>
          )}
          <Field label="Name" required>
            <Input
              value={customerForm.name}
              onChange={(event) => patchCustomer('name', event.target.value)}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                value={customerForm.phone}
                onChange={(event) => patchCustomer('phone', event.target.value)}
              />
            </Field>
            <Field label="PAN / VAT">
              <Input
                value={customerForm.panVatNumber}
                onChange={(event) => patchCustomer('panVatNumber', event.target.value)}
              />
            </Field>
          </div>
          <Field label="Email">
            <Input
              type="email"
              value={customerForm.email}
              onChange={(event) => patchCustomer('email', event.target.value)}
            />
          </Field>
          <Field label="Credit limit">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={customerForm.creditLimit}
              onChange={(event) => patchCustomer('creditLimit', event.target.value)}
            />
          </Field>
          <Field label="Address">
            <Textarea
              rows={2}
              value={customerForm.address}
              onChange={(event) => patchCustomer('address', event.target.value)}
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={qrOpen}
        title="Scan to pay"
        size="sm"
        onClose={() => setQrOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setQrOpen(false)}>
              Close
            </Button>
            <Button loading={charging} disabled={!canCharge} onClick={onCharge}>
              Charge {formatCurrency(totals.grandTotal)}
            </Button>
          </>
        }
      >
        <div className="text-center">
          <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <QRCodeSVG value={qrPayload} size={240} level="M" />
          </div>
          <p className="mt-4 text-2xl font-semibold text-slate-900">
            {formatCurrency(totals.grandTotal)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {company?.companyName ?? 'Pyloom POS'} · Fonepay / QR
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">{qrReference}</p>
          <p className="mt-4 text-xs text-slate-400">
            Ask the customer to scan this code, then press Charge.
          </p>
        </div>
      </Modal>

      <Modal
        open={receipt !== null}
        title="Sale complete"
        size="md"
        onClose={() => setReceipt(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setReceipt(null)} icon={<X size={16} />}>
              Close
            </Button>
            <Button onClick={() => window.print()} icon={<Printer size={16} />}>
              Print receipt
            </Button>
          </>
        }
      >
        {receipt && (
          <div id="pos-receipt" className="text-slate-900">
            <div className="border-b border-dashed border-slate-300 pb-3 text-center">
              <p className="text-base font-semibold">
                {company?.companyName ?? 'Pyloom POS'}
              </p>
              {company?.addressLine1 && (
                <p className="text-xs text-slate-500">{company.addressLine1}</p>
              )}
              <p className="text-xs text-slate-500">
                {[company?.city, company?.phone].filter(Boolean).join(' · ')}
              </p>
              {company?.panVatNumber && (
                <p className="text-xs text-slate-500">PAN/VAT: {company.panVatNumber}</p>
              )}
            </div>

            <div className="flex justify-between py-2 text-xs text-slate-500">
              <span>Invoice: {receipt.invoiceNumber}</span>
              <span>{formatDate(receipt.invoiceDate)}</span>
            </div>
            <p className="pb-2 text-xs text-slate-500">
              Customer: {receipt.customer?.name ?? 'Walk-in Customer'}
            </p>

            <table className="w-full text-xs">
              <thead>
                <tr className="border-y border-slate-200 text-slate-500">
                  <th className="py-1.5 text-left font-medium">Item</th>
                  <th className="py-1.5 text-right font-medium">Qty</th>
                  <th className="py-1.5 text-right font-medium">Rate</th>
                  <th className="py-1.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((line) => (
                  <tr key={line.id} className="border-b border-slate-100">
                    <td className="py-1.5">{line.item?.name ?? `Item #${line.itemId}`}</td>
                    <td className="py-1.5 text-right">{formatNumber(line.quantity, 2)}</td>
                    <td className="py-1.5 text-right">{formatCurrency(line.unitPrice)}</td>
                    <td className="py-1.5 text-right">{formatCurrency(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between text-slate-500">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(receipt.subtotal)}</dd>
              </div>
              {toNumber(receipt.discountAmount) > 0 && (
                <div className="flex justify-between text-slate-500">
                  <dt>Discount</dt>
                  <dd>- {formatCurrency(receipt.discountAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between text-slate-500">
                <dt>VAT</dt>
                <dd>{formatCurrency(receipt.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-semibold">
                <dt>Total</dt>
                <dd>{formatCurrency(receipt.grandTotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>Paid</dt>
                <dd>{formatCurrency(receipt.paidAmount)}</dd>
              </div>
              {toNumber(receipt.outstandingAmount) > 0 && (
                <div className="flex justify-between text-red-600">
                  <dt>Outstanding</dt>
                  <dd>{formatCurrency(receipt.outstandingAmount)}</dd>
                </div>
              )}
            </dl>

            {receipt.paymentMethod === 'qr' && (
              <div className="mt-4 border-t border-dashed border-slate-300 pt-3 text-center">
                <QRCodeSVG
                  value={buildPaymentQrPayload({
                    amount: toNumber(receipt.grandTotal),
                    reference: receipt.invoiceNumber,
                    merchantName: company?.companyName,
                    currency: company?.currencyCode,
                  })}
                  size={132}
                  level="M"
                  className="mx-auto"
                />
                <p className="mt-2 text-[11px] text-slate-500">
                  Fonepay / QR · {receipt.invoiceNumber}
                </p>
              </div>
            )}

            <p className={cn('mt-4 text-center text-[11px] text-slate-400')}>
              {company?.invoiceFooter ?? 'Thank you for your business!'}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
