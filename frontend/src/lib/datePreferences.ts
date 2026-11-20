import NepaliDate from 'nepali-date-converter'

export interface DatePreferences {
  calendarSystem: 'AD' | 'BS'
  dateFormat: string
  language: string
}

const DEFAULT_PREFERENCES: DatePreferences = {
  calendarSystem: 'AD',
  dateFormat: 'dd/MM/yyyy',
  language: 'en',
}

let preferences = DEFAULT_PREFERENCES
const listeners = new Set<() => void>()

export function getDatePreferences(): DatePreferences {
  return preferences
}

export function setDatePreferences(next: Partial<DatePreferences>): void {
  preferences = { ...preferences, ...next }
  for (const listener of listeners) listener()
}

export function subscribeDatePreferences(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), 12)
  if (
    date.getFullYear() !== Number(yearText) ||
    date.getMonth() !== Number(monthText) - 1 ||
    date.getDate() !== Number(dayText)
  ) return null
  return date
}

export function formatBsInput(value: string, language = 'en'): string {
  const date = parseIsoDate(value)
  return date
    ? new NepaliDate(date).format('YYYY-MM-DD', language.toLowerCase().startsWith('ne') ? 'np' : 'en')
    : ''
}

export function bsDateToIso(value: string): string | null {
  const normalized = value.replace(/[०-९]/g, (digit) => String('०१२३४५६७८९'.indexOf(digit)))
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(normalized.trim())
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (year < 1970 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 32) return null

  try {
    const ad = new NepaliDate(year, month - 1, day).getAD()
    const date = new Date(ad.year, ad.month, ad.date, 12)
    if (new NepaliDate(date).format('YYYY-MM-DD', 'en') !== `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`) {
      return null
    }
    return `${ad.year}-${String(ad.month + 1).padStart(2, '0')}-${String(ad.date).padStart(2, '0')}`
  } catch {
    return null
  }
}

export function formatBsDate(value: Date, language = 'en'): string {
  const calendar = new NepaliDate(value)
  return calendar.format('DD MMMM YYYY', language.toLowerCase().startsWith('ne') ? 'np' : 'en')
}

export function parseDateForDisplay(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const dateOnly = parseIsoDate(value)
  if (dateOnly) return dateOnly
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatConfiguredDate(value: Date): string {
  const { calendarSystem, dateFormat, language } = preferences
  if (calendarSystem === 'BS') return formatBsDate(value, language)

  const day = String(value.getDate()).padStart(2, '0')
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const year = String(value.getFullYear())
  return dateFormat
    .replace(/dd/g, day)
    .replace(/MM/g, month)
    .replace(/yyyy/g, year)
}
