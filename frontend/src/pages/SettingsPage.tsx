import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Input'
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'

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
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-green">
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
            <div className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">{formError}</div>
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
                className="grid grid-cols-1 gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[240px_1fr_auto] sm:items-end"
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
                    <span className="block text-xs font-medium text-ink-2">Key</span>
                    <span className="flex h-9 items-center rounded-xl bg-line-2 px-3.5 font-mono text-xs text-ink-2">
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
                  className="text-brand-crimson hover:bg-[#f9e4e7]"
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

function PrintFormatTab() {
  const { data, loading, error, reload } = useFetch<PrintTemplate[]>('/settings/print-templates')
  const [name, setName] = useState('')
  const [documentType, setDocumentType] = useState('sales_invoice')
  const [pageSize, setPageSize] = useState('A4')
  const [orientation, setOrientation] = useState('portrait')
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function createTemplate() {
    if (!name.trim()) {
      setFormError('Template name is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.post('/settings/print-templates', {
        name: name.trim(),
        documentType,
        pageSize,
        orientation,
        isDefault,
        isActive: true,
        configuration: {
          elements: ['company_header', 'document_info', 'item_table', 'financial_summary', 'footer'],
          itemColumns: ['itemName', 'quantity', 'unitPrice', 'taxAmount', 'lineTotal'],
        },
      })
      setName('')
      setIsDefault(false)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function publishTemplate(id: number) {
    setFormError(null)
    try {
      await api.post(`/settings/print-templates/${id}/publish`, {})
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    }
  }

  async function deleteTemplate(id: number) {
    setFormError(null)
    try {
      await api.delete(`/settings/print-templates/${id}`)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Create Print Format" subtitle="Add a reusable published layout for a document type" />
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
          {formError && (
            <div role="alert" className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson xl:col-span-5">
              {formError}
            </div>
          )}
          <Field label="Template Name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="A4 Tax Invoice" />
          </Field>
          <Field label="Document Type">
            <select className="h-9 w-full rounded-xl border border-line bg-surface px-3 text-sm" value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
              {DOCUMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Page Size">
            <select className="h-9 w-full rounded-xl border border-line bg-surface px-3 text-sm" value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
              {['A4', 'A5', 'LETTER', 'THERMAL_80', 'THERMAL_58', 'CUSTOM'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Orientation">
            <select className="h-9 w-full rounded-xl border border-line bg-surface px-3 text-sm" value={orientation} onChange={(event) => setOrientation(event.target.value)}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </Field>
          <div className="flex items-end gap-3 pb-1">
            <label className="flex h-9 items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
              Default
            </label>
            <Button loading={saving} icon={<Plus size={14} />} onClick={createTemplate}>Create</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Print Format Templates" subtitle="Templates are stored and published per document type" />
        <div className="p-5">
          {!data?.length ? (
            <EmptyState title="No print formats" description="Create the first template for a supported document type." />
          ) : (
            <div className="space-y-3">
              {data.map((template) => (
                <div key={template.id} className="grid grid-cols-1 gap-3 rounded-2xl border border-line p-3 md:grid-cols-[1fr_180px_120px_100px_auto] md:items-center">
                  <div>
                    <p className="font-medium text-ink">{template.name}</p>
                    <p className="text-xs text-ink-3">{DOCUMENT_TYPES.find((item) => item.value === template.documentType)?.label ?? template.documentType}</p>
                  </div>
                  <span className="text-sm text-ink-2">{template.pageSize} · {template.orientation}</span>
                  <span className="text-xs font-medium text-ink-2">{template.status}</span>
                  <span className="text-xs text-ink-2">{template.isDefault ? 'Default' : 'Not default'}</span>
                  <div className="flex justify-end gap-2">
                    {template.status !== 'published' && (
                      <Button size="sm" variant="outline" onClick={() => void publishTemplate(template.id)}>Publish</Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-brand-crimson" onClick={() => void deleteTemplate(template.id)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

interface PrintTemplate {
  id: number
  documentType: string
  name: string
  pageSize: string
  orientation: string
  status: string
  isDefault: boolean
  isActive: boolean
}

const DOCUMENT_TYPES = [
  { value: 'sales_invoice', label: 'Sales Invoice' },
  { value: 'pos_receipt', label: 'POS Receipt' },
  { value: 'sales_order', label: 'Sales Order' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'sales_return', label: 'Sales Return / Credit Note' },
  { value: 'delivery_note', label: 'Delivery Note' },
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'purchase_receipt', label: 'Purchase Receipt' },
  { value: 'purchase_invoice', label: 'Purchase Invoice' },
  { value: 'purchase_return', label: 'Purchase Return / Debit Note' },
  { value: 'payment_receipt', label: 'Payment Receipt' },
  { value: 'customer_payment_voucher', label: 'Customer Payment Voucher' },
  { value: 'supplier_payment_voucher', label: 'Supplier Payment Voucher' },
  { value: 'journal_entry', label: 'Journal Entry Voucher' },
  { value: 'shift_opening', label: 'Shift Opening Summary' },
  { value: 'shift_closing', label: 'Shift Closing Report' },
] as const

export function SettingsPage() {
  const [tab, setTab] = useState<'application' | 'printing'>('application')
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" variant={tab === 'application' ? 'primary' : 'outline'} size="sm" onClick={() => setTab('application')}>Application Settings</Button>
        <Button type="button" variant={tab === 'printing' ? 'primary' : 'outline'} size="sm" onClick={() => setTab('printing')}>Print Formats</Button>
      </div>
      {tab === 'application' ? <ApplicationSettingsTab /> : <PrintFormatTab />}
    </div>
  )
}
