import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { EmptyState, ErrorState, Spinner } from './Feedback'

export interface Column<T> {
  header: string
  cell: (row: T) => ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
  sortKey?: string
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
  sortKey?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (key: string) => void
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
  sortKey,
  sortDirection = 'asc',
  onSort,
}: DataTableProps<T>) {
  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={cn(
                  'whitespace-nowrap border-b border-line px-3.5 py-2.5 text-[12.5px] font-medium text-ink-3',
                  ALIGN[column.align ?? 'left'],
                  column.className,
                )}
                aria-sort={sortKey === column.sortKey
                  ? sortDirection === 'asc' ? 'ascending' : 'descending'
                  : undefined}
              >
                {onSort && column.sortKey ? (
                  <button
                    type="button"
                    className="font-inherit hover:text-ink"
                    onClick={() => onSort(column.sortKey!)}
                  >
                    {column.header}
                    {sortKey === column.sortKey && (
                      <span className="ml-1 text-[10px]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </button>
                ) : column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-t border-line-2 transition hover:bg-[rgba(43,155,227,.07)]"
            >
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={cn(
                    'px-3.5 py-3 text-ink-2 align-middle',
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
