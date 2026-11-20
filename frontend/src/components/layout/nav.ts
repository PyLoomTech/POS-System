import {
  BarChart3,
  Boxes,
  Calculator,
  Clock3,
  FolderTree,
  LayoutDashboard,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  UserCog,
  Users,
  UsersRound,
  Upload,
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

/** Home link rendered above the grouped navigation. */
export const HOME_ITEM: NavItem = {
  label: 'Dashboard',
  path: '/',
  icon: LayoutDashboard,
  permission: 'dashboard:view',
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Sell',
    items: [
      { label: 'Point of Sale', path: '/pos', icon: ShoppingCart, permission: 'sales:create' },
      { label: 'Invoices', path: '/sales', icon: Receipt, permission: 'sales:view' },
      { label: 'Returns', path: '/returns', icon: RotateCcw, permission: 'returns:view' },
      { label: 'Customers', path: '/customers', icon: Users, permission: 'customers:view' },
    ],
  },
  {
    label: 'Buy',
    items: [
      { label: 'Purchases', path: '/purchases', icon: Truck, permission: 'purchases:view' },
      { label: 'Suppliers', path: '/suppliers', icon: UsersRound, permission: 'suppliers:view' },
    ],
  },
  {
    label: 'Stock',
    items: [
      { label: 'Items', path: '/items', icon: Package, permission: 'items:view' },
      { label: 'Categories', path: '/categories', icon: FolderTree, permission: 'items:view' },
      { label: 'Inventory', path: '/inventory', icon: Boxes, permission: 'inventory:view' },
      { label: 'Price Lists & UOM', path: '/price-lists-uom', icon: Tags, permission: 'items:create' },
      { label: 'Bulk Item Import', path: '/item-import', icon: Upload, permission: 'items:create' },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Payments', path: '/payments', icon: Wallet, permission: 'payments:view' },
      { label: 'Cashier Shifts', path: '/shifts', icon: Clock3, permission: 'shifts:view' },
      { label: 'Accounting', path: '/accounting', icon: Calculator, permission: 'accounting:view' },
      { label: 'Reports', path: '/reports', icon: BarChart3, permission: 'reports:view' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Users', path: '/users', icon: UserCog, permission: 'users:view' },
      { label: 'Settings', path: '/settings', icon: Settings, permission: 'settings:view' },
    ],
  },
]

const TITLES: Array<{ path: string; title: string }> = [
  { path: HOME_ITEM.path, title: HOME_ITEM.label },
  ...NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({ path: item.path, title: item.label })),
  ),
]

export function titleForPath(pathname: string): string {
  if (pathname === '/') return 'Dashboard'
  const match = TITLES.filter((entry) => entry.path !== '/' && pathname.startsWith(entry.path))
  return match[0]?.title ?? 'Pyloom POS'
}
