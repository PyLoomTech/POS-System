export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

export function formatCurrency(value: unknown): string {
  const num = toNumber(value)
  return `Rs. ${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatNumber(value: unknown, digits = 0): string {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function getPriceListDisplayName(
  priceListName?: string | null,
  unitName?: string | null,
): string | null {
  const name = priceListName?.trim()
  if (!name || name.toLowerCase() === 'wholesale') return null
  if (
    name.toLowerCase() === 'default price list' &&
    !/(carton|box)/i.test(unitName ?? '')
  ) {
    return null
  }
  return name
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function imageSrc(value?: string | null): string {
  if (!value) return ''
  if (/^(https?:|data:|blob:|\/)/.test(value)) return value
  return `/${value}`
}

// Demo payee identifier. Swap this whole helper for a call to Fonepay's
// dynamic-QR API once real merchant credentials are available.
const DEMO_QR_PAYEE = 'PYLOOM-POS-DEMO'

export function buildPaymentQrPayload(options: {
  amount: number
  reference: string
  merchantName?: string | null
  currency?: string
}): string {
  const params = new URLSearchParams({
    pa: DEMO_QR_PAYEE,
    pn: options.merchantName || 'Pyloom POS',
    am: options.amount.toFixed(2),
    cu: options.currency || 'NPR',
    tn: options.reference,
  })
  return `fonepay://pay?${params.toString()}`
}

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .muted { color: #64748b; font-size: 12px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  td.num, th.num { text-align: right; }
  .brand { font-size: 11px; color: #64748b; margin-top: 20px; text-align: center; }
  @media print { body { margin: 8px; } }
`

export function openPrintWindow(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank', 'width=900,height=680')
  if (!win) return
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>` +
      `<style>${PRINT_STYLES}</style></head><body>${bodyHtml}` +
      `<p class="brand">Powered by Pyloom Technologies</p></body></html>`,
  )
  win.document.close()
  win.focus()
  window.setTimeout(() => win.print(), 300)
}
