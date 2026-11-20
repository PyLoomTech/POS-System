import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Field, Input, Select } from '@/components/ui/Input'
import { ShiftControls } from '@/components/shifts/ShiftControls'
import type { CashierShift } from '@/components/shifts/ShiftControls'
import { useFetch } from '@/hooks/useFetch'
import { formatCurrency, formatDateTime } from '@/lib/utils'

interface ShiftPage extends CashierShift {
  actualClosing: number | string | null
  difference: number | string | null
}

interface ShiftList {
  data: ShiftPage[]
  total: number
  page: number
  limit: number
}

export function ShiftsPage() {
  const [shift, setShift] = useState<CashierShift | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cashierId, setCashierId] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [status, setStatus] = useState('')
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: '1', limit: '100', refresh: String(refreshKey) })
    if (from) params.set('from', `${from}T00:00:00`)
    if (to) params.set('to', `${to}T23:59:59`)
    if (cashierId) params.set('cashierId', cashierId)
    if (registerName) params.set('registerName', registerName)
    if (status) params.set('status', status)
    return `/shifts?${params}`
  }, [cashierId, from, refreshKey, registerName, status, to])
  const { data: currentShift, reload: reloadCurrentShift } = useFetch<CashierShift>('/shifts/current')
  const { data, loading, error, reload } = useFetch<ShiftList>(query)

  const columns: Column<ShiftPage>[] = [
    { header: 'Shift', cell: (row) => <span className="font-medium text-ink">{row.sessionNumber}</span> },
    { header: 'Cashier', cell: (row) => row.cashier.fullName },
    { header: 'Register', cell: (row) => row.registerName },
    { header: 'Opened', cell: (row) => formatDateTime(row.openingTime) },
    { header: 'Opening Cash', align: 'right', cell: (row) => formatCurrency(row.openingCash) },
    { header: 'Sales', align: 'right', cell: (row) => formatCurrency(row.summary.totalSales) },
    { header: 'Expected Cash', align: 'right', cell: (row) => formatCurrency(row.expectedCash) },
    {
      header: 'Actual / Variance',
      align: 'right',
      cell: (row) => row.actualClosing == null
        ? '—'
        : <span>{formatCurrency(row.actualClosing)} / {formatCurrency(row.difference ?? 0)}</span>,
    },
    {
      header: 'Status',
      cell: (row) => <Badge tone={row.status === 'open' ? 'green' : 'slate'}>{row.status}</Badge>,
    },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-ink">Cashier Shifts</h2>
        <p className="text-sm text-ink-3">Open the register, reconcile the drawer, and review shift history.</p>
      </div>

      <ShiftControls
        shift={shift ?? currentShift}
        onShiftChange={setShift}
        onRefresh={() => {
          setRefreshKey((key) => key + 1)
          reloadCurrentShift()
        }}
      />

      <Card>
        <CardHeader title="Shift Register" subtitle="Shift opening and closing, sales and cash variance" />
        <div className="grid gap-3 border-b border-line-2 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="From"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          <Field label="Cashier ID" hint="Leave blank for your shifts">
            <Input inputMode="numeric" value={cashierId} onChange={(event) => setCashierId(event.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Register">
            <Input value={registerName} onChange={(event) => setRegisterName(event.target.value)} placeholder="All registers" />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
        </div>
        <div className="p-3">
          <DataTable
                columns={columns}
                rows={data?.data ?? []}
                rowKey={(row) => row.id}
                loading={loading}
                error={error}
                onRetry={reload}
                emptyTitle="No shifts found"
                emptyDescription="Open or close a shift to see its register record here."
              />
        </div>
      </Card>
    </div>
  )
}
