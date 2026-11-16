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
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line bg-[rgba(245,250,254,.72)] px-4 backdrop-blur-[18px] lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-2 text-ink-3 transition-colors hover:bg-line-2 lg:hidden"
          aria-label="Toggle navigation"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-base font-semibold text-ink">{title}</h1>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-line-2"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-soft text-accent-2">
            <UserCircle size={20} />
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium text-ink-2">
              {user?.fullName ?? 'User'}
            </span>
            <span className="block text-[11px] text-ink-3">{user?.role?.name}</span>
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
            <div className="surface absolute right-0 z-20 mt-2 w-56 rounded-md py-1">
              <div className="border-b border-line-2 px-4 py-2">
                <p className="text-sm font-medium text-ink">{user?.fullName}</p>
                <p className="text-xs text-ink-3">{user?.email ?? user?.username}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  void logout()
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink-2 hover:bg-line-2"
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
