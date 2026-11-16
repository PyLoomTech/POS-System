import { cn } from '@/lib/utils'

export type DatePreset = 'today' | 'week' | 'month'

export const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
]

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** Presets only ever set the existing `from` / `to` dates. */
export function presetRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date()
  if (preset === 'today') return { from: iso(now), to: iso(now) }
  if (preset === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    return { from: iso(start), to: iso(now) }
  }
  return { from: `${iso(now).slice(0, 7)}-01`, to: iso(now) }
}

/**
 * Segmented date-range shortcut. Each button only writes the existing `from`
 * and `to` filter values — it never changes any other query parameter.
 * Custom ranges are entered directly in the from/to date inputs.
 */
export function DateRangePresets({
  from,
  to,
  onPick,
  className,
}: {
  from: string
  to: string
  onPick: (range: { from: string; to: string }) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className={cn(
        'flex items-center gap-0.5 rounded-md border border-line bg-white/70 p-0.5',
        className,
      )}
    >
      {DATE_PRESETS.map((preset) => {
        const range = presetRange(preset.id)
        const active = range.from === from && range.to === to
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(range)}
            className={cn(
              'rounded-[5px] px-2.5 py-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-line-2 hover:text-ink',
              active && 'bg-line-2 text-ink',
            )}
          >
            {preset.label}
          </button>
        )
      })}
    </div>
  )
}
