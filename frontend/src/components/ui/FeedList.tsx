import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { EmptyState, ErrorState, Spinner } from './Feedback'

export interface FeedColumn<T> {
  /** Column header shown in the desktop head row. */
  header?: string
  cell: (row: T) => ReactNode
  /** Fixed track width, e.g. '120px'. Defaults to `auto`. */
  width?: string
  align?: 'left' | 'right' | 'center'
  /** Hide this column on narrow screens (prototype's `.fcol.opt`). */
  hideOnMobile?: boolean
  className?: string
}

interface FeedListProps<T> {
  rows: T[]
  rowKey: (row: T) => string | number
  columns: FeedColumn<T>[]
  /** Lead avatar: initials or an icon. */
  lead: (row: T) => ReactNode
  title: (row: T) => ReactNode
  subtitle?: (row: T) => ReactNode
  /** Row click performs the existing View/Edit action as a full-row button. */
  onRowClick?: (row: T) => void
  /** Optional trailing row action (rendered above the row hit target). */
  rowAction?: (row: T) => ReactNode
  /** Group rows into dated bands; return a stable key per row. */
  groupByDate?: (row: T) => string
  /** Label + meta for a date band, e.g. { label: 'Today', meta: 'Rs. 12,400' }. */
  dayLabel?: (rows: T[]) => { label: string; meta?: string }
  /** Filters toolbar rendered above the list inside the panel. */
  toolbar?: ReactNode
  /** Summary line rendered below the list. */
  footer?: ReactNode
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: ReactNode
}

/** Initials for a `.feed-lead` avatar, e.g. "Pyloom Traders" → "PT". */
export function initials(value?: string | null): string {
  if (!value) return '—'
  const parts = value.trim().split(/\s+/).slice(0, 2)
  const text = parts.map((part) => part[0]?.toUpperCase() ?? '').join('')
  return text || '—'
}

export function FeedMeter({
  value,
  tone = 'accent',
}: {
  value: number
  tone?: 'accent' | 'green' | 'amber' | 'red'
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const tones = {
    accent: 'bg-[#2b9be3]',
    green: 'bg-[#12a07e]',
    amber: 'bg-[#e9a013]',
    red: 'bg-brand-crimson',
  }
  return (
    <span className="feed-meter">
      <i className={tones[tone]} style={{ width: `${pct}%` }} />
    </span>
  )
}

export function FeedValue({
  children,
  sub,
  className,
}: {
  children: ReactNode
  sub?: ReactNode
  className?: string
}) {
  return (
    <>
      <span className={cn('fv', className)}>{children}</span>
      {sub && <span className="fs">{sub}</span>}
    </>
  )
}

function groupRows<T>(rows: T[], groupByDate?: (row: T) => string): Array<{ key: string; rows: T[] }> {
  if (!groupByDate) return [{ key: '', rows }]
  const groups: Array<{ key: string; rows: T[] }> = []
  for (const row of rows) {
    const key = groupByDate(row)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else groups.push({ key, rows: [row] })
  }
  return groups
}

export function FeedList<T>({
  rows,
  rowKey,
  columns,
  lead,
  title,
  subtitle,
  onRowClick,
  rowAction,
  groupByDate,
  dayLabel,
  toolbar,
  footer,
  loading = false,
  error,
  onRetry,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  emptyIcon,
}: FeedListProps<T>) {
  if (loading) {
    return (
      <div className="surface rounded-xl">
        {toolbar && <div className="feed-tool">{toolbar}</div>}
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="surface rounded-xl">
        {toolbar && <div className="feed-tool">{toolbar}</div>}
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    )
  }

  const gridTemplate = [
    'minmax(0, 1fr)',
    ...columns.map((column) => column.width ?? 'auto'),
    ...(rowAction ? ['auto'] : []),
  ].join(' ')

  const groups = groupRows(rows, groupByDate)

  return (
    <div className="surface overflow-hidden rounded-xl">
      {toolbar && <div className="feed-tool">{toolbar}</div>}

      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} icon={emptyIcon} />
      ) : (
        <>
          <div className="feed-head" style={{ gridTemplateColumns: gridTemplate }}>
            <span />
            {columns.map((column, index) => (
              <span
                key={column.header ?? index}
                className={cn(
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                  column.hideOnMobile && 'opt',
                )}
              >
                {column.header}
              </span>
            ))}
            {rowAction && <span />}
          </div>

          {groups.map((group, groupIndex) => {
            const label = groupByDate && dayLabel ? dayLabel(group.rows) : null
            return (
              <div key={group.key || groupIndex}>
                {label && (
                  <div className="feed-day">
                    <b>{label.label}</b>
                    <span>{label.meta}</span>
                  </div>
                )}
                <div className="feed-group">
                  {group.rows.map((row) => (
                    <div
                      key={rowKey(row)}
                      className={cn('feed-row', onRowClick && 'feed-row-hit')}
                      style={{ gridTemplateColumns: gridTemplate }}
                    >
                      {onRowClick && (
                        <button
                          type="button"
                          className="feed-hit"
                          onClick={() => onRowClick(row)}
                          aria-label="Open row"
                        />
                      )}
                      <div className="feed-main">
                        <span className="feed-lead">{lead(row)}</span>
                        <div className="feed-title">
                          <b>{title(row)}</b>
                          {subtitle && <span>{subtitle(row)}</span>}
                        </div>
                      </div>
                      {columns.map((column, index) => (
                        <div
                          key={column.header ?? index}
                          className={cn(
                            'feed-col',
                            column.align === 'right' && 'right',
                            column.align === 'center' && 'center',
                            column.hideOnMobile && 'opt',
                            column.className,
                          )}
                        >
                          {column.cell(row)}
                        </div>
                      ))}
                      {rowAction && <div className="feed-tail">{rowAction(row)}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}

      {footer && <div className="feed-end">{footer}</div>}
    </div>
  )
}
