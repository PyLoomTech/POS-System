import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { EmptyState, ErrorState, Spinner } from './Feedback'

export interface Column<T> {
  header: string
  cell: (row: T) => ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: string
}

const ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  onRetry,
  emptyTitle = 'No records found',
  emptyDescription,
}: DataTableProps<T>) {
  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500',
                  ALIGN[column.align ?? 'left'],
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition hover:bg-slate-50/70">
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={cn(
                    'px-4 py-2.5 text-slate-700',
                    ALIGN[column.align ?? 'left'],
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
