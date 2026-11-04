import { useState } from 'react'
import { LogOut, Menu, UserCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

interface HeaderProps {
  title: string
  onMenuClick: () => void
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 lg:hidden"
          aria-label="Toggle navigation"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-base font-semibold text-slate-800">{title}</h1>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-slate-100"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <UserCircle size={20} />
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium text-slate-700">
              {user?.fullName ?? 'User'}
            </span>
            <span className="block text-[11px] text-slate-400">{user?.role?.name}</span>
          </span>
        </button>

        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white py-1 shadow-lg">
              <div className="border-b border-slate-100 px-4 py-2">
                <p className="text-sm font-medium text-slate-800">{user?.fullName}</p>
                <p className="text-xs text-slate-500">{user?.email ?? user?.username}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  void logout()
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
