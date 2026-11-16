import { useState } from 'react'
import type { FormEvent } from 'react'
import { FolderTree, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FeedList, initials } from '@/components/ui/FeedList'
import type { FeedColumn } from '@/components/ui/FeedList'
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

  const columns: FeedColumn<Category>[] = [
    {
      header: 'Sub-categories',
      width: '140px',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="fv">{row.children?.length ?? 0}</span>,
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

      <FeedList
        rows={categories}
        rowKey={(row) => row.id}
        columns={columns}
        lead={(row) => initials(row.name)}
        title={(row) => row.name}
        subtitle={(row) =>
          row.parentId ? nameById.get(row.parentId) ?? '—' : 'Top-level category'
        }
        loading={loading}
        error={error}
        onRetry={reload}
        emptyIcon={<FolderTree size={20} />}
        emptyTitle="No categories yet"
        emptyDescription="Organise your items with categories and sub-categories."
      />

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
            <div className="rounded-lg bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">
              {formError}
            </div>
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
