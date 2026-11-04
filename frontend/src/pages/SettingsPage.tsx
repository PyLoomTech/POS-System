import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Building2, Check, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { CompanySettings } from '@/types'

type SettingsTab = 'company' | 'application'

const TABS: { key: SettingsTab; label: string; icon: ReactNode }[] = [
  { key: 'company', label: 'Company Profile', icon: <Building2 size={15} /> },
  { key: 'application', label: 'Application Settings', icon: <SlidersHorizontal size={15} /> },
]

// ---------------------------------------------------------------
// Company Profile
// ---------------------------------------------------------------

interface CompanyForm {
  companyName: string
  companyLogo: string
  addressLine1: string
  addressLine2: string
  city: string
  phone: string
  email: string
  panVatNumber: string
  currencyCode: string
  invoiceFooter: string
}

const EMPTY_COMPANY: CompanyForm = {
  companyName: '',
  companyLogo: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  phone: '',
  email: '',
  panVatNumber: '',
  currencyCode: 'NPR',
  invoiceFooter: '',
}

function CompanyProfileTab() {
  const { data, loading, error, reload } = useFetch<CompanySettings>('/settings/company')

  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setForm({
      companyName: data.companyName ?? '',
      companyLogo: data.companyLogo ?? '',
      addressLine1: data.addressLine1 ?? '',
      addressLine2: data.addressLine2 ?? '',
      city: data.city ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      panVatNumber: data.panVatNumber ?? '',
      currencyCode: data.currencyCode ?? 'NPR',
      invoiceFooter: data.invoiceFooter ?? '',
    })
  }, [data])

  function update<K extends keyof CompanyForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!form.companyName.trim()) next.companyName = 'Company name is required.'
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      next.email = 'Enter a valid email address.'
    }
    if (!form.currencyCode.trim()) next.currencyCode = 'Currency code is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    if (!validate()) return

    setSaving(true)
    try {
      await api.put('/settings/company', {
        companyName: form.companyName.trim(),
        companyLogo: form.companyLogo.trim() || null,
        addressLine1: form.addressLine1.trim() || null,
        addressLine2: form.addressLine2.trim() || null,
        city: form.city.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        panVatNumber: form.panVatNumber.trim() || null,
        currencyCode: form.currencyCode.trim() || 'NPR',
        invoiceFooter: form.invoiceFooter.trim() || null,
      })
      setSaved(true)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader
          title="Company Profile"
          subtitle="Shown on invoices, receipts and reports"
          action={
            saved ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <Check size={14} /> Saved
              </span>
            ) : undefined
          }
        />
        <div className="space-y-4 p-5">
          {formError && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company Name" required error={errors.companyName} className="sm:col-span-2">
              <Input
                value={form.companyName}
                onChange={(e) => update('companyName', e.target.value)}
                required
              />
            </Field>
            <Field
              label="Logo URL"
              hint="Absolute URL or path to the company logo"
              className="sm:col-span-2"
            >
              <Input
                value={form.companyLogo}
                onChange={(e) => update('companyLogo', e.target.value)}
                placeholder="https://…/logo.png"
              />
            </Field>
            <Field label="Address Line 1">
              <Input
                value={form.addressLine1}
                onChange={(e) => update('addressLine1', e.target.value)}
              />
            </Field>
            <Field label="Address Line 2">
              <Input
                value={form.addressLine2}
                onChange={(e) => update('addressLine2', e.target.value)}
              />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="hello@company.com"
              />
            </Field>
            <Field label="PAN / VAT Number">
              <Input
                value={form.panVatNumber}
                onChange={(e) => update('panVatNumber', e.target.value)}
              />
            </Field>
            <Field label="Currency Code" required error={errors.currencyCode}>
              <Input
                value={form.currencyCode}
                onChange={(e) => update('currencyCode', e.target.value)}
                placeholder="NPR"
              />
            </Field>
            <Field label="Invoice Footer" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={form.invoiceFooter}
                onChange={(e) => update('invoiceFooter', e.target.value)}
                placeholder="Thank you for your business!"
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="submit" loading={saving} icon={<Save size={16} />}>
              Save Company Profile
            </Button>
          </div>
        </div>
      </Card>

      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader title="Receipt Preview" subtitle="How your header and footer will print" />
        <div className="p-5">
          <div className="text-slate-900">
            <div className="border-b border-dashed border-slate-300 pb-3 text-center">
              {form.companyLogo && (
                <img
                  src={form.companyLogo}
                  alt="Company logo"
                  className="mx-auto mb-2 h-12 w-auto object-contain"
                />
              )}
              <p className="text-base font-semibold">{form.companyName || 'Pyloom POS'}</p>
              {form.addressLine1 && (
                <p className="text-xs text-slate-500">{form.addressLine1}</p>
              )}
              {form.addressLine2 && (
                <p className="text-xs text-slate-500">{form.addressLine2}</p>
              )}
              <p className="text-xs text-slate-500">
                {[form.city, form.phone].filter(Boolean).join(' · ') || 'City · Phone'}
              </p>
              {form.panVatNumber && (
                <p className="text-xs text-slate-500">PAN/VAT: {form.panVatNumber}</p>
              )}
            </div>

            <div className="flex justify-between py-2 text-xs text-slate-500">
              <span>Invoice: INV-000001</span>
              <span>—</span>
            </div>
            <p className="pb-2 text-xs text-slate-500">Customer: Walk-in Customer</p>

            <table className="w-full text-xs">
              <thead>
                <tr className="border-y border-slate-200 text-slate-500">
                  <th className="py-1.5 text-left font-medium">Item</th>
                  <th className="py-1.5 text-right font-medium">Qty</th>
                  <th className="py-1.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5">Sample item</td>
                  <td className="py-1.5 text-right">1</td>
                  <td className="py-1.5 text-right">Rs. 100.00</td>
                </tr>
              </tbody>
            </table>

            <p className={cn('mt-4 text-center text-[11px] text-slate-400')}>
              {form.invoiceFooter || 'Thank you for your business!'}
            </p>
          </div>
        </div>
      </Card>
    </form>
  )
}

// ---------------------------------------------------------------
// Application Settings
// ---------------------------------------------------------------

interface SettingRow {
  id: string
  key: string
  value: string
  isNew: boolean
}

let settingUid = 0
function nextUid(): string {
  settingUid += 1
  return `row-${settingUid}`
}

function ApplicationSettingsTab() {
  const { data, loading, error, reload } = useFetch<Record<string, string | null>>('/settings')

  const [rows, setRows] = useState<SettingRow[]>([])
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setRows(
      Object.entries(data).map(([key, value]) => ({
        id: nextUid(),
        key,
        value: value ?? '',
        isNew: false,
      })),
    )
  }, [data])

  function updateRow(id: string, patch: Partial<SettingRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    setSaved(false)
  }

  function addRow() {
    setRows((prev) => [...prev, { id: nextUid(), key: '', value: '', isNew: true }])
    setSaved(false)
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id))
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setSaved(false)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const payload: Record<string, string> = {}
    const errs: Record<string, string> = {}
    for (const row of rows) {
      const key = row.key.trim()
      if (!key) {
        errs[row.id] = 'Key is required.'
        continue
      }
      if (payload[key] !== undefined) {
        errs[row.id] = 'Duplicate key.'
        continue
      }
      payload[key] = row.value
    }
    setRowErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    try {
      await api.put('/settings', payload)
      setSaved(true)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader
          title="Application Settings"
          subtitle="Key/value configuration stored on the server"
          action={
            <div className="flex items-center gap-3">
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                  <Check size={14} /> Saved
                </span>
              )}
              <Button type="button" variant="outline" size="sm" icon={<Plus size={14} />} onClick={addRow}>
                Add Setting
              </Button>
            </div>
          }
        />

        <div className="space-y-3 p-5">
          {formError && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</div>
          )}

          {rows.length === 0 ? (
            <EmptyState
              title="No settings yet"
              description="Add a key/value pair to store application configuration."
              action={
                <Button type="button" variant="outline" icon={<Plus size={14} />} onClick={addRow}>
                  Add Setting
                </Button>
              }
            />
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[240px_1fr_auto] sm:items-end"
              >
                {row.isNew ? (
                  <Field label="Key" required error={rowErrors[row.id]}>
                    <Input
                      value={row.key}
                      onChange={(e) => updateRow(row.id, { key: e.target.value })}
                      placeholder="setting.key"
                      className="font-mono text-xs"
                    />
                  </Field>
                ) : (
                  <div className="space-y-1">
                    <span className="block text-xs font-medium text-slate-600">Key</span>
                    <span className="flex h-9 items-center rounded-xl bg-slate-50 px-3.5 font-mono text-xs text-slate-600">
                      {row.key}
                    </span>
                  </div>
                )}

                <Field label="Value" error={row.isNew ? undefined : rowErrors[row.id]}>
                  <Input
                    value={row.value}
                    onChange={(e) => updateRow(row.id, { value: e.target.value })}
                    placeholder="Value"
                  />
                </Field>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={() => removeRow(row.id)}
                  className="text-red-600 hover:bg-red-50"
                >
                  Remove
                </Button>
              </div>
            ))
          )}

          <div className="flex items-center justify-end pt-1">
            <Button type="submit" loading={saving} icon={<Save size={16} />}>
              Save Settings
            </Button>
          </div>
        </div>
      </Card>
    </form>
  )
}

// ---------------------------------------------------------------
// Page
// ---------------------------------------------------------------

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('company')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
              tab === item.key
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'company' ? <CompanyProfileTab /> : <ApplicationSettingsTab />}
    </div>
  )
}
