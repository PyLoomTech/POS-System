import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { Building2, Check, Save, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import { setDatePreferences } from '@/lib/datePreferences'
import type { CompanySettings } from '@/types'

interface CompanyForm {
  companyName: string
  legalBusinessName: string
  tradingName: string
  businessType: string
  industry: string
  registrationNumber: string
  panVatNumber: string
  primaryContactPerson: string
  phone: string
  alternativePhone: string
  email: string
  website: string
  addressLine1: string
  addressLine2: string
  billingAddress: string
  city: string
  stateProvince: string
  country: string
  postalCode: string
  companyLogo: string
  alternativeLogo: string
  invoiceLogo: string
  companyStamp: string
  signatureImage: string
  currencyCode: string
  currencySymbol: string
  currencyPrecision: string
  timezone: string
  language: string
  dateFormat: string
  calendarSystem: 'AD' | 'BS'
  numberFormat: string
  fiscalYearStart: string
  fiscalYearEnd: string
  defaultPaymentTermsDays: string
  defaultTaxRateId: string
  defaultReceivableAccountId: string
  defaultPayableAccountId: string
  defaultCashAccountId: string
  defaultBankAccountId: string
  defaultIncomeAccountId: string
  defaultExpenseAccountId: string
  defaultStockAccountId: string
  defaultCogsAccountId: string
  description: string
  invoiceFooter: string
}

type CompanyField = keyof CompanyForm
type AssetField = 'companyLogo' | 'alternativeLogo' | 'invoiceLogo' | 'companyStamp' | 'signatureImage'

const EMPTY_FORM: CompanyForm = {
  companyName: '',
  legalBusinessName: '',
  tradingName: '',
  businessType: '',
  industry: '',
  registrationNumber: '',
  panVatNumber: '',
  primaryContactPerson: '',
  phone: '',
  alternativePhone: '',
  email: '',
  website: '',
  addressLine1: '',
  addressLine2: '',
  billingAddress: '',
  city: '',
  stateProvince: '',
  country: 'Nepal',
  postalCode: '',
  companyLogo: '',
  alternativeLogo: '',
  invoiceLogo: '',
  companyStamp: '',
  signatureImage: '',
  currencyCode: 'NPR',
  currencySymbol: 'Rs.',
  currencyPrecision: '2',
  timezone: 'Asia/Kathmandu',
  language: 'en',
  dateFormat: 'dd/MM/yyyy',
  calendarSystem: 'AD',
  numberFormat: 'en-US',
  fiscalYearStart: '07-16',
  fiscalYearEnd: '',
  defaultPaymentTermsDays: '0',
  defaultTaxRateId: '',
  defaultReceivableAccountId: '',
  defaultPayableAccountId: '',
  defaultCashAccountId: '',
  defaultBankAccountId: '',
  defaultIncomeAccountId: '',
  defaultExpenseAccountId: '',
  defaultStockAccountId: '',
  defaultCogsAccountId: '',
  description: '',
  invoiceFooter: '',
}

interface CompanyOptions {
  taxRates: Array<{ id: number; name: string; rate: number }>
  accounts: Array<{
    id: number
    accountCode: string
    name: string
    accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  }>
}

const ACCOUNT_DEFAULTS: Array<{
  key: CompanyField
  label: string
  type: CompanyOptions['accounts'][number]['accountType']
}> = [
  { key: 'defaultReceivableAccountId', label: 'Accounts Receivable', type: 'asset' },
  { key: 'defaultPayableAccountId', label: 'Accounts Payable', type: 'liability' },
  { key: 'defaultCashAccountId', label: 'Cash', type: 'asset' },
  { key: 'defaultBankAccountId', label: 'Bank', type: 'asset' },
  { key: 'defaultIncomeAccountId', label: 'Sales Income', type: 'revenue' },
  { key: 'defaultExpenseAccountId', label: 'General Expense', type: 'expense' },
  { key: 'defaultStockAccountId', label: 'Inventory', type: 'asset' },
  { key: 'defaultCogsAccountId', label: 'Cost of Goods Sold', type: 'expense' },
]

function companyField(settings: CompanySettings | null, key: CompanyField): string {
  const value = settings?.[key]
  return value == null ? EMPTY_FORM[key] : String(value)
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </Field>
  )
}

export function CompanyManagementPage() {
  const {
    data: company,
    loading,
    error,
    reload,
  } = useFetch<CompanySettings>('/settings/company')
  const { data: options, error: optionsError } = useFetch<CompanyOptions>('/settings/company/options')
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState<Partial<Record<AssetField, boolean>>>({})
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!company) return
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(
        Object.keys(EMPTY_FORM).map((key) => [
          key,
          companyField(company, key as CompanyField),
        ]),
      ),
    })
  }, [company])

  function update<K extends CompanyField>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  async function uploadAsset(field: AssetField, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFormError(null)
    setUploading((current) => ({ ...current, [field]: true }))
    try {
      const body = new FormData()
      body.append('file', file)
      const assetPath: Record<AssetField, string> = {
        companyLogo: 'logo',
        alternativeLogo: 'alternative-logo',
        invoiceLogo: 'invoice-logo',
        companyStamp: 'stamp',
        signatureImage: 'signature',
      }
      const { data } = await api.post<{ url: string }>(
        `/settings/company/assets/${assetPath[field]}`,
        body,
      )
      update(field, data.url)
    } catch (uploadError) {
      setFormError(getErrorMessage(uploadError))
    } finally {
      setUploading((current) => ({ ...current, [field]: false }))
      event.target.value = ''
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    if (!form.companyName.trim()) {
      setFormError('Company name is required.')
      return
    }
    if (!/^\d{2}-\d{2}$/.test(form.fiscalYearStart)) {
      setFormError('Fiscal year start must use MM-DD format.')
      return
    }
    if (form.fiscalYearEnd && !/^\d{2}-\d{2}$/.test(form.fiscalYearEnd)) {
      setFormError('Fiscal year end must use MM-DD format.')
      return
    }

    const payload: Record<string, string | number | null> = {}
    for (const [key, value] of Object.entries(form)) {
      payload[key] = value.trim() || null
    }
    for (const key of ['currencyPrecision', 'defaultPaymentTermsDays']) {
      const value = Number(form[key as 'currencyPrecision' | 'defaultPaymentTermsDays'])
      const max = key === 'currencyPrecision' ? 6 : 3650
      if (!Number.isInteger(value) || value < 0 || value > max) {
        setFormError(`${key === 'currencyPrecision' ? 'Currency precision' : 'Payment terms'} must be a whole number from 0 to ${max}.`)
        return
      }
      payload[key] = value
    }
    for (const item of ACCOUNT_DEFAULTS) {
      payload[item.key] = form[item.key] ? Number(form[item.key]) : null
    }
    payload.defaultTaxRateId = form.defaultTaxRateId ? Number(form.defaultTaxRateId) : null

    setSaving(true)
    try {
      await api.put('/settings/company', payload)
      setDatePreferences({
        calendarSystem: form.calendarSystem,
        dateFormat: form.dateFormat,
        language: form.language,
      })
      setSaved(true)
      reload()
    } catch (saveError) {
      setFormError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const assetFields: Array<{ key: AssetField; label: string }> = [
    { key: 'companyLogo', label: 'Company Logo' },
    { key: 'alternativeLogo', label: 'Alternative Logo' },
    { key: 'invoiceLogo', label: 'Invoice Logo' },
    { key: 'companyStamp', label: 'Company Stamp' },
    { key: 'signatureImage', label: 'Signature Image' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-accent/10 p-2 text-accent"><Building2 size={20} /></div>
        <div>
          <h1 className="text-xl font-semibold text-ink">Company Management</h1>
          <p className="text-sm text-ink-3">Business identity, regional settings and financial defaults</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Business Identity"
              subtitle="Registered details, contacts and branding used in documents"
              action={saved ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-green"><Check size={14} /> Saved</span> : undefined}
            />
            <div className="space-y-5 p-5">
              {formError && <div role="alert" className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">{formError}</div>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Company Name" required className="sm:col-span-2">
                  <Input value={form.companyName} onChange={(event) => update('companyName', event.target.value)} required maxLength={255} />
                </Field>
                <Field label="Legal Business Name">
                  <Input value={form.legalBusinessName} onChange={(event) => update('legalBusinessName', event.target.value)} />
                </Field>
                <Field label="Trading Name">
                  <Input value={form.tradingName} onChange={(event) => update('tradingName', event.target.value)} />
                </Field>
                <SelectField label="Business Type" value={form.businessType} onChange={(value) => update('businessType', value)}>
                  <option value="">Select type</option>
                  {['Sole proprietorship', 'Partnership', 'Private limited', 'Public limited', 'Non-profit', 'Other'].map((type) => <option key={type} value={type}>{type}</option>)}
                </SelectField>
                <Field label="Industry">
                  <Input value={form.industry} onChange={(event) => update('industry', event.target.value)} />
                </Field>
                <Field label="Registration Number">
                  <Input value={form.registrationNumber} onChange={(event) => update('registrationNumber', event.target.value)} />
                </Field>
                <Field label="PAN / VAT Number">
                  <Input value={form.panVatNumber} onChange={(event) => update('panVatNumber', event.target.value)} />
                </Field>
                <Field label="Primary Contact Person">
                  <Input value={form.primaryContactPerson} onChange={(event) => update('primaryContactPerson', event.target.value)} />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={(event) => update('phone', event.target.value)} />
                </Field>
                <Field label="Alternative Phone">
                  <Input value={form.alternativePhone} onChange={(event) => update('alternativePhone', event.target.value)} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
                </Field>
                <Field label="Website">
                  <Input type="url" value={form.website} onChange={(event) => update('website', event.target.value)} placeholder="https://example.com" />
                </Field>
              </div>

              <div className="border-t border-line pt-5">
                <h3 className="mb-3 text-sm font-semibold text-ink">Branding assets</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {assetFields.map(({ key, label }) => (
                    <div key={key} className="space-y-2 rounded-xl border border-line p-3">
                      <Field label={`${label} URL`}>
                        <Input value={form[key]} onChange={(event) => update(key, event.target.value)} placeholder="/uploads/company/…" />
                      </Field>
                      <Field label={`Upload ${label}`} hint="JPG, PNG or WebP; maximum 5 MB">
                        <Input type="file" accept="image/jpeg,image/png,image/webp" disabled={!company?.companyName || uploading[key]} onChange={(event) => void uploadAsset(key, event)} className="file:mr-3 file:rounded-md file:border-0 file:bg-line-2 file:px-2 file:py-1 file:text-xs" />
                      </Field>
                    </div>
                  ))}
                </div>
                {!company?.companyName && <p className="mt-2 text-xs text-ink-3">Save the company profile once before uploading image assets.</p>}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Business Address" subtitle="Registered, operating and billing addresses" />
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <Field label="Address Line 1"><Input value={form.addressLine1} onChange={(event) => update('addressLine1', event.target.value)} /></Field>
              <Field label="Address Line 2"><Input value={form.addressLine2} onChange={(event) => update('addressLine2', event.target.value)} /></Field>
              <Field label="City"><Input value={form.city} onChange={(event) => update('city', event.target.value)} /></Field>
              <Field label="State / Province"><Input value={form.stateProvince} onChange={(event) => update('stateProvince', event.target.value)} /></Field>
              <Field label="Country"><Input value={form.country} onChange={(event) => update('country', event.target.value)} /></Field>
              <Field label="Postal Code"><Input value={form.postalCode} onChange={(event) => update('postalCode', event.target.value)} /></Field>
              <Field label="Billing Address" className="sm:col-span-2"><Textarea rows={2} value={form.billingAddress} onChange={(event) => update('billingAddress', event.target.value)} /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Regional & Fiscal Settings" subtitle="Currency, locale, time zone and financial year" />
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Currency Code" required><Input required value={form.currencyCode} onChange={(event) => update('currencyCode', event.target.value.toUpperCase())} maxLength={10} /></Field>
              <Field label="Currency Symbol" required><Input required value={form.currencySymbol} onChange={(event) => update('currencySymbol', event.target.value)} maxLength={10} /></Field>
              <Field label="Currency Precision"><Input type="number" min={0} max={6} step={1} value={form.currencyPrecision} onChange={(event) => update('currencyPrecision', event.target.value)} /></Field>
              <Field label="Time Zone" required><Input required value={form.timezone} onChange={(event) => update('timezone', event.target.value)} placeholder="Asia/Kathmandu" /></Field>
              <Field label="Language" required><Input required value={form.language} onChange={(event) => update('language', event.target.value)} /></Field>
              <SelectField label="Date Format" value={form.dateFormat} onChange={(value) => update('dateFormat', value)}>
                {['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy'].map((format) => <option key={format}>{format}</option>)}
              </SelectField>
              <SelectField label="Calendar System" value={form.calendarSystem} onChange={(value) => update('calendarSystem', value === 'BS' ? 'BS' : 'AD')}>
                <option value="AD">Gregorian (AD)</option>
                <option value="BS">Bikram Sambat (BS)</option>
              </SelectField>
              {form.calendarSystem === 'BS' && (
                <p className="self-end pb-2 text-xs text-ink-3">Dates display and date fields use Bikram Sambat; transactions remain stored as Gregorian dates.</p>
              )}
              <SelectField label="Number Format" value={form.numberFormat} onChange={(value) => update('numberFormat', value)}>
                {[['en-US', '1,234.56'], ['de-DE', '1.234,56'], ['en-IN', '1,23,456.78']].map(([value, sample]) => <option key={value} value={value}>{value} ({sample})</option>)}
              </SelectField>
              <Field label="Fiscal Year Start (MM-DD)" required><Input value={form.fiscalYearStart} onChange={(event) => update('fiscalYearStart', event.target.value)} placeholder="07-16" /></Field>
              <Field label="Fiscal Year End (MM-DD)"><Input value={form.fiscalYearEnd} onChange={(event) => update('fiscalYearEnd', event.target.value)} placeholder="07-15" /></Field>
              <Field label="Default Payment Terms (days)"><Input type="number" min={0} max={3650} step={1} value={form.defaultPaymentTermsDays} onChange={(event) => update('defaultPaymentTermsDays', event.target.value)} /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Financial Defaults" subtitle="Default tax and accounts for future workflows" />
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Default Tax Rate" value={form.defaultTaxRateId} onChange={(value) => update('defaultTaxRateId', value)}>
                <option value="">No default</option>
                {(options?.taxRates ?? []).map((rate) => <option key={rate.id} value={rate.id}>{rate.name} ({rate.rate}%)</option>)}
              </SelectField>
              {ACCOUNT_DEFAULTS.map(({ key, label, type }) => (
                <SelectField key={key} label={label} value={form[key]} onChange={(value) => update(key, value)}>
                  <option value="">No default</option>
                  {(options?.accounts ?? []).filter((account) => account.accountType === type).map((account) => (
                    <option key={account.id} value={account.id}>{account.accountCode} — {account.name}</option>
                  ))}
                </SelectField>
              ))}
              {optionsError && <p className="text-xs text-brand-crimson sm:col-span-2 lg:col-span-3">Could not load tax and account options: {optionsError}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Document Details" subtitle="Optional company description and invoice footer" />
            <div className="grid grid-cols-1 gap-4 p-5">
              <Field label="Company Description"><Textarea rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} /></Field>
              <Field label="Invoice Footer"><Textarea rows={2} value={form.invoiceFooter} onChange={(event) => update('invoiceFooter', event.target.value)} placeholder="Thank you for your business!" /></Field>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" loading={saving} icon={<Save size={16} />}>Save Company Profile</Button>
          </div>
        </div>

        <Card className="h-fit xl:sticky xl:top-4">
          <CardHeader title="Document Preview" subtitle="Company header and contact details" />
          <div className="p-5">
            <div className="rounded-xl border border-dashed border-line p-5 text-center">
              {form.companyLogo && <img src={form.companyLogo} alt={`${form.companyName || 'Company'} logo`} className="mx-auto mb-3 max-h-20 max-w-full object-contain" />}
              <p className="font-semibold text-ink">{form.tradingName || form.companyName || 'Company Name'}</p>
              {form.legalBusinessName && <p className="text-xs text-ink-3">{form.legalBusinessName}</p>}
              {[form.addressLine1, form.addressLine2, [form.city, form.stateProvince, form.country].filter(Boolean).join(', ')].filter(Boolean).map((line) => <p key={line} className="text-xs text-ink-3">{line}</p>)}
              <p className="text-xs text-ink-3">{[form.phone, form.email, form.website].filter(Boolean).join(' · ') || 'Phone · Email · Website'}</p>
              {form.panVatNumber && <p className="mt-1 text-xs text-ink-3">PAN / VAT: {form.panVatNumber}</p>}
              <div className="my-4 border-t border-dashed border-line" />
              <p className="text-left text-xs text-ink-3">Sample Invoice · Customer: Walk-in Customer</p>
              <div className="my-3 flex justify-between border-y border-line py-2 text-xs"><span>Sample Item</span><span>1 × {form.currencySymbol} 100.00</span></div>
              <p className="text-right text-sm font-semibold">{form.currencySymbol} 100.00</p>
              <p className="mt-3 text-xs text-ink-3">{form.invoiceFooter || 'Thank you for your business!'}</p>
              {form.companyStamp && <img src={form.companyStamp} alt="Company stamp" className="mx-auto mt-3 max-h-16 object-contain" />}
              {form.signatureImage && <img src={form.signatureImage} alt="Authorized signature" className="mx-auto mt-3 max-h-12 object-contain" />}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3"><Upload size={13} /> Branding assets will be stored on this server.</p>
          </div>
        </Card>
      </form>
    </div>
  )
}
