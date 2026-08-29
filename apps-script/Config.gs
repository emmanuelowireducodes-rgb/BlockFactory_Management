var APP_CONFIG = {
  spreadsheetIdProperty: 'MASTER_SPREADSHEET_ID',
  passwordPepperProperty: 'PASSWORD_PEPPER',
  sessionPrefix: 'SESSION:',
  idempotencyPrefix: 'CREATE_COMPANY:',
  sessionLifetimeSeconds: 60 * 60 * 12,
  passwordIterations: 120000,
  roles: {
    SUPER_ADMIN: 'SUPER_ADMIN',
    OWNER: 'OWNER',
    SECRETARY: 'SECRETARY'
  },
  permissions: ['VIEW_DASHBOARD', 'VIEW_PRODUCTS', 'MANAGE_PRODUCTS', 'VIEW_SALES', 'CREATE_SALE', 'VIEW_INVENTORY', 'MANAGE_INVENTORY', 'VIEW_PRODUCTION', 'CREATE_PRODUCTION', 'VIEW_EXPENSES', 'CREATE_EXPENSE', 'VIEW_CUSTOMER_PAYMENTS', 'CREATE_CUSTOMER_PAYMENT', 'VIEW_REPORTS', 'VIEW_CUSTOMERS', 'MANAGE_USERS', 'MANAGE_ROLES'],
  features: ['DASHBOARD', 'PRODUCTS', 'SALES', 'INVENTORY', 'PRODUCTION', 'EXPENSES', 'CUSTOMER_PAYMENTS', 'REPORTS', 'CUSTOMERS'],
  roleHeaders: ['Role ID', 'Company ID', 'Role Name', 'System Role', 'Active', 'Created At', 'Updated At', 'Created By'],
  rolePermissionHeaders: ['Role ID', 'Permission'],
  companyFeatureHeaders: ['Company ID', 'Feature Key', 'Enabled', 'Updated At', 'Updated By'],
  companyHeaders: ['Company ID', 'Company Name', 'Owner Name', 'Phone', 'Location', 'Status', 'Created At', 'Created By'],
  userHeaders: ['User ID', 'Company ID', 'Name', 'Username', 'Password Hash', 'Role', 'Active', 'Created At', 'Updated At', 'Role ID'],
  operationalSheetHeaders: {
    PRODUCTS: ['Product ID', 'Company ID', 'Product Name', 'Category', 'Unit', 'Selling Price', 'Cost Price', 'Active', 'Created At', 'Updated At', 'Created By', 'Minimum Stock Level'],
    PRODUCTION: ['Production ID', 'Company ID', 'Product ID', 'Date', 'Quantity', 'Unit', 'Produced By', 'Status', 'Notes', 'Created At', 'Created By'],
    INVENTORY: ['Inventory ID', 'Company ID', 'Product ID', 'Quantity', 'Updated At'],
    INVENTORY_TRANSACTIONS: ['Transaction ID', 'Company ID', 'Product ID', 'Transaction Type', 'Quantity Change', 'Date', 'Notes', 'Recorded By', 'Created At', 'Created By', 'Reference Type', 'Reference ID'],
    SALES: ['Sale ID', 'Company ID', 'Date', 'Customer Name', 'Customer Phone', 'Product ID', 'Quantity', 'Unit', 'Unit Price', 'Total Amount', 'Amount Paid', 'Balance Due', 'Payment Method', 'Status', 'Recorded By', 'Notes', 'Created At', 'Created By'],
    CUSTOMER_PAYMENTS: ['Payment ID', 'Company ID', 'Sale ID', 'Customer Name', 'Date', 'Amount', 'Payment Method', 'Recorded By', 'Notes', 'Created At', 'Created By'],
    EXPENSES: ['Expense ID', 'Company ID', 'Date', 'Category', 'Description', 'Amount', 'Payment Method', 'Recorded By', 'Notes', 'Created At', 'Created By']
  }
}
