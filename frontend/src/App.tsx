import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CustomersPage } from '@/pages/CustomersPage'
import { SuppliersPage } from '@/pages/SuppliersPage'
import { ItemsPage } from '@/pages/ItemsPage'
import { ItemImportPage } from '@/pages/ItemImportPage'
import { PriceListsUomPage } from '@/pages/PriceListsUomPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { UsersPage } from '@/pages/UsersPage'
import { PosPage } from '@/pages/PosPage'
import { SalesPage } from '@/pages/SalesPage'
import { ReturnsPage } from '@/pages/ReturnsPage'
import { PaymentsPage } from '@/pages/PaymentsPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { PurchasesPage } from '@/pages/PurchasesPage'
import { AccountingPage } from '@/pages/AccountingPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { CompanyManagementPage } from '@/pages/CompanyManagementPage'
import { ShiftsPage } from '@/pages/ShiftsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { setDatePreferences, subscribeDatePreferences } from '@/lib/datePreferences'
import type { CompanySettings } from '@/types'

function App() {
  const { user } = useAuth()
  const [, refreshDatePreferences] = useState(0)

  useEffect(() => subscribeDatePreferences(() => refreshDatePreferences((value) => value + 1)), [])

  useEffect(() => {
    if (!user) {
      setDatePreferences({ calendarSystem: 'AD', dateFormat: 'dd/MM/yyyy', language: 'en' })
      return
    }

    let active = true
    void api.get<Partial<CompanySettings>>('/settings/company')
      .then(({ data }) => {
        if (!active) return
        setDatePreferences({
          calendarSystem: data.calendarSystem === 'BS' ? 'BS' : 'AD',
          dateFormat: data.dateFormat || 'dd/MM/yyyy',
          language: data.language || 'en',
        })
      })
      .catch((error: unknown) => {
        if (active) console.error('Could not load company date preferences.', error)
      })

    return () => {
      active = false
    }
  }, [user])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="returns" element={<ReturnsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="shifts" element={<ShiftsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="item-import" element={<ItemImportPage />} />
          <Route path="price-lists-uom" element={<PriceListsUomPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="purchases" element={<PurchasesPage />} />
          <Route path="accounting" element={<AccountingPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="company" element={<CompanyManagementPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
