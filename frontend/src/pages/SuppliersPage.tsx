import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Field, Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import type { Paginated, Supplier } from '@/types'

const EMPTY_FORM = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  panVatNumber: '',
  openingBalance: '0',
  paymentTermsDays: '0',
}

export function SuppliersPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const { data, loading, error, reload } = useFetch<Paginated<Supplier>>(
    `/suppliers?limit=100${query ? `&search=${encodeURIComponent(query)}` : ''}`,
  )

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const columns: Column<Supplier>[] = [
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-slate-500">{row.supplierCode ?? '—'}</span>,
    },
    {
      header: 'Name',
      cell: (row) => <span className="font-medium text-slate-800">{row.name}</span>,
    },
    { header: 'Contact', cell: (row) => row.contactPerson ?? '—' },
    { header: 'Phone', cell: (row) => row.phone ?? '—' },
    { header: 'PAN/VAT', cell: (row) => row.panVatNumber ?? '—' },
    {
      header: 'Payment Terms',
      align: 'right',
      cell: (row) => `${row.paymentTermsDays} day(s)`,
    },
    {
      header: 'Status',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.isActive ? 'green' : 'slate'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ]

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      await api.post('/suppliers', {
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        panVatNumber: form.panVatNumber.trim() || null,
        openingBalance: Number(form.openingBalance) || 0,
        paymentTermsDays: Number(form.paymentTermsDays) || 0,
      })
      setOpen(false)
      setForm(EMPTY_FORM)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

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
              placeholder="Search name, phone, PAN…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>
          New Supplier
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
          emptyTitle="No suppliers found"
          emptyDescription="Add suppliers to record purchases and payables."
        />
      </Card>

      <Modal
        open={open}
        title="New Supplier"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" form="supplier-form" loading={saving}>
              Save Supplier
            </Button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {formError && (
            <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {formError}
            </div>
          )}
          <Field label="Name" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} required />
          </Field>
          <Field label="Contact Person">
            <Input
              value={form.contactPerson}
              onChange={(e) => update('contactPerson', e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} />
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
          <Field label="Opening Balance">
            <Input
              type="number"
              step="0.01"
              value={form.openingBalance}
              onChange={(e) => update('openingBalance', e.target.value)}
            />
          </Field>
          <Field label="Payment Terms (days)">
            <Input
              type="number"
              value={form.paymentTermsDays}
              onChange={(e) => update('paymentTermsDays', e.target.value)}
            />
          </Field>
        </form>
      </Modal>
    </div>
  )
}
