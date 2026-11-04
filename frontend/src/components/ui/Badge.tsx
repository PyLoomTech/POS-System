import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BadgeTone = 'green' | 'red' | 'amber' | 'slate' | 'indigo'

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
}

const TONES: Record<BadgeTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  indigo: 'bg-blue-50 text-blue-700 ring-blue-600/20',
}

export function Badge({ tone = 'slate', children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
      )}
    >
      {children}
    </span>
  )
}
