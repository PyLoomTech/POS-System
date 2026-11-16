import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { FeedList, initials } from '@/components/ui/FeedList'
import type { FeedColumn } from '@/components/ui/FeedList'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/context/AuthContext'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import type { PermissionDef, Role, UserRecord } from '@/types'

const EMPTY_FORM = {
  username: '',
  fullName: '',
  email: '',
  password: '',
  roleId: '',
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  users: 'Users',
  customers: 'Customers',
  suppliers: 'Suppliers',
  items: 'Items',
  inventory: 'Inventory',
  purchases: 'Purchases',
  sales: 'Sales',
  returns: 'Returns',
  payments: 'Payments',
  accounting: 'Accounting',
  reports: 'Reports',
  settings: 'Settings',
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? humanize(module)
}

export function UsersPage() {
  const { hasPermission } = useAuth()
  const { data, loading, error, reload } = useFetch<UserRecord[]>('/users')
  const { data: roles, reload: reloadRoles } = useFetch<Role[]>('/users/roles')
  const { data: permissionDefs } = useFetch<PermissionDef[]>('/users/permissions')

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Role permission editor — visible to roles that can manage users.
  const canManageRoles = hasPermission('users:edit')
  const [roleId, setRoleId] = useState('')
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [savingRole, setSavingRole] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [roleSaved, setRoleSaved] = useState(false)

  const selectedRole = (roles ?? []).find((role) => String(role.id) === roleId) ?? null
  const roleLocked = selectedRole?.name === 'Super Administrator'

  const modules = useMemo(() => {
    const grouped = new Map<string, PermissionDef[]>()
    for (const def of permissionDefs ?? []) {
      const list = grouped.get(def.module) ?? []
      list.push(def)
      grouped.set(def.module, list)
    }
    return Array.from(grouped, ([module, actions]) => ({ module, actions }))
  }, [permissionDefs])

  function selectRole(value: string) {
    setRoleId(value)
    setRoleError(null)
    setRoleSaved(false)
    const role = (roles ?? []).find((item) => String(item.id) === value)
    setDraft(new Set(role?.permissions ?? []))
  }

  function togglePermission(key: string) {
    setRoleSaved(false)
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleModule(actions: PermissionDef[], selectAll: boolean) {
    setRoleSaved(false)
    setDraft((prev) => {
      const next = new Set(prev)
      for (const action of actions) {
        const key = `${action.module}:${action.action}`
        if (selectAll) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  async function saveRolePermissions() {
    if (!selectedRole) return
    setSavingRole(true)
    setRoleError(null)
    setRoleSaved(false)
    try {
      await api.put(`/users/roles/${selectedRole.id}/permissions`, {
        permissions: Array.from(draft),
      })
      reloadRoles()
      setRoleSaved(true)
    } catch (err) {
      setRoleError(getErrorMessage(err))
    } finally {
      setSavingRole(false)
    }
  }

  const columns: FeedColumn<UserRecord>[] = [
    { header: 'Email', hideOnMobile: true, cell: (row) => row.email ?? '—' },
    {
      header: 'Role',
      width: '190px',
      cell: (row) => <Badge tone="indigo">{row.role?.name ?? '—'}</Badge>,
    },
    {
      header: 'Status',
      width: '120px',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.status === 'active' ? 'green' : 'slate'}>{row.status}</Badge>
      ),
    },
    {
      header: 'Last Login',
      width: '190px',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="text-ink-2">{formatDateTime(row.lastLogin)}</span>,
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
      await api.post('/users', {
        username: form.username.trim().toLowerCase(),
        fullName: form.fullName.trim(),
        email: form.email.trim() || null,
        password: form.password,
        roleId: Number(form.roleId),
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
      {hasPermission('users:create') && (
        <div className="flex items-center justify-end">
          <Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            New User
          </Button>
        </div>
      )}

      <FeedList
        rows={data ?? []}
        rowKey={(row) => row.id}
        columns={columns}
        lead={(row) => initials(row.fullName)}
        title={(row) => row.fullName}
        subtitle={(row) => row.username}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No users found"
        emptyDescription="Create a user to grant them access to the POS."
        emptyIcon={<ShieldCheck size={20} />}
      />

      {canManageRoles && (
        <Card>
          <CardHeader
            title="Roles & Permissions"
            subtitle="Pick a role, then tick the modules and actions it is allowed to use."
            action={<ShieldCheck size={18} className="text-accent" />}
          />
          <div className="space-y-4 p-5">
            <Field label="Role" className="max-w-sm">
              <Select value={roleId} onChange={(event) => selectRole(event.target.value)}>
                <option value="">— Select a role to edit —</option>
                {(roles ?? []).map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>

            {!selectedRole ? (
              <p className="text-sm text-ink-3">
                Select a role above to review or change what it can access.
              </p>
            ) : roleLocked ? (
              <div className="rounded-lg bg-soft px-3 py-2 text-xs text-accent-2">
                Super Administrator always has every permission and cannot be edited.
              </div>
            ) : (
              <>
                {roleError && (
                  <div className="rounded-lg bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">{roleError}</div>
                )}
                {roleSaved && (
                  <div className="rounded-lg bg-[#e3f2ec] px-3 py-2 text-xs text-brand-green">
                    Permissions saved. Affected users see the change after refreshing the page.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {modules.map(({ module, actions }) => {
                    const keys = actions.map((action) => `${action.module}:${action.action}`)
                    const allSelected = keys.every((key) => draft.has(key))
                    return (
                      <div key={module} className="rounded-xl border border-line p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink">{moduleLabel(module)}</p>
                          <button
                            type="button"
                            onClick={() => toggleModule(actions, !allSelected)}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            {allSelected ? 'Clear' : 'Select all'}
                          </button>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {actions.map((action) => {
                            const key = `${action.module}:${action.action}`
                            return (
                              <label
                                key={key}
                                className="flex cursor-pointer items-center gap-2 text-sm text-ink-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.has(key)}
                                  onChange={() => togglePermission(key)}
                                  className="h-4 w-4 rounded border-line text-accent focus:ring-accent/30"
                                />
                                {humanize(action.action)}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex items-center justify-end gap-3">
                  <p className="mr-auto text-xs text-ink-3">{draft.size} permission(s) selected</p>
                  <Button onClick={saveRolePermissions} loading={savingRole}>
                    Save Permissions
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      <Modal
        open={open}
        title="New User"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="user-form" loading={saving}>
              Save User
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {formError && (
            <div className="sm:col-span-2 rounded-lg bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">
              {formError}
            </div>
          )}
          <Field label="Full Name" required>
            <Input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />
          </Field>
          <Field label="Username" required>
            <Input value={form.username} onChange={(e) => update('username', e.target.value)} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </Field>
          <Field label="Role" required>
            <Select value={form.roleId} onChange={(e) => update('roleId', e.target.value)} required>
              <option value="">— Select role —</option>
              {(roles ?? []).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Password" required hint="Minimum 8 characters" className="sm:col-span-2">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              minLength={8}
              required
            />
          </Field>
        </form>
      </Modal>
    </div>
  )
}
