import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

// Large modals (`lg`) open as right-side sheets; small/medium ones stay centred.
const CENTERED_SIZES: Record<'sm' | 'md', string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="rounded-lg p-1 text-ink-3 transition hover:bg-line-2 hover:text-ink"
      aria-label="Close"
    >
      <X size={18} />
    </button>
  )
}

function Scrim({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close dialog"
      className="absolute inset-0 bg-rail/35 backdrop-blur-[4px] animate-[fade_.16s_ease-out]"
    />
  )
}

export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  if (size === 'lg') {
    return (
      <div className="fixed inset-0 z-50">
        <Scrim onClose={onClose} />
        <div
          className="surface-strong absolute inset-y-0 right-0 flex w-[min(740px,100vw)] flex-col shadow-[-14px_0_40px_rgba(15,30,26,.18)] animate-[slide_.2s_cubic-bezier(.2,.8,.3,1)]"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-[18px] py-[15px]">
            <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
            <CloseButton onClose={onClose} />
          </header>
          <div className="flex-1 overflow-y-auto p-[18px]">{children}</div>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-[18px] py-3">
              {footer}
            </footer>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <Scrim onClose={onClose} />
      <div
        className={cn(
          'surface-strong relative z-10 w-full rounded-xl shadow-[0_20px_60px_rgba(15,30,26,.26)] animate-[fade_.16s_ease-out]',
          CENTERED_SIZES[size],
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-[18px] py-[15px]">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <CloseButton onClose={onClose} />
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-[18px] py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-[18px] py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
