import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

const BASE =
  'w-full rounded-md border border-[rgba(30,80,130,.24)] bg-white/80 px-3 py-2 text-sm text-ink transition placeholder:text-slate-400 hover:border-[rgba(11,106,186,.45)] focus:border-accent focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-[rgba(20,70,120,.07)] disabled:text-ink-3'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, className)} {...props} />
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(BASE, 'pr-8', className)} {...props}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(BASE, 'resize-y', className)} {...props} />
}

interface FieldProps {
  label?: string
  required?: boolean
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}

export function Field({ label, required, hint, error, className, children }: FieldProps) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      {label && (
        <span className="block text-[13px] font-medium text-ink-2">
          {label}
          {required && <span className="text-brand-crimson"> *</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="block text-[12.5px] text-ink-3">{hint}</span>}
      {error && <span className="block text-[12.5px] text-brand-crimson">{error}</span>}
    </label>
  )
}
