import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { FileDown, FileText, IdCard, Pencil, Plus, Printer, Search, Trash2, Upload, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FeedList, initials } from '@/components/ui/FeedList'
import type { FeedColumn } from '@/components/ui/FeedList'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import { formatCurrency, imageSrc, openPrintWindow, toNumber } from '@/lib/utils'
import type { Customer, Paginated } from '@/types'

const ID_TYPES = [
  'Citizenship',
  'National ID',
  'Passport',
  'Driving License',
  'Voter ID',
  'PAN Certificate',
  'Other',
]

const EMPTY_FORM = {
  name: '',
  phone: '',
  alternatePhone: '',
  email: '',
  address: '',
  panVatNumber: '',
  idCardType: '',
  idCardNumber: '',
  idCardImageUrl: '',
  creditLimit: '0',
}

type CustomerForm = typeof EMPTY_FORM

export function CustomersPage() {
  const [query, setQuery] = useState('')
  const { data, loading, error, reload } = useFetch<Paginated<Customer>>(
    `/customers?limit=100${query ? `&search=${encodeURIComponent(query)}` : ''}`,
  )

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const rows = data?.data ?? []

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setOpen(true)
  }

  function openEdit(customer: Customer) {
    setEditing(customer)
    setForm({
      name: customer.name,
      phone: customer.phone ?? '',
      alternatePhone: customer.alternatePhone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      panVatNumber: customer.panVatNumber ?? '',
      idCardType: customer.idCardType ?? '',
      idCardNumber: customer.idCardNumber ?? '',
      idCardImageUrl: customer.idCardImageUrl ?? '',
      creditLimit: String(toNumber(customer.creditLimit)),
    })
    setFormError(null)
    setOpen(true)
  }

  function update<K extends keyof CustomerForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function uploadDocument(file: File) {
    setFormError(null)
    setUploading(true)
    try {
      const body = new FormData()
      body.append('document', file)
      const { data: uploaded } = await api.post<{ url: string }>('/customers/upload-document', body)
      update('idCardImageUrl', uploaded.url)
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function onPickDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    await uploadDocument(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  function onDropDocument(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void uploadDocument(file)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      alternatePhone: form.alternatePhone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      panVatNumber: form.panVatNumber.trim() || null,
      idCardType: form.idCardType || null,
      idCardNumber: form.idCardNumber.trim() || null,
      idCardImageUrl: form.idCardImageUrl.trim() || null,
      creditLimit: Number(form.creditLimit) || 0,
    }
    try {
      if (editing) {
        await api.put(`/customers/${editing.id}`, payload)
      } else {
        await api.post('/customers', payload)
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

  async function exportExcel() {
    setExporting(true)
    try {
      const response = await api.get('/customers/export/excel', {
        params: query ? { search: query } : {},
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data as Blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'customers.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  function printCustomers(mode: 'pdf' | 'print') {
    if (rows.length === 0) return
    const head = `<tr><th>Code</th><th>Name</th><th>Phone</th><th>PAN/VAT</th><th>ID Card</th><th class="num">Credit Limit</th><th class="num">Balance</th></tr>`
    const body = rows
      .map((row) => {
        const idCard = [row.idCardType, row.idCardNumber].filter(Boolean).join(' · ') || '—'
        return `<tr>
          <td>${row.customerCode ?? '—'}</td>
          <td>${row.name}</td>
          <td>${row.phone ?? '—'}</td>
          <td>${row.panVatNumber ?? '—'}</td>
          <td>${idCard}</td>
          <td class="num">${formatCurrency(row.creditLimit)}</td>
          <td class="num">${formatCurrency(row.openingBalance)}</td>
        </tr>`
      })
      .join('')
    const html = `<h1>Customer List</h1><p class="muted">${rows.length} customer(s)${
      query ? ` · search: “${query}”` : ''
    } · generated ${new Date().toLocaleString('en-GB')}</p><table><thead>${head}</thead><tbody>${body}</tbody></table>`
    openPrintWindow(mode === 'pdf' ? 'Customers — PDF' : 'Customers — Print', html)
  }

  const columns: FeedColumn<Customer>[] = [
    {
      header: 'Phone',
      width: '140px',
      hideOnMobile: true,
      cell: (row) => <span className="fv">{row.phone ?? '—'}</span>,
    },
    {
      header: 'PAN/VAT',
      width: '140px',
      hideOnMobile: true,
      cell: (row) => <span className="fv">{row.panVatNumber ?? '—'}</span>,
    },
    {
      header: 'ID Card',
      width: '180px',
      hideOnMobile: true,
      cell: (row) => {
        const label = [row.idCardType, row.idCardNumber].filter(Boolean).join(' · ')
        return <span className="fv">{label || '—'}</span>
      },
    },
    {
      header: 'Credit Limit',
      width: '130px',
      align: 'right',
      cell: (row) => <span className="fv">{formatCurrency(row.creditLimit)}</span>,
    },
    {
      header: 'Status',
      width: '120px',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.isActive ? 'green' : 'slate'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <FeedList
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        lead={(row) => initials(row.name)}
        title={(row) => row.name}
        subtitle={(row) => row.customerCode ?? '—'}
        onRowClick={openEdit}
        rowAction={(row) => (
          <Button variant="outline" size="sm" icon={<Pencil size={14} />} onClick={() => openEdit(row)}>
            Edit
          </Button>
        )}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyIcon={<Users size={20} />}
        emptyTitle="No customers found"
        emptyDescription="Add your first customer to start recording sales."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
              />
              <Input
                className="w-64 pl-9"
                placeholder="Search name, phone, PAN…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                icon={<FileDown size={16} />}
                loading={exporting}
                disabled={rows.length === 0}
                onClick={exportExcel}
              >
                Excel
              </Button>
              <Button
                variant="outline"
                icon={<FileText size={16} />}
                disabled={rows.length === 0}
                onClick={() => printCustomers('pdf')}
              >
                PDF
              </Button>
              <Button
                variant="outline"
                icon={<Printer size={16} />}
                disabled={rows.length === 0}
                onClick={() => printCustomers('print')}
              >
                Print
              </Button>
              <Button icon={<Plus size={16} />} onClick={openCreate}>
                New Customer
              </Button>
            </div>
          </div>
        }
      />

      <Modal
        open={open}
        title={editing ? `Edit Customer — ${editing.name}` : 'New Customer'}
        size="lg"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" form="customer-form" loading={saving}>
              {editing ? 'Save Changes' : 'Save Customer'}
            </Button>
          </>
        }
      >
        <form id="customer-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {formError && (
            <div className="sm:col-span-2 rounded-lg bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">
              {formError}
            </div>
          )}
          <Field label="Name" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} required />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </Field>
          <Field label="Alternate Phone">
            <Input
              value={form.alternatePhone}
              onChange={(e) => update('alternatePhone', e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </Field>
          <Field label="PAN / VAT Number">
            <Input
              value={form.panVatNumber}
              onChange={(e) => update('panVatNumber', e.target.value)}
            />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => update('address', e.target.value)} />
          </Field>
          <Field label="Credit Limit">
            <Input
              type="number"
              step="0.01"
              value={form.creditLimit}
              onChange={(e) => update('creditLimit', e.target.value)}
            />
          </Field>

          <div className="sm:col-span-2 rounded-2xl border border-line bg-white/50 p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
              <IdCard size={14} /> Identity Card
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="ID Type">
                <Select value={form.idCardType} onChange={(e) => update('idCardType', e.target.value)}>
                  <option value="">— Select —</option>
                  {ID_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="ID Number">
                <Input
                  value={form.idCardNumber}
                  onChange={(e) => update('idCardNumber', e.target.value)}
                  placeholder="Document number"
                />
              </Field>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr]">
              <div
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDropDocument}
                onClick={() => fileRef.current?.click()}
                className={`flex h-36 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-white transition ${
                  dragging ? 'border-accent bg-soft' : 'border-line'
                }`}
              >
                {form.idCardImageUrl ? (
                  <img
                    src={imageSrc(form.idCardImageUrl)}
                    alt="Identity document"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-ink-3">
                    <IdCard size={22} />
                    <span className="text-[11px]">
                      {uploading ? 'Uploading…' : 'Drag & drop document'}
                    </span>
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickDocument}
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
                    Upload document
                  </Button>
                  {form.idCardImageUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => update('idCardImageUrl', '')}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-ink-3">
                  Upload an image (JPG, PNG or WEBP, up to 5 MB) of the identity document.
                </p>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
