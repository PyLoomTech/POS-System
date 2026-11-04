import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Package,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Card, CardHeader, StatCard } from '@/components/ui/Card'
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
                ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600'
                : 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500'
            }
          >
            {rank}
          </span>
        )
      },
    },
    {
      header: 'Item',
      cell: (row) => <span className="font-medium text-slate-800">{row.name}</span>,
    },
    {
      header: 'Code',
      cell: (row) => <span className="text-slate-500">{row.itemCode}</span>,
    },
    {
      header: 'Qty Sold',
      align: 'right',
      cell: (row) => <span className="font-medium">{formatNumber(row.quantity)}</span>,
    },
    {
      header: 'Revenue',
      align: 'right',
      cell: (row) => {
        const pct = Math.max(2, Math.round((Number(row.revenue) / topRevenue) * 100))
        return (
          <div className="flex items-center justify-end gap-3">
            <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-medium text-slate-800">{formatCurrency(row.revenue)}</span>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">
          Welcome back, {user?.fullName?.split(' ')[0] ?? 'there'}
        </h2>
        <p className="text-sm text-slate-500">Here is what is happening across your store today.</p>
      </div>

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Today's Sales"
              value={formatCurrency(data.today.sales)}
              hint={`${data.today.invoiceCount} invoice(s) · ${formatCurrency(data.today.collected)} collected`}
              icon={<TrendingUp size={18} />}
              tone="indigo"
            />
            <StatCard
              label="This Month"
              value={formatCurrency(data.month.sales)}
              hint={`${data.month.invoiceCount} invoice(s) · VAT ${formatCurrency(data.month.tax)}`}
              icon={<Receipt size={18} />}
              tone="emerald"
            />
            <StatCard
              label="Receivable"
              value={formatCurrency(data.totals.receivable)}
              hint="Outstanding from customers"
              icon={<ArrowDownLeft size={18} />}
              tone="amber"
            />
            <StatCard
              label="Payable"
              value={formatCurrency(data.totals.payable)}
              hint="Outstanding to suppliers"
              icon={<ArrowUpRight size={18} />}
              tone="red"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Customers"
              value={String(data.totals.customers)}
              icon={<Users size={18} />}
              tone="slate"
            />
            <StatCard
              label="Active Items"
              value={String(data.totals.items)}
              icon={<Package size={18} />}
              tone="slate"
            />
            <StatCard
              label="Low Stock Alerts"
              value={String(data.totals.lowStock)}
              icon={data.totals.lowStock > 0 ? <AlertTriangle size={18} /> : <Boxes size={18} />}
              tone={data.totals.lowStock > 0 ? 'red' : 'slate'}
            />
          </div>

          <Card>
            <CardHeader
              title="Top Selling Items"
              subtitle="Your best performers by quantity sold"
              action={
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
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
