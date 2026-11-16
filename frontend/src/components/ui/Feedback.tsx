import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-3">
      <Loader2 className="animate-spin" size={18} />
      {label}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
      {icon && (
        <span className="mb-2.5 inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-line-2 text-ink-3">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-[13.5px] text-ink-3">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium text-brand-crimson">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-medium text-accent hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  )
}
