import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Search, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FeedList, initials } from '@/components/ui/FeedList'
import type { FeedColumn } from '@/components/ui/FeedList'
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
  const [query, setQuery] = useState('')
  const { data, loading, error, reload } = useFetch<Paginated<Supplier>>(
    `/suppliers?limit=100${query ? `&search=${encodeURIComponent(query)}` : ''}`,
  )

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const columns: FeedColumn<Supplier>[] = [
    {
      header: 'Contact',
      width: '150px',
      hideOnMobile: true,
      cell: (row) => <span className="fv">{row.contactPerson ?? '—'}</span>,
    },
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
      header: 'Payment Terms',
      width: '130px',
      align: 'right',
      cell: (row) => <span className="fv">{`${row.paymentTermsDays} day(s)`}</span>,
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
      <FeedList
        rows={data?.data ?? []}
        rowKey={(row) => row.id}
        columns={columns}
        lead={(row) => initials(row.name)}
        title={(row) => row.name}
        subtitle={(row) => row.supplierCode ?? '—'}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyIcon={<UsersRound size={20} />}
        emptyTitle="No suppliers found"
        emptyDescription="Add suppliers to record purchases and payables."
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>
              New Supplier
            </Button>
          </div>
        }
      />

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
            <div className="sm:col-span-2 rounded-lg bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">
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
