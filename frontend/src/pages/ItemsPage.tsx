import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { ImagePlus, Link2, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import { formatCurrency, formatNumber, imageSrc, toNumber } from '@/lib/utils'
import type { Category, Item, Paginated, TaxRate } from '@/types'

interface UnitOption {
  id: number
  name: string
  abbreviation: string | null
}

interface ItemForm {
  itemCode: string
  barcode: string
  name: string
  description: string
  imageUrl: string
  categoryId: string
  unitId: string
  taxType: string
  taxRateId: string
  purchasePrice: string
  sellingPrice: string
  minimumStock: string
  reorderLevel: string
}

const TAX_TYPES: { value: string; label: string }[] = [
  { value: 'taxable_exclusive', label: 'Taxable — price excludes tax' },
  { value: 'taxable_inclusive', label: 'Taxable — price includes tax' },
  { value: 'non_taxable', label: 'Non-taxable' },
  { value: 'zero_rated', label: 'Zero-rated' },
  { value: 'exempt', label: 'Exempt' },
]

const EMPTY_FORM: ItemForm = {
  itemCode: '',
  barcode: '',
  name: '',
  description: '',
  imageUrl: '',
  categoryId: '',
  unitId: '',
  taxType: 'taxable_exclusive',
  taxRateId: '',
  purchasePrice: '',
  sellingPrice: '',
  minimumStock: '0',
  reorderLevel: '0',
}

export function ItemsPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const { data, loading, error, reload } = useFetch<Paginated<Item>>(
    `/items?limit=100${query ? `&search=${encodeURIComponent(query)}` : ''}`,
  )
  const { data: categories, reload: reloadCategories } = useFetch<Category[]>('/categories')
  const { data: units } = useFetch<UnitOption[]>('/categories/units')
  const { data: taxRates } = useFetch<TaxRate[]>('/items/tax-rates')

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [newCategoryOpen, setNewCategoryOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setOpen(true)
  }

  function openEdit(item: Item) {
    setEditing(item)
    setForm({
      itemCode: item.itemCode,
      barcode: item.barcode ?? '',
      name: item.name,
      description: item.description ?? '',
      imageUrl: item.imageUrl ?? '',
      categoryId: item.category ? String(item.category.id) : '',
      unitId: item.unit ? String(item.unit.id) : '',
      taxType: item.taxType ?? 'taxable_exclusive',
      taxRateId: item.taxRateId ? String(item.taxRateId) : '',
      purchasePrice: String(toNumber(item.purchasePrice)),
      sellingPrice: String(toNumber(item.sellingPrice)),
      minimumStock: String(toNumber(item.minimumStock)),
      reorderLevel: String(toNumber(item.reorderLevel)),
    })
    setFormError(null)
    setOpen(true)
  }

  function update<K extends keyof ItemForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onCreateCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    setFormError(null)
    setCreatingCategory(true)
    try {
      const { data: created } = await api.post<Category>('/categories', { name })
      await reloadCategories()
      update('categoryId', String(created.id))
      setNewCategoryName('')
      setNewCategoryOpen(false)
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setCreatingCategory(false)
    }
  }

  async function uploadImage(file: File) {
    setFormError(null)
    setUploading(true)
    try {
      const body = new FormData()
      body.append('image', file)
      const { data: uploaded } = await api.post<{ url: string }>('/items/upload-image', body)
      update('imageUrl', uploaded.url)
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function onPickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    await uploadImage(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  function onDropImage(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void uploadImage(file)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    const payload = {
      itemCode: form.itemCode.trim(),
      barcode: form.barcode.trim() || null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      unitId: Number(form.unitId),
      taxType: form.taxType,
      taxRateId: form.taxRateId ? Number(form.taxRateId) : null,
      purchasePrice: Number(form.purchasePrice) || 0,
      sellingPrice: Number(form.sellingPrice) || 0,
      minimumStock: Number(form.minimumStock) || 0,
      reorderLevel: Number(form.reorderLevel) || 0,
    }
    try {
      if (editing) {
        await api.put(`/items/${editing.id}`, payload)
      } else {
        await api.post('/items', payload)
      }
      setOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const buying = toNumber(form.purchasePrice)
  const selling = toNumber(form.sellingPrice)
  const margin = buying > 0 ? ((selling - buying) / buying) * 100 : 0

  const columns: Column<Item>[] = [
    {
      header: '',
      cell: (row) => (
        <div className="h-11 w-11 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {row.imageUrl ? (
            <img
              src={imageSrc(row.imageUrl)}
              alt={row.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-slate-300">
              <ImagePlus size={16} />
            </span>
          )}
        </div>
      ),
      className: 'w-14',
    },
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-slate-500">{row.itemCode}</span>,
    },
    {
      header: 'Item',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.name}</p>
          <p className="text-xs text-slate-400">{row.barcode ?? 'No barcode'}</p>
        </div>
      ),
    },
    { header: 'Category', cell: (row) => row.category?.name ?? '—' },
    { header: 'Unit', cell: (row) => row.unit?.abbreviation ?? row.unit?.name ?? '—' },
    {
      header: 'Buying rate',
      align: 'right',
      cell: (row) => <span className="text-slate-500">{formatCurrency(row.purchasePrice)}</span>,
    },
    {
      header: 'Selling rate',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-slate-800">{formatCurrency(row.sellingPrice)}</span>
      ),
    },
    {
      header: 'Stock',
      align: 'right',
      cell: (row) => {
        const qty = row.stockBalances.reduce((sum, balance) => sum + Number(balance.quantity), 0)
        const reorder = Number(row.reorderLevel)
        return (
          <span className={reorder > 0 && qty <= reorder ? 'font-medium text-red-600' : ''}>
            {formatNumber(qty, 2)}
          </span>
        )
      },
    },
    {
      header: 'Status',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.isActive ? 'green' : 'slate'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <Button variant="outline" size="sm" icon={<Pencil size={14} />} onClick={() => openEdit(row)}>
          Edit
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
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
              placeholder="Search name, code, barcode…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button icon={<Plus size={16} />} onClick={openCreate}>
          New Item
        </Button>
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No items yet"
          emptyDescription="Add products and services to sell at the point of sale."
        />
      </Card>

      <Modal
        open={open}
        title={editing ? `Edit Item — ${editing.name}` : 'New Item'}
        size="lg"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="item-form" loading={saving}>
              {editing ? 'Save Changes' : 'Save Item'}
            </Button>
          </>
        }
      >
        <form id="item-form" onSubmit={onSubmit} className="space-y-5">
          {formError && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-600">Image</span>
              <div
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDropImage}
                onClick={() => fileRef.current?.click()}
                className={`flex h-40 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-slate-50 transition ${
                  dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300'
                }`}
              >
                {form.imageUrl ? (
                  <img
                    src={imageSrc(form.imageUrl)}
                    alt="Item preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-slate-400">
                    <ImagePlus size={22} />
                    <span className="text-[11px]">
                      {uploading ? 'Uploading…' : 'Drag & drop or click'}
                    </span>
                  </span>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickImage}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  loading={uploading}
                  icon={<Upload size={14} />}
                  onClick={() => fileRef.current?.click()}
                >
                  Upload
                </Button>
                {form.imageUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={() => update('imageUrl', '')}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="relative">
                <Link2
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  className="pl-8 text-xs"
                  placeholder="…or paste an image URL"
                  value={form.imageUrl}
                  onChange={(event) => update('imageUrl', event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Item Code" required>
                <Input
                  value={form.itemCode}
                  onChange={(e) => update('itemCode', e.target.value)}
                  required
                />
              </Field>
              <Field label="Barcode">
                <Input value={form.barcode} onChange={(e) => update('barcode', e.target.value)} />
              </Field>
              <Field label="Name" required className="sm:col-span-2">
                <Input value={form.name} onChange={(e) => update('name', e.target.value)} required />
              </Field>
              <Field label="Category">
                <div className="flex gap-2">
                  <Select
                    className="flex-1"
                    value={form.categoryId}
                    onChange={(e) => update('categoryId', e.target.value)}
                  >
                    <option value="">— None —</option>
                    {(categories ?? []).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    icon={<Plus size={14} />}
                    onClick={() => setNewCategoryOpen((prev) => !prev)}
                    title="Create a new category"
                  >
                    New
                  </Button>
                </div>
                {newCategoryOpen && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      className="flex-1"
                      placeholder="New category name"
                      value={newCategoryName}
                      autoFocus
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          onCreateCategory()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      loading={creatingCategory}
                      disabled={!newCategoryName.trim()}
                      onClick={onCreateCategory}
                    >
                      Add
                    </Button>
                  </div>
                )}
              </Field>
              <Field label="Unit" required>
                <Select value={form.unitId} onChange={(e) => update('unitId', e.target.value)} required>
                  <option value="">— Select —</option>
                  {(units ?? []).map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                      {unit.abbreviation ? ` (${unit.abbreviation})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Optional notes shown to cashiers"
                />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pricing, Tax &amp; Stock
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Buying rate" hint="Cost price from supplier">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.purchasePrice}
                  onChange={(e) => update('purchasePrice', e.target.value)}
                />
              </Field>
              <Field label="Selling rate" hint="Price charged at the till">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.sellingPrice}
                  onChange={(e) => update('sellingPrice', e.target.value)}
                />
              </Field>
              <Field label="Minimum Stock">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.minimumStock}
                  onChange={(e) => update('minimumStock', e.target.value)}
                />
              </Field>
              <Field label="Reorder Level">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.reorderLevel}
                  onChange={(e) => update('reorderLevel', e.target.value)}
                />
              </Field>
              <Field label="Tax type" hint="Choose taxable or non-taxable">
                <Select
                  value={form.taxType}
                  onChange={(e) => {
                    const next = e.target.value
                    update('taxType', next)
                    if (next === 'non_taxable' || next === 'zero_rated' || next === 'exempt') {
                      update('taxRateId', '')
                    }
                  }}
                >
                  {TAX_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tax rate" hint="Applied on taxable items">
                <Select
                  value={form.taxRateId}
                  disabled={
                    form.taxType === 'non_taxable' ||
                    form.taxType === 'zero_rated' ||
                    form.taxType === 'exempt'
                  }
                  onChange={(e) => update('taxRateId', e.target.value)}
                >
                  <option value="">— None —</option>
                  {(taxRates ?? []).map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rate.name} ({formatNumber(rate.rate, 2)}%)
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Margin:{' '}
              <span
                className={
                  margin < 0 ? 'font-medium text-red-600' : 'font-medium text-emerald-600'
                }
              >
                {margin.toFixed(1)}%
              </span>{' '}
              · Profit per unit: {formatCurrency(selling - buying)}
            </p>
          </div>
        </form>
      </Modal>
    </div>
  )
}
