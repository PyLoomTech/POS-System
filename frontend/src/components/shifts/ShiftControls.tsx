import { useState } from 'react'
import { Banknote, Clock3, LockKeyhole, UnlockKeyhole } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/context/AuthContext'
import { api, getErrorMessage } from '@/lib/api'
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/utils'

export interface ShiftSummary {
  totalSales: number
  cashSales: number
  cardSales: number
  qrSales: number
  otherPaymentSales: number
  creditSales: number
  salesReturns: number
  cashRefunds: number
  cashCollections: number
  cashPaidOut: number
  totalTransactions: number
  cancelledTransactions: number
}

export interface CashierShift {
  id: string
  sessionNumber: string
  registerName: string
  openingCash: number | string
  openingTime: string
  openingNotes: string | null
  closingTime: string | null
  closingNotes: string | null
  actualClosing: number | string | null
  difference: number | string | null
  status: string
  cashier: { id: number; fullName: string }
  expectedCash: number
  summary: ShiftSummary
}

interface ShiftControlsProps {
  shift: CashierShift | null
  onShiftChange: (shift: CashierShift | null) => void
  onRefresh: () => void
  compact?: boolean
}

const EMPTY_SUMMARY: ShiftSummary = {
  totalSales: 0,
  cashSales: 0,
  cardSales: 0,
  qrSales: 0,
  otherPaymentSales: 0,
  creditSales: 0,
  salesReturns: 0,
  cashRefunds: 0,
  cashCollections: 0,
  cashPaidOut: 0,
  totalTransactions: 0,
  cancelledTransactions: 0,
}

function SummaryRows({ summary, expectedCash, openingCash }: {
  summary: ShiftSummary
  expectedCash: number
  openingCash: number
}) {
  const rows = [
    ['Opening cash', openingCash],
    ['Cash sales', summary.cashSales],
    ['Card sales', summary.cardSales],
    ['QR sales', summary.qrSales],
    ['Other payment sales', summary.otherPaymentSales],
    ['Credit sales', summary.creditSales],
    ['Sales returns', summary.salesReturns],
    ['Cash collections', summary.cashCollections],
    ['Cash refunds', -summary.cashRefunds],
    ['Cash paid out', -summary.cashPaidOut],
    ['Expected cash in drawer', expectedCash],
  ] as const

  return (
    <dl className="grid gap-x-6 sm:grid-cols-2">
      {rows.map(([label, amount]) => (
        <div key={label} className="flex justify-between gap-3 border-b border-line-2 py-2 text-sm">
          <dt className={label === 'Expected cash in drawer' ? 'font-semibold text-ink' : 'text-ink-2'}>{label}</dt>
          <dd className={label === 'Expected cash in drawer' ? 'font-semibold text-ink' : 'font-medium text-ink'}>
            {formatCurrency(amount)}
          </dd>
        </div>
      ))}
      <div className="flex justify-between gap-3 py-2 text-sm sm:col-span-2">
        <dt className="text-ink-2">Transactions · Cancelled</dt>
        <dd className="font-medium text-ink">
          {formatNumber(summary.totalTransactions)} · {formatNumber(summary.cancelledTransactions)}
        </dd>
      </div>
    </dl>
  )
}

export function ShiftControls({ shift, onShiftChange, onRefresh, compact = false }: ShiftControlsProps) {
  const { hasPermission } = useAuth()
  const canOpenShift = hasPermission('shifts:open')
  const canCloseShift = hasPermission('shifts:close')
  const [openDialog, setOpenDialog] = useState(false)
  const [closeDialog, setCloseDialog] = useState(false)
  const [registerName, setRegisterName] = useState('Main Register')
  const [openingCash, setOpeningCash] = useState('0')
  const [openingNotes, setOpeningNotes] = useState('')
  const [actualCash, setActualCash] = useState('')
  const [closingNotes, setClosingNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOpen() {
    if (!registerName.trim() || openingCash.trim() === '' || !Number.isFinite(Number(openingCash)) || Number(openingCash) < 0) {
      setError('Enter a register name and a valid non-negative opening cash amount.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { data } = await api.post<CashierShift>('/shifts', {
        registerName,
        openingCash: Number(openingCash),
        openingNotes: openingNotes.trim() || undefined,
      })
      onShiftChange(data)
      onRefresh()
      setOpenDialog(false)
      setOpeningNotes('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleClose() {
    if (!shift) return
    if (actualCash.trim() === '' || !Number.isFinite(Number(actualCash)) || Number(actualCash) < 0) {
      setError('Enter a valid non-negative counted cash amount.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post(`/shifts/${shift.id}/close`, {
        actualCash: Number(actualCash),
        closingNotes: closingNotes.trim() || undefined,
      })
      onShiftChange(null)
      onRefresh()
      setCloseDialog(false)
      setActualCash('')
      setClosingNotes('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const currentSummary = shift?.summary ?? EMPTY_SUMMARY

  return (
    <>
      <Card className={compact ? 'flex flex-wrap items-center justify-between gap-3 p-3' : 'p-4'}>
        {shift ? (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-soft text-accent-2">
                <Banknote size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">Shift open · {shift.registerName}</p>
                  <Badge tone="green">Open</Badge>
                </div>
                <p className="text-xs text-ink-3">
                  {shift.sessionNumber} · Started {formatDateTime(shift.openingTime)} · Opening cash {formatCurrency(shift.openingCash)}
                </p>
              </div>
            </div>
            {canCloseShift && (
              <Button
                variant="outline"
                size="sm"
                icon={<LockKeyhole size={15} />}
                onClick={() => {
                  setError(null)
                  setActualCash(String(shift.expectedCash.toFixed(2)))
                  setCloseDialog(true)
                }}
              >
                Close shift
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-soft text-accent-2">
                <Clock3 size={18} />
              </span>
              <div>
                <p className="font-semibold text-ink">No active cashier shift</p>
                <p className="text-xs text-ink-3">Open a shift before recording a POS sale.</p>
              </div>
            </div>
            {canOpenShift && (
              <Button
                size="sm"
                icon={<UnlockKeyhole size={15} />}
                onClick={() => {
                  setError(null)
                  setOpenDialog(true)
                }}
              >
                Open shift
              </Button>
            )}
          </>
        )}
      </Card>

      <Modal
        open={openDialog}
        title="Open Cashier Shift"
        size="sm"
        onClose={() => setOpenDialog(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button loading={saving} onClick={() => void handleOpen()}>Open shift</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Register / terminal" required>
            <Input value={registerName} onChange={(event) => setRegisterName(event.target.value)} maxLength={100} />
          </Field>
          <Field label="Opening cash" required>
            <Input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} />
          </Field>
          <Field label="Opening notes">
            <Textarea rows={2} value={openingNotes} onChange={(event) => setOpeningNotes(event.target.value)} maxLength={2000} />
          </Field>
          {error && <p role="alert" className="text-sm text-brand-crimson">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={closeDialog && shift !== null}
        title="Review and Close Shift"
        size="md"
        onClose={() => setCloseDialog(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Keep shift open</Button>
            <Button loading={saving} onClick={() => void handleClose()}>Submit shift closure</Button>
          </>
        }
      >
        {shift && (
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50/70 p-3 text-sm text-ink-2">
              {shift.sessionNumber} · {shift.registerName} · {shift.cashier.fullName}
            </div>
            <SummaryRows
              summary={currentSummary}
              expectedCash={shift.expectedCash}
              openingCash={Number(shift.openingCash)}
            />
            <Field label="Actual cash counted" required hint="Enter the physical cash count. The variance is calculated on close.">
              <Input type="number" min="0" step="0.01" value={actualCash} onChange={(event) => setActualCash(event.target.value)} />
            </Field>
            <Field label="Closing notes">
              <Textarea rows={2} value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} maxLength={2000} />
            </Field>
            {error && <p role="alert" className="text-sm text-brand-crimson">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  )
}
