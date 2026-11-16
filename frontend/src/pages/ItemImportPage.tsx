import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'

interface WarehouseOption {
  id: number
  code: string
  name: string
  isDefault: boolean
}

interface PriceListOption {
  id: number
  code: string
  name: string
  isDefault: boolean
}

interface ImportRow {
  rowNumber: number
  status: string
  itemCode: string
  name: string
  groupName: string
  unitName: string
  sellingRate: number
  valuationRate: number | null
  priceListPrices?: Array<{ priceListId: number; priceListName: string; price: number }>
  unitConversions?: Array<{ unitName: string; factor: number }>
  stockQuantity: number | null
  warehouseId: number | null
  currentQuantity: number | null
  errors: string[]
  itemId: number | null
  transactionId: string | null
  result: {
    action?: string
    finalQuantity?: number | null
    movementId?: string | null
  } | null
}

interface ImportBatch {
  batchId: string
  fileName: string
  status: string
  mode?: string | null
  updatePrices: boolean
  counts?: {
    total: number
    valid?: number
    invalid?: number
    successful?: number
    failed?: number
  }
  rows: ImportRow[]
}

const SAMPLE_HEADERS = [
  'Item Code', 'Item Name', 'Item Group', 'UOM', 'Purchase Rate', 'Selling Rate',
  'Stock Qty', 'Valuation Rate', 'Warehouse', 'Stock Item', 'UOM Conversions',
]
const SAMPLE_ROWS = [
  ['BEER001', 'Tuborg Beer', 'Beverages', 'Nos', '300', '450', '100', '300', '', 'Yes', 'Case=24'],
  ['FOOD001', 'Chicken Momo', 'Food', 'Plate', '150', '250', '0', '150', '', 'Yes', ''],
  ['DRINK001', 'Coca Cola', 'Beverages', 'Nos', '65', '100', '50', '65', '', 'Yes', 'Pack=6'],
]

function finalQuantity(row: ImportRow, mode: string): number | null {
  if (row.stockQuantity === null) return null
  const current = row.currentQuantity ?? 0
  return mode === 'opening_stock' ? row.stockQuantity : current + row.stockQuantity
}

export function ItemImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [warehouseSelection, setWarehouseSelection] = useState<string | null>(null)
  const [mode, setMode] = useState('opening_stock')
  const [updatePrices, setUpdatePrices] = useState(true)
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: warehouses, loading: loadingWarehouses, error: warehouseError } =
    useFetch<WarehouseOption[]>('/inventory/warehouses')
  const { data: priceLists } = useFetch<PriceListOption[]>('/items/price-lists')
  const defaultWarehouse = warehouses?.find((warehouse) => warehouse.isDefault)
  const defaultWarehouseId = warehouseSelection ?? (defaultWarehouse ? String(defaultWarehouse.id) : '')
  const isComplete = batch?.status === 'completed'
  const warehouseNames = useMemo(
    () => new Map((warehouses ?? []).map((warehouse) => [warehouse.id, warehouse.name])),
    [warehouses],
  )
  const pendingCount = useMemo(
    () => batch?.rows.filter((row) => row.status === 'pending').length ?? 0,
    [batch],
  )

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setBatch(null)
    setError(null)
  }

  async function preview() {
    if (!file) {
      setError('Choose a CSV or XLSX file first.')
      return
    }
    setError(null)
    setLoadingPreview(true)
    try {
      const body = new FormData()
      body.append('file', file)
      if (defaultWarehouseId) body.append('defaultWarehouseId', defaultWarehouseId)
      body.append('updatePrices', String(updatePrices))
      const { data } = await api.post<ImportBatch>('/items/import/preview', body)
      setBatch(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoadingPreview(false)
    }
  }

  async function confirmImport() {
    if (!batch) return
    setError(null)
    setPosting(true)
    try {
      const { data } = await api.post<ImportBatch>('/items/import/confirm', {
        batchId: batch.batchId,
        mode,
        updatePrices,
      })
      setBatch({ ...batch, ...data })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPosting(false)
    }
  }

  function downloadSample() {
    const priceListHeaders = (priceLists ?? []).map((list) => `Price List: ${list.name}`)
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
    const csv = [
      [...SAMPLE_HEADERS, ...priceListHeaders],
      ...SAMPLE_ROWS.map((row) => [...row, ...priceListHeaders.map(() => '')]),
    ].map((row) => row.map(escape).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'item-import-sample.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  function downloadReport() {
    if (!batch) return
    const headers = ['Row', 'Status', 'Item Code', 'Item Name', 'Stock Qty', 'Errors']
    const escape = (value: string | number) => {
      const text = String(value)
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replace(/"/g, '""')}"`
    }
    const lines = [
      headers.map(escape).join(','),
      ...batch.rows.map((row) =>
        [
          row.rowNumber,
          row.status,
          row.itemCode,
          row.name,
          row.stockQuantity ?? '',
          row.errors.join('; '),
        ].map(escape).join(','),
      ),
    ]
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `item-import-report-${batch.batchId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Bulk Item Import</h1>
          <p className="mt-1 text-sm text-ink-3">
            Import item details and optionally post inventory into stock balances and the stock ledger.
          </p>
        </div>
        <Button variant="outline" icon={<Download size={16} />} onClick={downloadSample} disabled={!priceLists}>
          Download sample CSV
        </Button>
      </div>

      <Card>
        <CardHeader
          title="Upload and configure"
          subtitle="CSV and XLSX files are supported. Maximum 2,000 item rows and 10 MB per file."
        />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Excel or CSV file" required hint="Required columns: Item Code, Item Name, Item Group, UOM, Selling Rate. Missing UOM names are created on confirmation. Set alternate units as Unit=Factor pairs in UOM Conversions, e.g. Case=24; Box=12. The factor is base units per alternate unit.">
            <Input type="file" accept=".csv,.xlsx" onChange={onPickFile} />
          </Field>
          <Field label="Default warehouse" hint="A row-level Warehouse value overrides this selection.">
            <Select
              value={defaultWarehouseId}
              onChange={(event) => setWarehouseSelection(event.target.value)}
              disabled={loadingWarehouses}
            >
              <option value="">Select a default warehouse</option>
              {(warehouses ?? []).map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code}){warehouse.isDefault ? ' — default' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Inventory update mode" hint="Opening stock sets the final quantity. Material receipt adds the imported quantity.">
            <Select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="opening_stock">Opening stock / Set quantity</option>
              <option value="material_receipt">Material receipt / Add quantity</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={updatePrices}
              onChange={(event) => setUpdatePrices(event.target.checked)}
              className="h-4 w-4 rounded border-line text-accent focus:ring-accent/30"
            />
            Import or update selling and purchase/valuation prices
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button
              icon={<Upload size={16} />}
              loading={loadingPreview}
              disabled={!file || loadingPreview || posting}
              onClick={() => void preview()}
            >
              Validate and preview
            </Button>
            {file && <span className="text-xs text-ink-3">{file.name}</span>}
            <p className="text-xs text-ink-3">
              Item Groups, UOMs, and warehouses must already exist. Stock is not posted until confirmation.
            </p>
          </div>
          {warehouseError && (
            <p className="text-sm text-brand-amber md:col-span-2">
              Could not load warehouse choices: {warehouseError}. You can still provide Warehouse in the file.
            </p>
          )}
        </div>
      </Card>

      {error && (
        <div role="alert" className="rounded-xl border border-[#e6c1c7] bg-[#f9e4e7] px-4 py-3 text-sm text-brand-crimson">
          {error}
        </div>
      )}

      {batch && (
        <Card>
          <CardHeader
            title={isComplete ? 'Import report' : 'Review import'}
            subtitle={`Batch ${batch.batchId} · ${batch.fileName}`}
            action={isComplete ? (
              <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={downloadReport}>
                Download report
              </Button>
            ) : undefined}
          />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={isComplete ? 'green' : 'indigo'}>
                {isComplete ? 'Completed' : `${pendingCount} valid row(s) ready`}
              </Badge>
              <Badge tone="red">
                {batch.rows.filter((row) => ['invalid', 'failed'].includes(row.status)).length} row(s) need attention
              </Badge>
              {batch.counts?.successful !== undefined && (
                <span className="text-ink-2">
                  {batch.counts.successful} succeeded · {batch.counts.failed} failed
                </span>
              )}
            </div>

            {!isComplete && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7efdd] p-4 text-sm text-brand-amber">
                <p className="flex min-w-0 items-start gap-2">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                  Confirming creates or updates items and posts stock movements for valid rows. This batch can only be posted once.
                </p>
                <Button loading={posting} disabled={posting} onClick={() => void confirmImport()}>
                  {pendingCount > 0 ? 'Confirm import' : 'Finalize report'}
                </Button>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="min-w-[1050px] w-full text-left text-xs">
                <thead className="bg-line-2 text-ink-3">
                  <tr>
                    <th className="px-3 py-2.5">Row</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5">Group / UOM</th>
                    <th className="px-3 py-2.5">Selling</th>
                    <th className="px-3 py-2.5">Valuation</th>
                    <th className="px-3 py-2.5">Price Lists</th>
                    <th className="px-3 py-2.5">UOM Conversions</th>
                    <th className="px-3 py-2.5">Stock Qty</th>
                    <th className="px-3 py-2.5">Current → Final</th>
                    <th className="px-3 py-2.5">Warehouse / Result</th>
                    <th className="px-3 py-2.5">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-2">
                  {batch.rows.map((row) => (
                    <tr key={row.rowNumber} className="align-top">
                      <td className="px-3 py-3 text-ink-3">{row.rowNumber}</td>
                      <td className="px-3 py-3">
                        <Badge tone={row.status === 'success' ? 'green' : row.status === 'pending' ? 'indigo' : 'red'}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-ink">{row.name || '—'}</div>
                        <div className="text-ink-3">{row.itemCode}</div>
                      </td>
                      <td className="px-3 py-3 text-ink-2">{row.groupName} / {row.unitName}</td>
                      <td className="px-3 py-3">{row.sellingRate}</td>
                      <td className="px-3 py-3">{row.valuationRate ?? '—'}</td>
                      <td className="px-3 py-3">
                        {row.priceListPrices?.length
                          ? row.priceListPrices.map((entry) => `${entry.priceListName}: ${entry.price}`).join(' · ')
                          : '—'}
                      </td>
                      <td className="px-3 py-3">
                        {row.unitConversions?.length
                          ? row.unitConversions.map((entry) => `${entry.unitName} × ${entry.factor}`).join(' · ')
                          : '—'}
                      </td>
                      <td className="px-3 py-3">{row.stockQuantity ?? '—'}</td>
                      <td className="px-3 py-3">
                        {row.stockQuantity === null
                          ? '—'
                          : `${row.currentQuantity ?? 0} → ${row.result?.finalQuantity ?? finalQuantity(row, mode)}`}
                      </td>
                      <td className="px-3 py-3 text-ink-2">
                        {row.result?.action ?? (row.warehouseId
                          ? warehouseNames.get(row.warehouseId) ?? `Warehouse #${row.warehouseId}`
                          : '—')}
                        {row.transactionId && <div className="text-ink-3">Transaction #{row.transactionId}</div>}
                      </td>
                      <td className="max-w-72 px-3 py-3 text-brand-crimson">
                        {row.errors.length ? row.errors.join(' ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!isComplete && (
              <div className="flex items-start gap-2 text-xs text-ink-3">
                <FileSpreadsheet size={16} className="mt-0.5 shrink-0" />
                Empty Stock Qty leaves inventory unchanged. Zero is valid for Opening Stock and is skipped for Material Receipt.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
