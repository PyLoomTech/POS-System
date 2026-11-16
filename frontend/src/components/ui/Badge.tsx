import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BadgeTone = 'green' | 'red' | 'amber' | 'slate' | 'indigo'

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
}

const DOTS: Record<BadgeTone, string> = {
  green: 'bg-[#12a07e]',
  red: 'bg-brand-crimson',
  amber: 'bg-[#e9a013]',
  slate: 'bg-[#8b9893]',
  indigo: 'bg-[#2b9be3]',
}

export function Badge({ tone = 'slate', children }: BadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white/75 px-2 py-0.5 text-[12px] font-medium text-ink-2">
      <i className={cn('h-[7px] w-[7px] shrink-0 rounded-full', DOTS[tone])} aria-hidden="true" />
      {children}
    </span>
  )
}
