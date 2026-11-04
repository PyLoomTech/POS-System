import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  Boxes,
  Check,
  ClipboardList,
  Plus,
  ScrollText,
  Search,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import { cn, formatCurrency, formatDate, formatNumber, toNumber } from '@/lib/utils'
import type { Item, Paginated } from '@/types'

// The backend exposes no warehouse list endpoint, so the seeded default
// "Main Store" warehouse (id 1) is used for stock adjustments.
const DEFAULT_WAREHOUSE_ID = 1
const DEFAULT_WAREHOUSE_LABEL = 'Main Store (#1)'
const ADJUSTMENT_STORE_KEY = 'pyloom.stockAdjustments'

type TabId = 'stock' | 'low-stock' | 'adjustments'

const TABS: Array<{ id: TabId; label: string; icon: typeof Boxes }> = [
  { id: 'stock', label: 'Stock', icon: Boxes },
  { id: 'low-stock', label: 'Low Stock', icon: AlertTriangle },
  { id: 'adjustments', label: 'Adjustments', icon: ClipboardList },
]

interface StockRow {
  id: string | number
  itemId: number
  quantity: string
  averageCost: string
  item: { id: number; itemCode: string; name: string }
  warehouse: { id: number; name: string; code: string }
}

interface LowStockRow {
  id: string | number
  itemId: number
  itemCode: string
  name: string
  quantity: number
  reorderLevel: number
  minimumStock: number
  warehouseCode: string
  warehouse: string
}

interface LedgerMovement {
  id: string | number
  movementType: string
  quantity: string
  referenceType: string | null
  referenceId: string | number | null
  narration: string | null
  createdAt: string
  runningBalance: number
  warehouse?: { id: number; name: string; code: string } | null
}

interface StockLedgerResponse {
  item: { id: number; itemCode: string; name: string }
  closingBalance: number
  entries: LedgerMovement[]
}

interface AdjustmentLine {
  id?: number
  itemId: number
  item?: { id: number; itemCode: string; name: string } | null
  systemQuantity: string | null
  actualQuantity: string | null
  difference: string | null
  unitCost: string | null
}

interface AdjustmentRecord {
  id: number
  adjNumber: string
  warehouseId: number
  adjustmentDate: string
  reason: string | null
  status: string
  createdAt: string
  warehouse?: { id: number; name: string; code: string } | null
  items: AdjustmentLine[]
}

interface EditLine {
  key: string
  itemId: number | null
  itemCode: string
  itemName: string
  search: string
  options: Item[]
  loading: boolean
  systemQty: number
  actualQuantity: string
}

function loadStoredAdjustments(): AdjustmentRecord[] {
  try {
    const raw = localStorage.getItem(ADJUSTMENT_STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AdjustmentRecord[]) : []
  } catch {
    return []
  }
}

function saveStoredAdjustments(records: AdjustmentRecord[]) {
  try {
    localStorage.setItem(ADJUSTMENT_STORE_KEY, JSON.stringify(records))
  } catch {
    /* ignore quota / availability errors */
  }
}

function newEditLine(): EditLine {
  return {
    key: Math.random().toString(36).slice(2),
    itemId: null,
    itemCode: '',
    itemName: '',
    search: '',
    options: [],
    loading: false,
    systemQty: 0,
    actualQuantity: '',
  }
}

function itemSystemQty(item: Item, warehouseId: number): number {
  return (item.stockBalances ?? [])
    .filter((balance) => balance.warehouse.id === warehouseId)
    .reduce((sum, balance) => sum + toNumber(balance.quantity), 0)
}

export function InventoryPage() {
  const [tab, setTab] = useState<TabId>('stock')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {TABS.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <Icon size={16} />
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === 'stock' && <StockTab />}
      {tab === 'low-stock' && <LowStockTab />}
      {tab === 'adjustments' && <AdjustmentsTab />}
    </div>
  )
}

function StockTab() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const limit = 100
  const { data, loading, error, reload } = useFetch<Paginated<StockRow>>(
    `/inventory/stock?page=${page}&limit=${limit}${query ? `&search=${encodeURIComponent(query)}` : ''}`,
  )

  const [ledgerItem, setLedgerItem] = useState<StockRow['item'] | null>(null)
  const [ledger, setLedger] = useState<StockLedgerResponse | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  async function loadLedger(itemId: number, fromDate = from, toDate = to) {
    setLedgerLoading(true)
    setLedgerError(null)
    try {
      const params = new URLSearchParams()
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      const qs = params.toString()
      const { data: result } = await api.get<StockLedgerResponse>(
        `/inventory/stock/${itemId}/ledger${qs ? `?${qs}` : ''}`,
      )
      setLedger(result)
    } catch (err) {
      setLedgerError(getErrorMessage(err))
    } finally {
      setLedgerLoading(false)
    }
  }

  function openLedger(row: StockRow) {
    setLedgerItem(row.item)
    setLedger(null)
    void loadLedger(row.item.id)
  }

  const columns: Column<StockRow>[] = [
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-slate-500">{row.item.itemCode}</span>,
    },
    {
      header: 'Item',
      cell: (row) => <span className="font-medium text-slate-800">{row.item.name}</span>,
    },
    { header: 'Warehouse', cell: (row) => row.warehouse.name },
    {
      header: 'On hand',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-slate-800">{formatNumber(row.quantity, 2)}</span>
      ),
    },
    {
      header: 'Avg. cost',
      align: 'right',
      cell: (row) => <span className="text-slate-500">{formatCurrency(row.averageCost)}</span>,
    },
    {
      header: 'Value',
      align: 'right',
      cell: (row) => (
        <span className="text-slate-700">
          {formatCurrency(toNumber(row.quantity) * toNumber(row.averageCost))}
        </span>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          icon={<ScrollText size={14} />}
          onClick={() => openLedger(row)}
        >
          Ledger
        </Button>
      ),
    },
  ]

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / limit))

  const ledgerColumns: Column<LedgerMovement>[] = [
    { header: 'Date', cell: (row) => formatDate(row.createdAt) },
    {
      header: 'Type',
      cell: (row) => <Badge tone="slate">{row.movementType.replace('_', ' ')}</Badge>,
    },
    {
      header: 'Reference',
      cell: (row) =>
        row.referenceType ? (
          <span className="text-xs text-slate-500">
            {row.referenceType}
            {row.referenceId ? ` #${row.referenceId}` : ''}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      header: 'In',
      align: 'right',
      cell: (row) =>
        toNumber(row.quantity) > 0 ? (
          <span className="text-emerald-600">{formatNumber(row.quantity, 2)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      header: 'Out',
      align: 'right',
      cell: (row) =>
        toNumber(row.quantity) < 0 ? (
          <span className="text-red-600">{formatNumber(Math.abs(toNumber(row.quantity)), 2)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      header: 'Balance',
      align: 'right',
      cell: (row) => <span className="font-medium text-slate-800">{formatNumber(row.runningBalance, 2)}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setPage(1)
            setQuery(search.trim())
          }}
        >
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              className="w-64 pl-9"
              placeholder="Search item name, code, barcode…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <span className="text-xs text-slate-400">{formatNumber(total)} stock record(s)</span>
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(row) => String(row.id)}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No stock records"
          emptyDescription="Stock balances appear here once items exist in a warehouse."
        />
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-xs text-slate-500">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
          >
            Next
          </Button>
        </div>
      )}

      <Modal
        open={ledgerItem !== null}
        title={ledgerItem ? `Stock Ledger — ${ledgerItem.name}` : 'Stock Ledger'}
        size="lg"
        onClose={() => setLedgerItem(null)}
        footer={
          <Button variant="outline" onClick={() => setLedgerItem(null)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From" className="w-40">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="To" className="w-40">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
            <Button
              variant="outline"
              onClick={() => ledgerItem && void loadLedger(ledgerItem.id, from, to)}
            >
              Apply
            </Button>
          </div>

          {ledgerLoading ? (
            <Spinner label="Loading ledger…" />
          ) : ledgerError ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{ledgerError}</p>
          ) : ledger ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <p className="text-xs text-slate-500">Opening balance</p>
                  <p className="mt-1 text-lg font-semibold text-slate-800">
                    {formatNumber(
                      ledger.closingBalance -
                        ledger.entries.reduce((sum, entry) => sum + toNumber(entry.quantity), 0),
                      2,
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-blue-50/60 px-4 py-3">
                  <p className="text-xs text-slate-500">Closing balance</p>
                  <p className="mt-1 text-lg font-semibold text-blue-700">
                    {formatNumber(ledger.closingBalance, 2)}
                  </p>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <DataTable
                  columns={ledgerColumns}
                  rows={ledger.entries}
                  rowKey={(row) => String(row.id)}
                  emptyTitle="No movements"
                  emptyDescription="No inventory movements were recorded in this period."
                />
              </div>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}

function LowStockTab() {
  const { data, loading, error, reload } = useFetch<{ data: LowStockRow[]; total: number }>(
    '/inventory/low-stock',
  )

  const columns: Column<LowStockRow>[] = [
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-slate-500">{row.itemCode}</span>,
    },
    {
      header: 'Item',
      cell: (row) => <span className="font-medium text-slate-800">{row.name}</span>,
    },
    {
      header: 'Warehouse',
      cell: (row) => (
        <span>
          {row.warehouse}
          <span className="ml-1 text-xs text-slate-400">({row.warehouseCode})</span>
        </span>
      ),
    },
    {
      header: 'On hand',
      align: 'right',
      cell: (row) => <span className="font-semibold text-red-600">{formatNumber(row.quantity, 2)}</span>,
    },
    {
      header: 'Reorder level',
      align: 'right',
      cell: (row) => <span className="text-slate-500">{formatNumber(row.reorderLevel, 2)}</span>,
    },
    {
      header: 'Status',
      align: 'center',
      cell: (row) => (
        <Badge tone="red">
          {toNumber(row.quantity) <= 0 ? 'Out of stock' : 'At / below reorder level'}
        </Badge>
      ),
    },
  ]

  return (
    <Card>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(row) => String(row.id)}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No low-stock alerts"
        emptyDescription="Items at or below their reorder level will be listed here."
      />
    </Card>
  )
}

function AdjustmentsTab() {
  const [records, setRecords] = useState<AdjustmentRecord[]>(() => loadStoredAdjustments())
  const reload = () => setRecords(loadStoredAdjustments())

  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<EditLine[]>([newEditLine()])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [approving, setApproving] = useState<number | null>(null)
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const warehouseId = DEFAULT_WAREHOUSE_ID

  function resetForm() {
    setReason('')
    setAdjustmentDate(new Date().toISOString().slice(0, 10))
    setLines([newEditLine()])
    setFormError(null)
  }

  function openCreate() {
    resetForm()
    setOpen(true)
  }

  function updateLine(key: string, patch: Partial<EditLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function onLineSearch(line: EditLine, value: string) {
    updateLine(line.key, {
      search: value,
      itemId: null,
      itemCode: '',
      itemName: '',
      systemQty: 0,
    })
    const pending = searchTimers.current[line.key]
    if (pending) clearTimeout(pending)
    if (!value.trim()) {
      updateLine(line.key, { options: [], loading: false })
      return
    }
    updateLine(line.key, { loading: true })
    searchTimers.current[line.key] = setTimeout(async () => {
      try {
        const { data } = await api.get<Item[]>(
          `/items/search?q=${encodeURIComponent(value.trim())}&limit=10`,
        )
        updateLine(line.key, { options: data, loading: false })
      } catch {
        updateLine(line.key, { options: [], loading: false })
      }
    }, 250)
  }

  function pickItem(line: EditLine, item: Item) {
    updateLine(line.key, {
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.name,
      search: item.name,
      options: [],
      systemQty: itemSystemQty(item, warehouseId),
    })
  }

  function onChangeActual(line: EditLine, value: string) {
    updateLine(line.key, { actualQuantity: value })
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const validLines = lines.filter((line) => line.itemId !== null)
    if (validLines.length === 0) {
      setFormError('Add at least one item line to the adjustment.')
      return
    }
    if (validLines.some((line) => line.actualQuantity === '')) {
      setFormError('Enter the counted quantity for every line.')
      return
    }
    setSaving(true)
    try {
      const { data } = await api.post<AdjustmentRecord>('/inventory/adjustments', {
        warehouseId,
        adjustmentDate,
        reason: reason.trim() || null,
        items: validLines.map((line) => ({
          itemId: line.itemId as number,
          actualQuantity: toNumber(line.actualQuantity),
          unitCost: null,
        })),
      })
      const next = [data, ...loadStoredAdjustments().filter((row) => row.id !== data.id)]
      saveStoredAdjustments(next)
      setRecords(next)
      setOpen(false)
      resetForm()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function onApprove(record: AdjustmentRecord) {
    if (!window.confirm(`Approve adjustment ${record.adjNumber}? Stock balances will be updated.`)) {
      return
    }
    setApproving(record.id)
    try {
      await api.post(`/inventory/adjustments/${record.id}/approve`)
      const next = loadStoredAdjustments().map((row) =>
        row.id === record.id ? { ...row, status: 'approved' } : row,
      )
      saveStoredAdjustments(next)
      reload()
    } catch (err) {
      window.alert(getErrorMessage(err))
    } finally {
      setApproving(null)
    }
  }

  const columns: Column<AdjustmentRecord>[] = [
    {
      header: 'Adj #',
      cell: (row) => <span className="font-medium text-slate-800">{row.adjNumber}</span>,
    },
    { header: 'Date', cell: (row) => formatDate(row.adjustmentDate) },
    {
      header: 'Warehouse',
      cell: (row) => row.warehouse?.name ?? `Warehouse #${row.warehouseId}`,
    },
    { header: 'Reason', cell: (row) => row.reason ?? <span className="text-slate-400">—</span> },
    {
      header: 'Lines',
      align: 'right',
      cell: (row) => formatNumber(row.items.length),
    },
    {
      header: 'Net difference',
      align: 'right',
      cell: (row) => {
        const net = row.items.reduce((sum, line) => sum + toNumber(line.difference), 0)
        return (
          <span className={net < 0 ? 'text-red-600' : net > 0 ? 'text-emerald-600' : 'text-slate-500'}>
            {net > 0 ? '+' : ''}
            {formatNumber(net, 2)}
          </span>
        )
      },
    },
    {
      header: 'Status',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.status === 'approved' ? 'green' : 'amber'}>{row.status}</Badge>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) =>
        row.status === 'approved' ? (
          <span className="text-xs text-slate-400">Approved</span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            icon={<Check size={14} />}
            loading={approving === row.id}
            onClick={() => void onApprove(row)}
          >
            Approve
          </Button>
        ),
    },
  ]

  const differenceTotal = lines.reduce(
    (sum, line) =>
      sum + (line.itemId !== null && line.actualQuantity !== '' ? toNumber(line.actualQuantity) - line.systemQty : 0),
    0,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Stock adjustments created here await approval before balances change.
        </p>
        <Button icon={<Plus size={16} />} onClick={openCreate}>
          New Adjustment
        </Button>
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={records}
          rowKey={(row) => row.id}
          emptyTitle="No adjustments yet"
          emptyDescription="Create a stock adjustment to reconcile counted quantities."
        />
      </Card>

      <Modal
        open={open}
        title="New Stock Adjustment"
        size="lg"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="adjustment-form" loading={saving}>
              Save Adjustment
            </Button>
          </>
        }
      >
        <form id="adjustment-form" onSubmit={onSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Warehouse" hint="Default warehouse">
              <Select value={String(warehouseId)} disabled onChange={() => undefined}>
                <option value={String(warehouseId)}>{DEFAULT_WAREHOUSE_LABEL}</option>
              </Select>
            </Field>
            <Field label="Adjustment date">
              <Input
                type="date"
                value={adjustmentDate}
                onChange={(event) => setAdjustmentDate(event.target.value)}
              />
            </Field>
            <Field label="Reason">
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Physical count"
              />
            </Field>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Items
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => setLines((prev) => [...prev, newEditLine()])}
              >
                Add line
              </Button>
            </div>

            {lines.map((line) => {
              const counted = line.actualQuantity === '' ? null : toNumber(line.actualQuantity)
              const difference = counted === null ? null : counted - line.systemQty
              return (
                <div key={line.key} className="rounded-2xl border border-slate-200 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_120px_auto] sm:items-end">
                    <div className="relative">
                      <Field label="Item">
                        <Input
                          value={line.search}
                          placeholder="Search item…"
                          onChange={(event) => onLineSearch(line, event.target.value)}
                        />
                      </Field>
                      {line.itemId === null && line.search.trim() !== '' && (
                        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {line.loading ? (
                            <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>
                          ) : line.options.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-500">No matching items</p>
                          ) : (
                            line.options.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => pickItem(line, option)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                              >
                                <span className="truncate text-slate-700">{option.name}</span>
                                <span className="font-mono text-[11px] text-slate-400">
                                  {option.itemCode}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <Field label="System qty">
                      <Input value={formatNumber(line.systemQty, 2)} readOnly disabled />
                    </Field>
                    <Field label="Counted qty">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.actualQuantity}
                        disabled={line.itemId === null}
                        onChange={(event) => onChangeActual(line, event.target.value)}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((prev) =>
                          prev.length > 1 ? prev.filter((row) => row.key !== line.key) : prev,
                        )
                      }
                      className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {line.itemId !== null && (
                    <p className="mt-1 text-xs text-slate-500">
                      {line.itemCode} · {line.itemName} —{' '}
                      {difference === null ? (
                        <span className="text-slate-400">enter counted quantity</span>
                      ) : (
                        <span
                          className={cn(
                            'font-medium',
                            difference < 0
                              ? 'text-red-600'
                              : difference > 0
                                ? 'text-emerald-600'
                                : 'text-slate-500',
                          )}
                        >
                          difference {difference > 0 ? '+' : ''}
                          {formatNumber(difference, 2)}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm">
            <span className="text-slate-500">Net difference across lines</span>
            <span
              className={cn(
                'font-semibold',
                differenceTotal < 0
                  ? 'text-red-600'
                  : differenceTotal > 0
                    ? 'text-emerald-600'
                    : 'text-slate-700',
              )}
            >
              {differenceTotal > 0 ? '+' : ''}
              {formatNumber(differenceTotal, 2)}
            </span>
          </div>
        </form>
      </Modal>
    </div>
  )
}
