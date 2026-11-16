import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[linear-gradient(180deg,#0f78c9,#0a62ac)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.26),0_2px_8px_rgba(11,106,186,.26)] hover:bg-[linear-gradient(180deg,#0b6aba,#0a5a9e)]',
  secondary: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
  danger:
    'border border-[#e3b7be] bg-white/70 text-brand-crimson hover:bg-[#fbf0f2]',
  outline: 'border border-line bg-white/70 text-ink hover:border-[rgba(11,106,186,.42)]',
  ghost: 'text-ink-2 hover:bg-line-2 hover:text-ink',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-2.5 text-[13px]',
  md: 'min-h-9 px-3.5 text-sm',
  lg: 'min-h-[38px] px-4 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-[7px] rounded-md border border-transparent font-medium whitespace-nowrap transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
