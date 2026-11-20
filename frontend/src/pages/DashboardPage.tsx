import { AlertTriangle, Boxes, Package, Receipt, TrendingUp } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Spinner, ErrorState } from '@/components/ui/Feedback'
import { useFetch } from '@/hooks/useFetch'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import type { DashboardStats, TopSellingItem } from '@/types'

export function DashboardPage() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useFetch<DashboardStats>('/dashboard/stats')

  const topRevenue = Math.max(...(data?.topItems ?? []).map((r) => Number(r.revenue)), 1)

  const columns: Column<TopSellingItem>[] = [
    {
      header: '#',
      cell: (row) => {
        const rank = (data?.topItems ?? []).indexOf(row) + 1
        return (
          <span
            className={
              rank <= 3
                ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-soft text-xs font-semibold text-accent'
                : 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-line-2 text-xs font-medium text-ink-3'
            }
          >
            {rank}
          </span>
        )
      },
    },
    {
      header: 'Item',
      cell: (row) => <span className="font-medium text-ink">{row.name}</span>,
    },
    {
      header: 'Code',
      cell: (row) => <span className="text-ink-3">{row.itemCode}</span>,
    },
    {
      header: 'Qty Sold',
      align: 'right',
      cell: (row) => (
        <span className="font-medium">
          {formatNumber(row.quantity)} {row.unit}
        </span>
      ),
    },
    {
      header: 'Revenue',
      align: 'right',
      cell: (row) => {
        const pct = Math.max(2, Math.round((Number(row.revenue) / topRevenue) * 100))
        return (
          <div className="flex items-center justify-end gap-3">
            <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-line-2 sm:block">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-medium text-ink">{formatCurrency(row.revenue)}</span>
          </div>
        )
      },
    },
  ]

  return (
      <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">
          Welcome back, {user?.fullName?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="text-sm text-ink-3">Here is what is happening across your store today.</p>
      </div>

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
            <Card className="grid gap-5 bg-[#0e5a4a] p-5 text-white sm:grid-cols-2 sm:items-center">
              <div>
                <p className="text-xs font-medium text-white/70">Today&apos;s sales</p>
                <p className="mt-1 text-3xl font-semibold">{formatCurrency(data.today.sales)}</p>
                <p className="mt-1 text-xs text-white/75">
                  {data.today.invoiceCount} invoices · {formatCurrency(data.today.collected)} collected
                </p>
              </div>
              <div className="border-t border-white/20 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <p className="text-xs font-medium text-white/70">This month</p>
                <p className="mt-1 text-2xl font-semibold">{formatCurrency(data.month.sales)}</p>
                <p className="mt-1 text-xs text-white/75">
                  {data.month.invoiceCount} invoices · VAT {formatCurrency(data.month.tax)}
                </p>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-ink-3">Outstanding balances</p>
                  <p className="mt-1 text-sm font-semibold text-ink">Receivable and payable</p>
                </div>
                <Receipt size={17} className="text-accent-2" />
              </div>
              <div className="mt-4 flex h-2 overflow-hidden rounded-sm bg-line-2" aria-hidden="true">
                <span className="bg-accent" style={{ width: `${(Number(data.totals.receivable) + Number(data.totals.payable)) > 0 ? (Number(data.totals.receivable) / (Number(data.totals.receivable) + Number(data.totals.payable))) * 100 : 50}%` }} />
                <span className="bg-brand-amber" style={{ width: `${(Number(data.totals.receivable) + Number(data.totals.payable)) > 0 ? (Number(data.totals.payable) / (Number(data.totals.receivable) + Number(data.totals.payable))) * 100 : 50}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-ink-3">Receivable</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(data.totals.receivable)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-3">Payable</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(data.totals.payable)}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'Customers', value: data.totals.customers, icon: <Package size={16} /> },
              { label: 'Active items', value: data.totals.items, icon: <Boxes size={16} /> },
              { label: 'Low stock alerts', value: data.totals.lowStock, icon: <AlertTriangle size={16} /> },
            ].map((stat) => (
              <Card key={stat.label} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-[11px] font-medium text-ink-3">{stat.label}</p>
                  <p className="mt-0.5 text-lg font-semibold text-ink">{stat.value}</p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-soft text-accent-2">
                  {stat.icon}
                </span>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader
              title="Top Selling Items"
              subtitle="Your best performers by quantity sold"
              action={
                <span className="flex items-center gap-1.5 text-xs text-ink-3">
                  <TrendingUp size={14} /> Top 10
                </span>
              }
            />
            <DataTable
              columns={columns}
              rows={data.topItems}
              rowKey={(row) => row.itemId}
              emptyTitle="No sales yet"
              emptyDescription="Items you sell will be ranked here."
            />
          </Card>
        </>
      )}
    </div>
  )
}
