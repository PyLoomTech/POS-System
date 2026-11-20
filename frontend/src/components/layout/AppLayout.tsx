import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { titleForPath } from './nav'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const location = useLocation()
  const title = titleForPath(location.pathname)

  return (
    <div className="min-h-full">
      <Sidebar
        open={sidebarOpen}
        onNavigate={() => setSidebarOpen(false)}
        onExpandedChange={setSidebarExpanded}
      />
      <div className={cn(
        'transition-[padding] duration-200 ease-out',
        sidebarExpanded ? 'lg:pl-56' : 'lg:pl-[66px]',
      )}>
        <Header title={title} onMenuClick={() => setSidebarOpen((open) => !open)} />
        <main className={cn('px-4 py-5 sm:px-6 lg:px-8 lg:py-7', location.pathname === '/pos' && 'lg:px-4 lg:py-4')}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
