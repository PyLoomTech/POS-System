import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { FeedList, initials } from '@/components/ui/FeedList'
import type { FeedColumn } from '@/components/ui/FeedList'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import type { PriceList } from '@/types'

interface UnitOption {
  id: number
  name: string
  abbreviation: string | null
  isActive: boolean
}

interface PriceListForm {
  code: string
  name: string
  description: string
  isDefault: boolean
}

const EMPTY_PRICE_LIST: PriceListForm = {
  code: '',
  name: '',
  description: '',
  isDefault: false,
}

export function PriceListsUomPage() {
  const {
    data: priceLists,
    loading: loadingPriceLists,
    error: priceListError,
    reload: reloadPriceLists,
  } = useFetch<PriceList[]>('/items/price-lists')
  const {
    data: units,
    loading: loadingUnits,
    error: unitError,
    reload: reloadUnits,
  } = useFetch<UnitOption[]>('/categories/units')

  const [priceListOpen, setPriceListOpen] = useState(false)
  const [unitOpen, setUnitOpen] = useState(false)
  const [priceListForm, setPriceListForm] = useState(EMPTY_PRICE_LIST)
  const [unitName, setUnitName] = useState('')
  const [unitAbbreviation, setUnitAbbreviation] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const priceListColumns: FeedColumn<PriceList>[] = [
    {
      header: 'Default',
      align: 'center',
      width: '120px',
      cell: (row) => row.isDefault ? <Badge tone="green">Default</Badge> : '—',
    },
    {
      header: 'Description',
      hideOnMobile: true,
      cell: (row) => <span className="text-ink-2">{row.description || '—'}</span>,
    },
  ]

  async function submitPriceList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      await api.post('/items/price-lists', {
        ...priceListForm,
        code: priceListForm.code.trim().toUpperCase(),
        name: priceListForm.name.trim(),
        description: priceListForm.description.trim() || null,
      })
      setPriceListOpen(false)
      setPriceListForm(EMPTY_PRICE_LIST)
      reloadPriceLists()
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function submitUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      await api.post('/categories/units', {
        name: unitName.trim(),
        abbreviation: unitAbbreviation.trim() || undefined,
      })
      setUnitOpen(false)
      setUnitName('')
      setUnitAbbreviation('')
      reloadUnits()
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Price Lists &amp; UOM</h1>
        <p className="mt-1 text-sm text-ink-3">
          Manage the selling-price lists and measurement units used across the catalog.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Price Lists"
            subtitle="Select a list in POS or assign item-specific rates."
            action={(
              <Button
                size="sm"
                icon={<Plus size={15} />}
                onClick={() => {
                  setFormError(null)
                  setPriceListOpen(true)
                }}
              >
                Add price list
              </Button>
            )}
          />
          <div className="p-4">
            <FeedList
              rows={priceLists ?? []}
              rowKey={(row) => row.id}
              columns={priceListColumns}
              lead={(row) => initials(row.name)}
              title={(row) => row.name}
              subtitle={(row) => row.code}
              loading={loadingPriceLists}
              error={priceListError}
              onRetry={reloadPriceLists}
              emptyTitle="No price lists yet"
              emptyDescription="Create a list, then assign rates when adding or editing items."
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Units of Measure"
            subtitle="Units can be selected as an item's base or alternate UOM."
            action={(
              <Button
                size="sm"
                icon={<Plus size={15} />}
                onClick={() => {
                  setFormError(null)
                  setUnitOpen(true)
                }}
              >
                Add UOM
              </Button>
            )}
          />
          <div className="p-4">
            <FeedList
              rows={units ?? []}
              rowKey={(row) => row.id}
              columns={[]}
              lead={(row) => initials(row.name)}
              title={(row) => row.name}
              subtitle={(row) => row.abbreviation || '—'}
              loading={loadingUnits}
              error={unitError}
              onRetry={reloadUnits}
              emptyTitle="No units yet"
              emptyDescription="Add units such as piece, carton, kilogram, or liter."
            />
          </div>
        </Card>
      </div>

      <Modal
        open={priceListOpen}
        title="Add Price List"
        size="sm"
        onClose={() => setPriceListOpen(false)}
        footer={(
          <>
            <Button variant="outline" type="button" onClick={() => setPriceListOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="price-list-form" loading={saving}>
              Save price list
            </Button>
          </>
        )}
      >
        <form id="price-list-form" onSubmit={submitPriceList} className="space-y-4">
          {formError && <p role="alert" className="rounded-lg bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">{formError}</p>}
          <Field label="Code" required hint="Short unique code, such as WHOLESALE.">
            <Input
              value={priceListForm.code}
              onChange={(event) => setPriceListForm((form) => ({ ...form, code: event.target.value }))}
              required
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={priceListForm.name}
              onChange={(event) => setPriceListForm((form) => ({ ...form, name: event.target.value }))}
              required
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={priceListForm.description}
              onChange={(event) => setPriceListForm((form) => ({ ...form, description: event.target.value }))}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={priceListForm.isDefault}
              onChange={(event) => setPriceListForm((form) => ({ ...form, isDefault: event.target.checked }))}
              className="h-4 w-4 rounded border-line text-accent focus:ring-accent/30"
            />
            Set as default POS price list
          </label>
        </form>
      </Modal>

      <Modal
        open={unitOpen}
        title="Add Unit of Measure"
        size="sm"
        onClose={() => setUnitOpen(false)}
        footer={(
          <>
            <Button variant="outline" type="button" onClick={() => setUnitOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="uom-form" loading={saving}>
              Save UOM
            </Button>
          </>
        )}
      >
        <form id="uom-form" onSubmit={submitUnit} className="space-y-4">
          {formError && <p role="alert" className="rounded-lg bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">{formError}</p>}
          <Field label="Unit name" required>
            <Input value={unitName} onChange={(event) => setUnitName(event.target.value)} required />
          </Field>
          <Field label="Abbreviation">
            <Input
              value={unitAbbreviation}
              onChange={(event) => setUnitAbbreviation(event.target.value)}
              placeholder="e.g. pcs, kg, L"
            />
          </Field>
        </form>
      </Modal>
    </div>
  )
}