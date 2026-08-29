import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ROLE } from '../../config/roles'
import { useAuth } from './AuthContext'

export function ProtectedRoute({ allowedRoles, feature, permission }) {
  const { user, isLoading, access, accessLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <main className="page-center">Loading...</main>
  if (!user) return <Navigate to="/login" replace />
  const companyUser = Boolean(user.companyId) && allowedRoles?.some((role) => role === ROLE.OWNER || role === ROLE.SECRETARY)
  if (allowedRoles && !allowedRoles.includes(user.role) && !companyUser) return <Navigate to="/login" replace />
  if (accessLoading) return <main className="page-center">Loading...</main>
  const routeAccess = { '/products': ['PRODUCTS', 'VIEW_PRODUCTS'], '/production': ['PRODUCTION', 'VIEW_PRODUCTION'], '/sales': ['SALES', 'VIEW_SALES'], '/inventory': ['INVENTORY', 'VIEW_INVENTORY'], '/expenses': ['EXPENSES', 'VIEW_EXPENSES'], '/reports': ['REPORTS', 'VIEW_REPORTS'] }[location.pathname]
  const requiredFeature = feature || routeAccess?.[0]
  const requiredPermission = permission || routeAccess?.[1]
  if (requiredFeature && access && !access.features?.some((item) => item.feature === requiredFeature && item.enabled)) return <main className="page-center"><p>Feature not available for this company.</p></main>
  if (requiredPermission && access && !access.permissions?.includes(requiredPermission)) return <main className="page-center"><p>Access denied.</p></main>
  return <Outlet />
}
