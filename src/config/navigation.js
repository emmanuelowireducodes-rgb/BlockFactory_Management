import { ROLE } from './roles'

export const navigationByRole = Object.freeze({
  [ROLE.SUPER_ADMIN]: [
    { label: 'Dashboard', path: '/super-admin' },
    { label: 'Companies', path: '/companies' },
    { label: 'Expenses', path: '/expenses', feature: 'EXPENSES', permission: 'VIEW_EXPENSES' },
    { label: 'Reports', path: '/reports', feature: 'REPORTS', permission: 'VIEW_REPORTS' },
    { label: 'Users', path: '/users' }
  ],
  [ROLE.OWNER]: [
    { label: 'Dashboard', path: '/owner' },
    { label: 'Products', path: '/products', feature: 'PRODUCTS', permission: 'VIEW_PRODUCTS' },
    { label: 'Production', path: '/production', feature: 'PRODUCTION', permission: 'VIEW_PRODUCTION' },
    { label: 'Sales', path: '/sales', feature: 'SALES', permission: 'VIEW_SALES' },
    { label: 'Inventory', path: '/inventory', feature: 'INVENTORY', permission: 'VIEW_INVENTORY' },
    { label: 'Expenses', path: '/expenses', feature: 'EXPENSES', permission: 'VIEW_EXPENSES' },
    { label: 'Reports', path: '/reports', feature: 'REPORTS', permission: 'VIEW_REPORTS' },
    { label: 'Users', path: '/users', permission: 'MANAGE_USERS' }
  ],
  [ROLE.SECRETARY]: [
    { label: 'Dashboard', path: '/secretary' },
    { label: 'Products', path: '/products', feature: 'PRODUCTS', permission: 'VIEW_PRODUCTS' },
    { label: 'Production', path: '/production', feature: 'PRODUCTION', permission: 'VIEW_PRODUCTION' },
    { label: 'Sales', path: '/sales', feature: 'SALES', permission: 'VIEW_SALES' },
    { label: 'Inventory', path: '/inventory', feature: 'INVENTORY', permission: 'VIEW_INVENTORY' },
    { label: 'Expenses', path: '/expenses', feature: 'EXPENSES', permission: 'VIEW_EXPENSES' },
    { label: 'Reports', path: '/reports', feature: 'REPORTS', permission: 'VIEW_REPORTS' },
  ]
})
