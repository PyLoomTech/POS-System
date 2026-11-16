import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BarChart3, Boxes, Lock, Receipt, Store, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/api'

const HIGHLIGHTS = [
  { icon: Receipt, title: 'Fast billing till', text: 'Scan, bill and print receipts in seconds.' },
  { icon: Boxes, title: 'Live inventory', text: 'Stock levels update with every sale.' },
  { icon: BarChart3, title: 'Clear insights', text: 'Daily sales, VAT and outstanding at a glance.' },
]

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-accent via-accent-2 to-rail p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur">
            <Store size={20} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Pyloom POS</p>
            <p className="text-[11px] text-railtext">Powered by Pyloom Technologies</p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-semibold leading-snug text-white">
              Run your store,
              <br />
              not your paperwork.
            </h1>
            <p className="mt-3 max-w-sm text-sm text-railtext">
              A complete retail platform for billing, inventory and accounting — built for
              Nepali businesses.
            </p>
          </div>
          <ul className="space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
                  <item.icon size={17} />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{item.title}</span>
                  <span className="block text-xs text-railtext">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] text-railtext">NPR · VAT 13% · Asia/Kathmandu</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg">
              <Store size={24} />
            </div>
            <h1 className="mt-3 text-xl font-semibold text-ink">Pyloom POS</h1>
            <p className="text-xs text-ink-3">Retail · Inventory · Accounting</p>
          </div>

          <div className="surface rounded-2xl p-7">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-ink">Sign in</h2>
              <p className="mt-1 text-sm text-ink-3">Use your staff credentials to continue.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xl bg-[#f9e4e7] px-3 py-2.5 text-xs text-brand-crimson ring-1 ring-inset ring-brand-crimson/20">
                  {error}
                </div>
              )}

              <Field label="Username" required>
                <div className="relative">
                  <User
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                  />
                  <Input
                    className="pl-9"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                    required
                  />
                </div>
              </Field>

              <Field label="Password" required>
                <div className="relative">
                  <Lock
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                  />
                  <Input
                    className="pl-9"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </Field>

              <Button type="submit" size="lg" loading={submitting} className="w-full">
                Sign in
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-[11px] text-ink-3">
            Pyloom POS v1.0 — Powered by Pyloom Technologies
          </p>
        </div>
      </div>
    </div>
  )
}
