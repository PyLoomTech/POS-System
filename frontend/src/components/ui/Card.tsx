import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  className?: string
  children: ReactNode
}

export function Card({ className, children }: CardProps) {
  return <div className={cn('surface rounded-xl', className)}>{children}</div>
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 px-4 py-3.5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon: ReactNode
  tone?: 'indigo' | 'emerald' | 'amber' | 'red' | 'slate'
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  indigo: 'bg-blue-50 text-blue-700',
  emerald: 'bg-[#e0f1ea] text-brand-green',
  amber: 'bg-[#fbefd3] text-brand-amber',
  red: 'bg-[#f9e4e7] text-brand-crimson',
  slate: 'bg-slate-100 text-slate-600',
}

export function StatCard({ label, value, hint, icon, tone = 'indigo' }: StatCardProps) {
  return (
    <div className="surface rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink-3">{label}</p>
          <p className="mt-1 truncate text-[19px] font-semibold text-ink">{value}</p>
          {hint && <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{hint}</p>}
        </div>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            TONES[tone],
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}
