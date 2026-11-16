import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { titleForPath } from './nav'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const title = titleForPath(location.pathname)

  // On the till the rail collapses to icons so the bill gets the full width.
  const collapsed = location.pathname === '/pos'

  return (
    <div className="min-h-full">
      <Sidebar
        open={sidebarOpen}
        collapsed={collapsed}
        onNavigate={() => setSidebarOpen(false)}
      />
      <div className={cn(collapsed ? 'lg:pl-[66px]' : 'lg:pl-56')}>
        <Header title={title} onMenuClick={() => setSidebarOpen((open) => !open)} />
        <main className={cn('px-4 py-5 sm:px-6 lg:px-8 lg:py-7', collapsed && 'lg:px-4 lg:py-4')}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
