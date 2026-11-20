import { useEffect, useState } from 'react'
import type {
  ChangeEvent,
  ChangeEventHandler,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'
import { bsDateToIso, formatBsInput, getDatePreferences } from '@/lib/datePreferences'

const BASE =
  'w-full rounded-md border border-[rgba(30,80,130,.24)] bg-white/80 px-3 py-2 text-sm text-ink transition placeholder:text-slate-400 hover:border-[rgba(11,106,186,.45)] focus:border-accent focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-[rgba(20,70,120,.07)] disabled:text-ink-3'

export function Input({ className, type, value, onChange, onBlur, min, max, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  if (type === 'date' && getDatePreferences().calendarSystem === 'BS') {
    return (
      <BikramSambatInput
        {...props}
        className={className}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        min={min}
        max={max}
      />
    )
  }
  return <input className={cn(BASE, className)} type={type} value={value} onChange={onChange} onBlur={onBlur} min={min} max={max} {...props} />
}

function BikramSambatInput({
  className,
  value,
  onChange,
  onBlur,
  min,
  max,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  value?: string | number | readonly string[]
  onChange?: ChangeEventHandler<HTMLInputElement>
}) {
  const isoValue = typeof value === 'string' ? value : ''
  const { language } = getDatePreferences()
  const [text, setText] = useState(() => formatBsInput(isoValue, language))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setText(formatBsInput(isoValue, language))
  }, [isoValue, language])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const enteredValue = event.target.value
    setText(enteredValue)
    setInvalid(false)
    const isoDate = bsDateToIso(enteredValue)
    if (!isoDate || (min && isoDate < min) || (max && isoDate > max)) return

    const target = new Proxy(event.target, {
      get: (input, property) => property === 'value'
        ? isoDate
        : Reflect.get(input, property, input),
    })
    const adaptedEvent = new Proxy(event, {
      get: (changeEvent, property) => property === 'target' || property === 'currentTarget'
        ? target
        : Reflect.get(changeEvent, property, changeEvent),
    }) as ChangeEvent<HTMLInputElement>
    onChange?.(adaptedEvent)
  }

  return (
    <span className="block">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="YYYY-MM-DD (BS)"
        value={text}
        onChange={handleChange}
        onBlur={(event) => {
          const parsed = bsDateToIso(text)
          setInvalid(Boolean(text && (!parsed || (min && parsed < min) || (max && parsed > max))))
          setText(formatBsInput(isoValue, language))
          onBlur?.(event)
        }}
        aria-invalid={invalid || undefined}
        className={cn(BASE, className, invalid && 'border-brand-crimson')}
      />
      <span className={cn('mt-1 block text-[11px]', invalid ? 'text-brand-crimson' : 'text-ink-3')}>
        {invalid
          ? 'Enter a valid Bikram Sambat date in the allowed range.'
          : 'Enter a Bikram Sambat date. It is stored as its Gregorian equivalent.'}
      </span>
    </span>
  )
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
