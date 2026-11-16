import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  BookOpen,
  BookText,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Scale,
  ScrollText,
  Search,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { FeedList, initials } from '@/components/ui/FeedList'
import type { FeedColumn } from '@/components/ui/FeedList'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { api, getErrorMessage } from '@/lib/api'
import { cn, formatCurrency, formatDate, formatNumber, toNumber } from '@/lib/utils'
import type { Paginated } from '@/types'

type TabId = 'accounts' | 'journal' | 'trial-balance' | 'fiscal-periods'
type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
type BadgeTone = 'green' | 'red' | 'amber' | 'slate' | 'indigo'

const TABS: Array<{ id: TabId; label: string; icon: typeof BookOpen }> = [
  { id: 'accounts', label: 'Chart of Accounts', icon: BookOpen },
  { id: 'journal', label: 'Journal', icon: BookText },
  { id: 'trial-balance', label: 'Trial Balance', icon: Scale },
  { id: 'fiscal-periods', label: 'Fiscal Periods', icon: CalendarRange },
]

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense']

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
}

const ACCOUNT_TYPE_TONES: Record<string, BadgeTone> = {
  asset: 'indigo',
  liability: 'amber',
  equity: 'slate',
  revenue: 'green',
  expense: 'red',
}

const VOUCHER_TYPES = ['manual', 'adjustment', 'opening', 'payment', 'receipt']

const JOURNAL_STATUS_TONES: Record<string, BadgeTone> = {
  posted: 'green',
  draft: 'slate',
  cancelled: 'red',
}

interface Account {
  id: number
  accountCode: string
  name: string
  accountType: AccountType
  parentId: number | null
  isGroup: boolean
  openingBalance: string
  isSystem: boolean
  isActive: boolean
  debit?: number
  credit?: number
  balance?: number
  balanceType?: 'Dr' | 'Cr'
}

interface AccountTreeNode {
  account: Account
  depth: number
  hasChildren: boolean
}

interface LedgerEntry {
  id: string | number
  date: string
  voucherNumber: string
  narration: string | null
  debit: string
  credit: string
  balance: number
}

interface AccountLedger {
  account: Account
  openingBalance: string
  closingBalance: number
  entries: LedgerEntry[]
}

interface JournalLine {
  id: string | number
  accountId: number
  debit: string
  credit: string
  narration: string | null
  account?: { id: number; accountCode: string; name: string } | null
}

interface JournalEntry {
  id: string | number
  voucherNumber: string
  voucherDate: string
  voucherType: string | null
  narration: string | null
  status: string
  lines: JournalLine[]
}

interface JournalLineDraft {
  key: string
  accountId: string
  debit: string
  credit: string
  narration: string
}

interface TrialBalanceRow {
  accountId: number
  accountCode: string
  name: string
  accountType: string
  debit: number
  credit: number
  balance: number
}

interface TrialBalanceResponse {
  data: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
}

interface FiscalPeriod {
  id: number
  name: string
  startDate: string
  endDate: string
  isClosed: boolean
  closedBy: number | null
  closedAt: string | null
}

function newJournalLine(): JournalLineDraft {
  return { key: Math.random().toString(36).slice(2), accountId: '', debit: '', credit: '', narration: '' }
}

export function AccountingPage() {
  const [tab, setTab] = useState<TabId>('accounts')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-line bg-white/70 p-1.5 shadow-sm">
        {TABS.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
                active ? 'bg-accent text-white shadow-sm' : 'text-ink-2 hover:bg-line-2',
              )}
            >
              <Icon size={16} />
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === 'accounts' && <AccountsTab />}
      {tab === 'journal' && <JournalTab />}
      {tab === 'trial-balance' && <TrialBalanceTab />}
      {tab === 'fiscal-periods' && <FiscalPeriodsTab />}
    </div>
  )
}

function AccountsTab() {
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const url = `/accounting/accounts?${typeFilter ? `type=${typeFilter}&` : ''}${
    query ? `search=${encodeURIComponent(query)}` : ''
  }`
  const { data, loading, error, reload } = useFetch<{ data: Account[] }>(url)
  const accounts = data?.data ?? []

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const treeRows = useMemo<AccountTreeNode[]>(() => {
    const source = data?.data ?? []
    const byId = new Map(source.map((account) => [account.id, account]))
    const childrenOf = new Map<number, Account[]>()
    const roots: Account[] = []
    for (const account of source) {
      if (account.parentId != null && byId.has(account.parentId)) {
        const list = childrenOf.get(account.parentId) ?? []
        list.push(account)
        childrenOf.set(account.parentId, list)
      } else {
        roots.push(account)
      }
    }
    const byCode = (a: Account, b: Account) => a.accountCode.localeCompare(b.accountCode)
    roots.sort(byCode)
    for (const list of childrenOf.values()) list.sort(byCode)

    const out: AccountTreeNode[] = []
    const walk = (account: Account, depth: number) => {
      const children = childrenOf.get(account.id) ?? []
      out.push({ account, depth, hasChildren: children.length > 0 })
      if (!collapsed.has(account.id)) {
        for (const child of children) walk(child, depth + 1)
      }
    }
    for (const root of roots) walk(root, 0)
    return out
  }, [data, collapsed])

  function toggleNode(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState({
    accountCode: '',
    name: '',
    accountType: 'asset' as AccountType,
    parentId: '',
    isGroup: false,
    openingBalance: '0',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [ledgerAccount, setLedgerAccount] = useState<Account | null>(null)
  const [ledger, setLedger] = useState<AccountLedger | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  function openCreate() {
    setEditing(null)
    setForm({ accountCode: '', name: '', accountType: 'asset', parentId: '', isGroup: false, openingBalance: '0' })
    setFormError(null)
    setOpen(true)
  }

  function openEdit(account: Account) {
    setEditing(account)
    setForm({
      accountCode: account.accountCode,
      name: account.name,
      accountType: account.accountType,
      parentId: account.parentId ? String(account.parentId) : '',
      isGroup: account.isGroup,
      openingBalance: String(toNumber(account.openingBalance)),
    })
    setFormError(null)
    setOpen(true)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    const payload = {
      accountCode: form.accountCode.trim(),
      name: form.name.trim(),
      accountType: form.accountType,
      parentId: form.parentId ? Number(form.parentId) : null,
      isGroup: form.isGroup,
      openingBalance: toNumber(form.openingBalance),
    }
    try {
      if (editing) {
        await api.put(`/accounting/accounts/${editing.id}`, payload)
      } else {
        await api.post('/accounting/accounts', payload)
      }
      setOpen(false)
      setEditing(null)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function loadLedger(accountId: number, fromDate = from, toDate = to) {
    setLedgerLoading(true)
    setLedgerError(null)
    try {
      const params = new URLSearchParams()
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      const qs = params.toString()
      const { data: result } = await api.get<AccountLedger>(
        `/accounting/accounts/${accountId}/ledger${qs ? `?${qs}` : ''}`,
      )
      setLedger(result)
    } catch (err) {
      setLedgerError(getErrorMessage(err))
    } finally {
      setLedgerLoading(false)
    }
  }

  function openLedger(account: Account) {
    setLedgerAccount(account)
    setLedger(null)
    void loadLedger(account.id)
  }

  const columns: Column<AccountTreeNode>[] = [
    {
      header: 'Code',
      cell: ({ account }) => (
        <span className="font-mono text-xs text-ink-3">{account.accountCode}</span>
      ),
    },
    {
      header: 'Account',
      cell: ({ account, depth, hasChildren }) => (
        <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleNode(account.id)}
              className="rounded p-0.5 text-ink-3 transition-colors hover:bg-line-2 hover:text-ink"
              aria-label={collapsed.has(account.id) ? 'Expand' : 'Collapse'}
            >
              {collapsed.has(account.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            </button>
          ) : (
            <span className="inline-block w-[19px]" />
          )}
          <span
            className={cn(
              'truncate',
              account.isGroup ? 'font-semibold text-ink' : 'font-medium text-ink',
            )}
          >
            {account.name}
          </span>
          {account.isGroup && <Badge tone="indigo">Group</Badge>}
        </div>
      ),
    },
    {
      header: 'Type',
      cell: ({ account }) => (
        <Badge tone={ACCOUNT_TYPE_TONES[account.accountType] ?? 'slate'}>
          {ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType}
        </Badge>
      ),
    },
    {
      header: 'Debit',
      align: 'right',
      cell: ({ account }) => (
        <span className="text-ink">{formatCurrency(account.debit ?? 0)}</span>
      ),
    },
    {
      header: 'Credit',
      align: 'right',
      cell: ({ account }) => (
        <span className="text-ink">{formatCurrency(account.credit ?? 0)}</span>
      ),
    },
    {
      header: 'Balance',
      align: 'right',
      cell: ({ account }) => (
        <span className="font-medium text-ink">
          {formatCurrency(account.balance ?? 0)}
          <span
            className={cn(
              'ml-1.5 text-[11px] font-semibold',
              account.balanceType === 'Dr' ? 'text-accent' : 'text-brand-amber',
            )}
          >
            {account.balanceType ?? 'Dr'}
          </span>
        </span>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: ({ account }) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<ScrollText size={14} />}
            onClick={() => openLedger(account)}
          >
            Ledger
          </Button>
          <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => openEdit(account)}>
            Edit
          </Button>
        </div>
      ),
    },
  ]

  const ledgerColumns: Column<LedgerEntry>[] = [
    { header: 'Date', cell: (row) => formatDate(row.date) },
    {
      header: 'Voucher',
      cell: (row) => <span className="font-mono text-xs text-ink-3">{row.voucherNumber}</span>,
    },
    { header: 'Narration', cell: (row) => row.narration ?? <span className="text-ink-3">—</span> },
    {
      header: 'Debit',
      align: 'right',
      cell: (row) =>
        toNumber(row.debit) > 0 ? (
          <span className="text-ink">{formatCurrency(row.debit)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      header: 'Credit',
      align: 'right',
      cell: (row) =>
        toNumber(row.credit) > 0 ? (
          <span className="text-ink">{formatCurrency(row.credit)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      header: 'Balance',
      align: 'right',
      cell: (row) => <span className="font-medium text-ink">{formatCurrency(row.balance)}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(search.trim())
          }}
        >
          <Field label="Type" className="w-40">
            <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">All types</option>
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACCOUNT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="relative mb-[2px]">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
            />
            <Input
              className="w-60 pl-9"
              placeholder="Search code or name…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
            Expand all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCollapsed(new Set(accounts.map((account) => account.id)))}
          >
            Collapse all
          </Button>
          <Button icon={<Plus size={16} />} onClick={openCreate}>
            New Account
          </Button>
        </div>
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={treeRows}
          rowKey={(row) => row.account.id}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No accounts"
          emptyDescription="Create accounts to build your chart of accounts."
        />
      </Card>

      <Modal
        open={open}
        title={editing ? `Edit Account — ${editing.accountCode}` : 'New Account'}
        size="md"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="account-form" loading={saving}>
              {editing ? 'Save Changes' : 'Save Account'}
            </Button>
          </>
        }
      >
        <form id="account-form" onSubmit={onSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">{formError}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Account code" required>
              <Input
                value={form.accountCode}
                onChange={(event) => setForm((prev) => ({ ...prev, accountCode: event.target.value }))}
                required
              />
            </Field>
            <Field label="Account type" required>
              <Select
                value={form.accountType}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, accountType: event.target.value as AccountType }))
                }
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ACCOUNT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" required className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </Field>
            <Field label="Parent account">
              <Select
                value={form.parentId}
                onChange={(event) => setForm((prev) => ({ ...prev, parentId: event.target.value }))}
              >
                <option value="">— None —</option>
                {accounts
                  .filter((account) => account.id !== editing?.id)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountCode} · {account.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Opening balance">
              <Input
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, openingBalance: event.target.value }))
                }
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line text-accent focus:ring-accent/30"
              checked={form.isGroup}
              onChange={(event) => setForm((prev) => ({ ...prev, isGroup: event.target.checked }))}
            />
            This is a group / header account
          </label>
        </form>
      </Modal>

      <Modal
        open={ledgerAccount !== null}
        title={ledgerAccount ? `Account Ledger — ${ledgerAccount.accountCode} ${ledgerAccount.name}` : 'Account Ledger'}
        size="lg"
        onClose={() => setLedgerAccount(null)}
        footer={
          <Button variant="outline" onClick={() => setLedgerAccount(null)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From" className="w-40">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="To" className="w-40">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
            <Button
              variant="outline"
              onClick={() => ledgerAccount && void loadLedger(ledgerAccount.id, from, to)}
            >
              Apply
            </Button>
          </div>

          {ledgerLoading ? (
            <Spinner label="Loading ledger…" />
          ) : ledgerError ? (
            <p className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">{ledgerError}</p>
          ) : ledger ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-line-2 px-4 py-3">
                  <p className="text-xs text-ink-3">Opening balance</p>
                  <p className="mt-1 text-lg font-semibold text-ink">
                    {formatCurrency(ledger.openingBalance)}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-soft px-4 py-3">
                  <p className="text-xs text-ink-3">Closing balance</p>
                  <p className="mt-1 text-lg font-semibold text-accent-2">
                    {formatCurrency(ledger.closingBalance)}
                  </p>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-line">
                <DataTable
                  columns={ledgerColumns}
                  rows={ledger.entries}
                  rowKey={(row) => String(row.id)}
                  emptyTitle="No ledger entries"
                  emptyDescription="Posted journal lines for this account will appear here."
                />
              </div>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}

function JournalTab() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('')
  const params = new URLSearchParams({ page: '1', limit: '50' })
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (status) params.set('status', status)
  const { data, loading, error, reload } = useFetch<Paginated<JournalEntry>>(
    `/accounting/journal?${params.toString()}`,
  )
  const { data: accountData } = useFetch<{ data: Account[] }>('/accounting/accounts')

  const [open, setOpen] = useState(false)
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().slice(0, 10))
  const [voucherType, setVoucherType] = useState('manual')
  const [narration, setNarration] = useState('')
  const [lines, setLines] = useState<JournalLineDraft[]>([newJournalLine(), newJournalLine()])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const accounts = accountData?.data ?? []

  function openCreate() {
    setVoucherDate(new Date().toISOString().slice(0, 10))
    setVoucherType('manual')
    setNarration('')
    setLines([newJournalLine(), newJournalLine()])
    setFormError(null)
    setOpen(true)
  }

  function updateLine(key: string, patch: Partial<JournalLineDraft>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  const totalDebit = lines.reduce((sum, line) => sum + toNumber(line.debit), 0)
  const totalCredit = lines.reduce((sum, line) => sum + toNumber(line.credit), 0)
  const difference = totalDebit - totalCredit
  const balanced = Math.abs(difference) < 0.005 && totalDebit > 0
  const canSubmit = balanced && lines.every((line) => line.accountId !== '')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    const payload = {
      voucherDate,
      voucherType: voucherType || null,
      narration: narration.trim() || null,
      lines: lines.map((line) => ({
        accountId: Number(line.accountId),
        debit: toNumber(line.debit),
        credit: toNumber(line.credit),
        narration: line.narration.trim() || null,
      })),
    }
    try {
      await api.post('/accounting/journal', payload)
      setOpen(false)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const columns: FeedColumn<JournalEntry>[] = [
    { header: 'Type', hideOnMobile: true, cell: (row) => row.voucherType ?? '—' },
    { header: 'Narration', hideOnMobile: true, cell: (row) => row.narration ?? '—' },
    {
      header: 'Amount',
      width: '150px',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-ink">
          {formatCurrency(row.lines.reduce((sum, line) => sum + toNumber(line.debit), 0))}
        </span>
      ),
    },
    {
      header: 'Status',
      width: '120px',
      align: 'center',
      cell: (row) => (
        <Badge tone={JOURNAL_STATUS_TONES[row.status] ?? 'slate'}>{row.status}</Badge>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="From" className="w-40">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To" className="w-40">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Field label="Status" className="w-40">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>
          New Journal Entry
        </Button>
      </div>

      <FeedList
        rows={data?.data ?? []}
        rowKey={(row) => String(row.id)}
        columns={columns}
        lead={(row) => initials(row.voucherNumber)}
        title={(row) => row.voucherNumber}
        subtitle={(row) => formatDate(row.voucherDate)}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No journal entries"
        emptyDescription="Manual and system-generated vouchers will be listed here."
        emptyIcon={<BookText size={20} />}
      />

      <Modal
        open={open}
        title="New Journal Entry"
        size="lg"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="journal-form" loading={saving} disabled={!canSubmit}>
              Post Entry
            </Button>
          </>
        }
      >
        <form id="journal-form" onSubmit={onSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">{formError}</div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Voucher date">
              <Input
                type="date"
                value={voucherDate}
                onChange={(event) => setVoucherDate(event.target.value)}
              />
            </Field>
            <Field label="Voucher type">
              <Select value={voucherType} onChange={(event) => setVoucherType(event.target.value)}>
                {VOUCHER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Narration" className="sm:col-span-1">
              <Input
                value={narration}
                onChange={(event) => setNarration(event.target.value)}
                placeholder="Optional memo"
              />
            </Field>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Lines</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => setLines((prev) => [...prev, newJournalLine()])}
              >
                Add line
              </Button>
            </div>

            {lines.map((line) => (
              <div
                key={line.key}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_120px_120px_1fr_auto] sm:items-end"
              >
                <Field label="Account">
                  <Select
                    value={line.accountId}
                    onChange={(event) => updateLine(line.key, { accountId: event.target.value })}
                  >
                    <option value="">— Select account —</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountCode} · {account.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Debit">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.debit}
                    onChange={(event) => updateLine(line.key, { debit: event.target.value, credit: '' })}
                  />
                </Field>
                <Field label="Credit">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.credit}
                    onChange={(event) => updateLine(line.key, { credit: event.target.value, debit: '' })}
                  />
                </Field>
                <Field label="Narration">
                  <Input
                    value={line.narration}
                    onChange={(event) => updateLine(line.key, { narration: event.target.value })}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() =>
                    setLines((prev) => (prev.length > 2 ? prev.filter((row) => row.key !== line.key) : prev))
                  }
                  className="mb-1 rounded-lg p-2 text-ink-3 hover:bg-[#f9e4e7] hover:text-brand-crimson"
                  aria-label="Remove line"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-line-2 px-4 py-3">
              <p className="text-xs text-ink-3">Total debit</p>
              <p className="mt-1 text-base font-semibold text-ink">{formatCurrency(totalDebit)}</p>
            </div>
            <div className="rounded-2xl border border-line bg-line-2 px-4 py-3">
              <p className="text-xs text-ink-3">Total credit</p>
              <p className="mt-1 text-base font-semibold text-ink">{formatCurrency(totalCredit)}</p>
            </div>
            <div
              className={cn(
                'rounded-2xl border px-4 py-3',
                balanced ? 'border-[#b7e0d2] bg-[#e3f2ec]' : 'border-[#e6cfa3] bg-[#f7efdd]',
              )}
            >
              <p className="text-xs text-ink-3">Difference</p>
              <p
                className={cn(
                  'mt-1 text-base font-semibold',
                  balanced ? 'text-brand-green' : 'text-brand-amber',
                )}
              >
                {formatCurrency(difference)}
              </p>
            </div>
          </div>
          {!balanced && (
            <p className="text-xs text-brand-amber">
              Debit and credit totals must be equal and greater than zero before the entry can be posted.
            </p>
          )}
        </form>
      </Modal>
    </div>
  )
}

function TrialBalanceTab() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  const { data, loading, error, reload } = useFetch<TrialBalanceResponse>(
    `/accounting/trial-balance${qs ? `?${qs}` : ''}`,
  )

  const columns: Column<TrialBalanceRow>[] = [
    {
      header: 'Code',
      cell: (row) => <span className="font-mono text-xs text-ink-3">{row.accountCode}</span>,
    },
    {
      header: 'Account',
      cell: (row) => (
        <div>
          <p className="font-medium text-ink">{row.name}</p>
          <p className="text-xs text-ink-3">
            {ACCOUNT_TYPE_LABELS[row.accountType] ?? row.accountType}
          </p>
        </div>
      ),
    },
    {
      header: 'Debit',
      align: 'right',
      cell: (row) => <span className="text-ink">{formatCurrency(row.debit)}</span>,
    },
    {
      header: 'Credit',
      align: 'right',
      cell: (row) => <span className="text-ink">{formatCurrency(row.credit)}</span>,
    },
  ]

  const rows = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="From" className="w-40">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="To" className="w-40">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.accountId}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No trial balance data"
          emptyDescription="Post journal entries to see account balances here."
        />
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-line-2 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Totals</span>
            <div className="flex items-center gap-8 text-sm">
              <span className="text-ink-3">
                Total debit{' '}
                <span className="font-semibold text-ink">
                  {formatCurrency(data?.totalDebit)}
                </span>
              </span>
              <span className="text-ink-3">
                Total credit{' '}
                <span className="font-semibold text-ink">
                  {formatCurrency(data?.totalCredit)}
                </span>
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function FiscalPeriodsTab() {
  const { data, loading, error, reload } = useFetch<{ data: FiscalPeriod[] }>('/accounting/fiscal-periods')

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [closing, setClosing] = useState<number | null>(null)

  function openCreate() {
    setName('')
    setStartDate('')
    setEndDate('')
    setFormError(null)
    setOpen(true)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    if (!startDate || !endDate) {
      setFormError('Start and end dates are required.')
      return
    }
    setSaving(true)
    try {
      await api.post('/accounting/fiscal-periods', { name: name.trim(), startDate, endDate })
      setOpen(false)
      reload()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function onClose(period: FiscalPeriod) {
    if (!window.confirm(`Close fiscal period “${period.name}”? This cannot be undone.`)) return
    setClosing(period.id)
    try {
      await api.post(`/accounting/fiscal-periods/${period.id}/close`)
      reload()
    } catch (err) {
      window.alert(getErrorMessage(err))
    } finally {
      setClosing(null)
    }
  }

  const columns: Column<FiscalPeriod>[] = [
    {
      header: 'Name',
      cell: (row) => <span className="font-medium text-ink">{row.name}</span>,
    },
    { header: 'Start', cell: (row) => formatDate(row.startDate) },
    { header: 'End', cell: (row) => formatDate(row.endDate) },
    {
      header: 'Status',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.isClosed ? 'slate' : 'green'}>{row.isClosed ? 'Closed' : 'Open'}</Badge>
      ),
    },
    {
      header: 'Closed at',
      cell: (row) => (row.closedAt ? formatDate(row.closedAt) : <span className="text-ink-3">—</span>),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) =>
        row.isClosed ? (
          <span className="text-xs text-ink-3">Closed</span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            icon={<Check size={14} />}
            loading={closing === row.id}
            onClick={() => void onClose(row)}
          >
            Close period
          </Button>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-3">
          Closing a period locks the books for that date range. Tracking {formatNumber(data?.data.length ?? 0)} period(s).
        </p>
        <Button icon={<Plus size={16} />} onClick={openCreate}>
          New Period
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
          emptyTitle="No fiscal periods"
          emptyDescription="Create a fiscal period to organise your accounting year."
        />
      </Card>

      <Modal
        open={open}
        title="New Fiscal Period"
        size="sm"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="fiscal-form" loading={saving}>
              Save Period
            </Button>
          </>
        }
      >
        <form id="fiscal-form" onSubmit={onSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-[#f9e4e7] px-3 py-2 text-xs text-brand-crimson">{formError}</div>
          )}
          <Field label="Name" required hint="e.g. FY 2026-2027">
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" required>
              <Input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </Field>
            <Field label="End date" required>
              <Input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  )
}
