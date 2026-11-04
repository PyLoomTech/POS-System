import {
  BarChart3,
  Boxes,
  Calculator,
  FolderTree,
  LayoutDashboard,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /** Permission required to see this module. Hiding is purely cosmetic — the API is the real gate. */
  permission: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '/', icon: LayoutDashboard, permission: 'dashboard:view' }],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Point of Sale', path: '/pos', icon: ShoppingCart, permission: 'sales:create' },
      { label: 'Invoices', path: '/sales', icon: Receipt, permission: 'sales:view' },
      { label: 'Customers', path: '/customers', icon: Users, permission: 'customers:view' },
      { label: 'Returns', path: '/returns', icon: RotateCcw, permission: 'returns:view' },
      { label: 'Payments', path: '/payments', icon: Wallet, permission: 'payments:view' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Items', path: '/items', icon: Package, permission: 'items:view' },
      { label: 'Categories', path: '/categories', icon: FolderTree, permission: 'items:view' },
      { label: 'Inventory', path: '/inventory', icon: Boxes, permission: 'inventory:view' },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { label: 'Purchases', path: '/purchases', icon: Truck, permission: 'purchases:view' },
      { label: 'Suppliers', path: '/suppliers', icon: UsersRound, permission: 'suppliers:view' },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { label: 'Accounting', path: '/accounting', icon: Calculator, permission: 'accounting:view' },
      { label: 'Reports', path: '/reports', icon: BarChart3, permission: 'reports:view' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users', path: '/users', icon: UserCog, permission: 'users:view' },
      { label: 'Settings', path: '/settings', icon: Settings, permission: 'settings:view' },
    ],
  },
]

const TITLES: Array<{ path: string; title: string }> = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ path: item.path, title: item.label })),
)

export function titleForPath(pathname: string): string {
  if (pathname === '/') return 'Dashboard'
  const match = TITLES.filter((entry) => entry.path !== '/' && pathname.startsWith(entry.path))
  return match[0]?.title ?? 'Pyloom POS'
}
