import { Navigate, Route, Routes } from 'react-router-dom'
import { ROLE } from '../config/roles'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import CompaniesPage from '../pages/CompaniesPage'
import ExpensesPage from '../pages/ExpensesPage'
import InventoryPage from '../pages/InventoryPage'
import LoginPage from '../pages/LoginPage'
import OwnerDashboardPage from '../pages/OwnerDashboardPage'
import ProductsPage from '../pages/ProductsPage'
import ProductionPage from '../pages/ProductionPage'
import ReportsPage from '../pages/ReportsPage'
import SalesPage from '../pages/SalesPage'
import SecretaryDashboardPage from '../pages/SecretaryDashboardPage'
import SuperAdminDashboardPage from '../pages/SuperAdminDashboardPage'
import UsersPage from '../pages/UsersPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute allowedRoles={[ROLE.SUPER_ADMIN]} />}>
        <Route path="/super-admin" element={<SuperAdminDashboardPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={[ROLE.OWNER, ROLE.SECRETARY]} permission="VIEW_DASHBOARD" />}>
        <Route path="/owner" element={<OwnerDashboardPage />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={[ROLE.SUPER_ADMIN, ROLE.OWNER]} permission="MANAGE_USERS" />}>
        <Route path="/users" element={<UsersPage />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={[ROLE.SUPER_ADMIN, ROLE.OWNER, ROLE.SECRETARY]} />}>
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/production" element={<ProductionPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={[ROLE.SECRETARY]} />}>
        <Route path="/secretary" element={<SecretaryDashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
