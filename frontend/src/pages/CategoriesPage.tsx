import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import type { Category } from '@/types'

export function CategoriesPage() {
  const { data, loading, error, reload } = useFetch<Category[]>('/categories')

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const categories = data ?? []
  const nameById = new Map(categories.map((category) => [category.id, category.name]))

  const columns: Column<Category>[] = [
    {
      header: 'Name',
      cell: (row) => <span className="font-medium text-slate-800">{row.name}</span>,
    },
    {
      header: 'Parent',
      cell: (row) => (row.parentId ? nameById.get(row.parentId) ?? '—' : '—'),
    },
    {
      header: 'Sub-categories',
      align: 'right',
      cell: (row) => row.children?.length ?? 0,
    },
    {
      header: 'Status',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.isActive ? 'green' : 'slate'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ]

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      await api.post('/categories', {
        name: name.trim(),
        parentId: parentId ? Number(parentId) : undefined,
      })
      setOpen(false)
      setName('')
      setParentId('')
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>
          New Category
        </Button>
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={categories}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No categories yet"
          emptyDescription="Organise your items with categories and sub-categories."
        />
      </Card>

      <Modal
        open={open}
        title="New Category"
        size="sm"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="category-form" loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <form id="category-form" onSubmit={onSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</div>
          )}
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Parent Category" hint="Leave empty for a top-level category">
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— None —</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  )
}
