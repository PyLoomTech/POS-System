import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Store } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { HOME_ITEM, NAV_GROUPS } from './nav'

interface SidebarProps {
  open: boolean
  onNavigate: () => void
  onExpandedChange: (expanded: boolean) => void
}

export function Sidebar({ open, onNavigate, onExpandedChange }: SidebarProps) {
  const { hasPermission } = useAuth()
  const [pointerWithin, setPointerWithin] = useState(false)
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  const keyboardNavigation = useRef(false)
  const expanded = pointerWithin || keyboardFocus

  useEffect(() => {
    onExpandedChange(expanded)
  }, [expanded, onExpandedChange])

  // Only surface modules the signed-in role can actually use.
  const showHome = hasPermission(HOME_ITEM.permission)
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => hasPermission(item.permission)),
      })).filter((group) => group.items.length > 0),
    [hasPermission],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || event.key.startsWith('Arrow')) {
        keyboardNavigation.current = true
      }
    }
    const handlePointerDown = () => {
      keyboardNavigation.current = false
      setKeyboardFocus(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onNavigate}
          className="fixed inset-0 z-30 bg-rail/40 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-56 flex-col overflow-x-hidden bg-[linear-gradient(172deg,#114068,#0a2540)] text-railtext transition-[transform,width] duration-200 ease-out lg:translate-x-0',
          expanded ? 'lg:w-56' : 'lg:w-[66px]',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setPointerWithin(true)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setPointerWithin(false)
        }}
        onFocusCapture={() => {
          if (keyboardNavigation.current) setKeyboardFocus(true)
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setKeyboardFocus(false)
          }
        }}
      >
        <div className={cn(
          'flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5',
          !expanded && 'lg:justify-center lg:px-0',
        )}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/15 text-white">
            <Store size={18} />
          </div>
          <div className={cn('leading-tight', !expanded && 'lg:hidden')}>
            <p className="text-sm font-semibold text-white">Pyloom POS</p>
            <p className="text-[11px] text-railtext/80">Powered by Pyloom</p>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-3 py-4">
          {showHome && (
            <ul className="space-y-1">
              <li>
                <NavLink
                  to={HOME_ITEM.path}
                  end
                  onClick={onNavigate}
                  title={HOME_ITEM.label}
                  aria-label={HOME_ITEM.label}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                      !expanded && 'lg:justify-center lg:px-0',
                      isActive
                        ? 'bg-[rgba(140,205,255,.2)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)]'
                        : 'text-railtext hover:bg-[rgba(140,205,255,.12)] hover:text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-glow"
                          aria-hidden="true"
                        />
                      )}
                      <HOME_ITEM.icon size={17} />
                      <span className={cn(!expanded && 'lg:hidden')}>{HOME_ITEM.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            </ul>
          )}

          {groups.map((group) => (
            <div key={group.label}>
              <p
                className={cn(
                  'px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-railtext/70',
                  !expanded && 'lg:hidden',
                )}
              >
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onNavigate}
                      title={item.label}
                      aria-label={item.label}
                      className={({ isActive }) =>
                        cn(
                          'relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                          !expanded && 'lg:justify-center lg:px-0',
                          isActive
                            ? 'bg-[rgba(140,205,255,.2)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)]'
                            : 'text-railtext hover:bg-[rgba(140,205,255,.12)] hover:text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-glow"
                              aria-hidden="true"
                            />
                          )}
                          <item.icon size={17} />
                          <span className={cn(!expanded && 'lg:hidden')}>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn('border-t border-white/10 px-5 py-3', !expanded && 'lg:hidden')}>
          <p className="text-[11px] text-railtext/70">v1.0 · NPR · Asia/Kathmandu</p>
        </div>
      </aside>
    </>
  )
}
