import { environment } from '../config/environment'

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function request(action, { method = 'POST', data, token } = {}) {
  if (!environment.apiUrl) {
    throw new ApiError('API_NOT_CONFIGURED', 'Set VITE_API_URL to the Google Apps Script Web App URL before using the API.')
  }

  const url = new URL(environment.apiUrl)
  if (method === 'GET') {
    url.searchParams.set('action', action)
    if (token) url.searchParams.set('token', token)
  }

  const response = await fetch(url, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : undefined,
    body: method === 'POST' ? JSON.stringify({ action, token, ...data }) : undefined
  })

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new ApiError('INVALID_API_RESPONSE', 'The API returned an invalid JSON response.')
  }

  if (!response.ok || !payload?.success) {
    throw new ApiError(payload?.error?.code ?? 'API_REQUEST_FAILED', payload?.error?.message ?? 'The API request failed.')
  }

  return payload.data
}

export const api = Object.freeze({
  health: () => request('health', { method: 'GET' }),
  login: (username, password) => request('login', { data: { username, password } }),
  createCompany: (company, token, requestId = createRequestId()) => request('createCompany', {
    data: { company, requestId },
    token
  }),
  createUser: (user, token) => request('createUser', { data: { user }, token }),
  getUsers: (token, { companyId } = {}) => request('getUsers', { data: { companyId }, token }),
  resetPassword: (userId, newPassword, token, { companyId } = {}) => request('resetPassword', { data: { userId, newPassword, companyId }, token }),
  setUserActive: (userId, active, token, { companyId } = {}) => request('setUserActive', { data: { userId, active, companyId }, token }),
  updateUser: (user, token) => request('updateUser', { data: { user }, token }),
  getCompanies: (token) => request('getCompanies', { method: 'GET', token }),
  getAccess: (token) => request('getAccess', { data: {}, token }),
  getCompanyFeatures: (companyId, token) => request('getCompanyFeatures', { data: { companyId }, token }),
  setCompanyFeature: (companyId, feature, enabled, token) => request('setCompanyFeature', { data: { companyId, feature, enabled }, token }),
  getRoles: (token, { companyId } = {}) => request('getRoles', { data: { companyId }, token }),
  createRole: (role, token) => request('createRole', { data: { role }, token }),
  updateRole: (role, token) => request('updateRole', { data: { role }, token }),
  deleteRole: (roleId, token, { companyId } = {}) => request('deleteRole', { data: { roleId, companyId }, token }),
  getProducts: (token, { companyId, includeInactive = true } = {}) => request('getProducts', {
    data: { companyId, includeInactive },
    token
  }),
  createProduct: (product, token) => request('createProduct', { data: { product }, token }),
  updateProduct: (product, token) => request('updateProduct', { data: { product }, token }),
  deactivateProduct: (productId, token) => request('deactivateProduct', { data: { productId }, token }),
  getProduction: (token, { companyId } = {}) => request('getProduction', { data: { companyId }, token }),
  createProduction: (production, token) => request('createProduction', { data: { production }, token }),
  cancelProduction: (productionId, token) => request('cancelProduction', { data: { productionId }, token }),
  getInventory: (token, { companyId } = {}) => request('getInventory', { data: { companyId }, token }),
  getInventoryTransactions: (token, { companyId } = {}) => request('getInventoryTransactions', { data: { companyId }, token }),
  createOpeningStock: (openingStock, token) => request('createOpeningStock', { data: { openingStock }, token }),
  getSales: (token, { companyId } = {}) => request('getSales', { data: { companyId }, token }),
  getSale: (saleId, token) => request('getSale', { data: { saleId }, token }),
  getCustomerPayments: (token, { companyId } = {}) => request('getCustomerPayments', { data: { companyId }, token }),
  createCustomerPayment: (payment, token) => request('createCustomerPayment', { data: { payment }, token }),
  createSale: (sale, token) => request('createSale', { data: { sale }, token }),
  getExpenses: (token, { companyId } = {}) => request('getExpenses', { data: { companyId }, token }),
  createExpense: (expense, token) => request('createExpense', { data: { expense }, token }),
  getReportSummary: (token, period = 'TODAY', { companyId, startDate, endDate } = {}) => request('getReportSummary', { data: { period, companyId, startDate, endDate }, token })
})
