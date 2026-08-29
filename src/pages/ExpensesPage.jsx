import { useCallback, useEffect, useRef, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import { ROLE } from '../config/roles'
import { useAuth } from '../features/auth/AuthContext'
import { authService } from '../features/auth/authService'
import { api } from '../services/api'
import { cacheScope, fetchCached, invalidateCached, readCached, subscribeToVisibility, writeCached } from '../services/dataCache'

const expenseCategories = ['RAW_MATERIALS', 'LABOUR', 'FUEL', 'ELECTRICITY', 'WATER', 'TRANSPORT', 'REPAIRS_MAINTENANCE', 'EQUIPMENT', 'RENT', 'SALARIES', 'OTHER']
const paymentMethods = ['CASH', 'MOBILE_MONEY', 'BANK']

function today() {
  return new Date().toLocaleDateString('en-CA')
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 }).format(Number(value ?? 0))
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(date)
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function ExpenseForm({ submitting, onCancel, onSubmit }) {
  const [values, setValues] = useState({ date: today(), category: '', description: '', amount: '', paymentMethod: 'CASH', notes: '' })
  const [validationError, setValidationError] = useState('')

  function change(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setValidationError('')
  }

  function submit(event) {
    event.preventDefault()
    const amount = Number(values.amount)
    if (!values.category) return setValidationError('Select an expense category.')
    if (!values.description.trim()) return setValidationError('Description is required.')
    if (!Number.isFinite(amount) || amount <= 0) return setValidationError('Amount must be greater than zero.')
    if (!values.paymentMethod) return setValidationError('Select a payment method.')
    onSubmit({ date: values.date, category: values.category, description: values.description.trim(), amount, paymentMethod: values.paymentMethod, notes: values.notes.trim() }, () => setValues({ date: today(), category: '', description: '', amount: '', paymentMethod: 'CASH', notes: '' }))
  }

  return <form className="expenses-form" onSubmit={submit}>
    <label>Expense date<input name="date" type="date" value={values.date} onChange={change} required disabled={submitting} /></label>
    <label>Category<select name="category" value={values.category} onChange={change} required disabled={submitting}><option value="">Select a category</option>{expenseCategories.map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}</select></label>
    <label>Amount<input name="amount" type="number" min="0" step="0.01" value={values.amount} onChange={change} required disabled={submitting} /></label>
    <label>Payment method<select name="paymentMethod" value={values.paymentMethod} onChange={change} required disabled={submitting}>{paymentMethods.map((method) => <option key={method} value={method}>{method.replaceAll('_', ' ')}</option>)}</select></label>
    <label className="expenses-description-field">Description<input name="description" value={values.description} onChange={change} required disabled={submitting} /></label>
    <label className="expenses-notes-field">Notes <em>(optional)</em><textarea name="notes" value={values.notes} onChange={change} disabled={submitting} rows="3" /></label>
    {validationError && <p className="form-error" role="alert">{validationError}</p>}
    <div className="expenses-form-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={submitting}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Recording…' : 'Record expense'}</button></div>
  </form>
}

export default function ExpensesPage() {
  const { user } = useAuth()
  const isSuperAdmin = user.role === ROLE.SUPER_ADMIN
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const dataScope = cacheScope(user, companyId)
  const [expenses, setExpenses] = useState(() => readCached('expenses', dataScope) || [])
  const [loading, setLoading] = useState(() => !readCached('expenses', dataScope))
  const [error, setError] = useState('')
  const [refreshWarning, setRefreshWarning] = useState('')
  const [notice, setNotice] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const loadRequestRef = useRef(0)

  const loadExpenses = useCallback(async ({ selectedCompanyId = companyId, postMutation = false } = {}) => {
    const requestId = ++loadRequestRef.current
    if (isSuperAdmin && !selectedCompanyId) {
      setExpenses([])
      setLoading(false)
      return true
    }
    const selectedScope = cacheScope(user, selectedCompanyId)
    const cachedExpenses = readCached('expenses', selectedScope)
    if (cachedExpenses) setExpenses(cachedExpenses)
    setLoading(!cachedExpenses)
    setError('')
    setRefreshWarning('')
    try {
      const records = await fetchCached('expenses', selectedScope, () => api.getExpenses(authService.getToken(), isSuperAdmin ? { companyId: selectedCompanyId } : {}))
      if (requestId === loadRequestRef.current) setExpenses(records)
      return true
    } catch (requestError) {
      if (requestId === loadRequestRef.current) {
        const message = requestError.message || 'Unable to load expense records.'
        if (postMutation) setRefreshWarning(`Expense was recorded, but the latest records could not be loaded: ${message} Use Refresh to try again.`)
        else setError(message)
      }
      return false
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false)
    }
  }, [companyId, isSuperAdmin, user])

  useEffect(() => {
    if (!isSuperAdmin) {
      loadExpenses()
      return
    }
    api.getCompanies(authService.getToken())
      .then(setCompanies)
      .catch((requestError) => {
        setError(requestError.message || 'Unable to load companies.')
        setLoading(false)
      })
  }, [isSuperAdmin, loadExpenses])
  useEffect(() => subscribeToVisibility(loadExpenses), [loadExpenses])

  const selectedCompany = companies.find((company) => company.companyId === companyId)
  const pageTitle = isSuperAdmin ? 'Super Admin' : user.role === ROLE.SECRETARY ? 'Secretary' : 'Owner'
  const ready = !isSuperAdmin || Boolean(companyId)

  function selectCompany(event) {
    const nextCompanyId = event.target.value
    setCompanyId(nextCompanyId)
    setNotice('')
    setIsFormOpen(false)
    loadExpenses({ selectedCompanyId: nextCompanyId })
  }

  async function recordExpense(expense, clearForm) {
    if (submitting) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const createdExpense = await api.createExpense(isSuperAdmin ? { ...expense, companyId } : expense, authService.getToken())
      setExpenses((current) => { const next = current.some((item) => item.expenseId === createdExpense.expenseId) ? current : [createdExpense, ...current]; writeCached('expenses', dataScope, next); return next })
      invalidateCached('expenses', dataScope)
      clearForm()
      setIsFormOpen(false)
      setNotice('Expense recorded successfully.')
      loadExpenses({ postMutation: true })
    } catch (requestError) {
      setError(requestError.message || 'Unable to record expense.')
    } finally {
      setSubmitting(false)
    }
  }

  return <AppShell title={pageTitle} context={isSuperAdmin ? (selectedCompany?.companyName || 'Select a company') : (user.companyId ? `Company ${user.companyId}` : 'Company context')}>
    <section className="expenses-page" aria-labelledby="expenses-title">
      <div className="expenses-heading"><div><p className="eyebrow">Expenses</p><h1 id="expenses-title">Expense records</h1><p>Expenses are recorded by the backend and feed the existing reports.</p></div>{ready && <button className="primary-button" type="button" onClick={() => { setIsFormOpen(true); setNotice('') }}>Record expense</button>}</div>
      {isSuperAdmin && <label className="company-select">Company<select value={companyId} onChange={selectCompany} disabled={loading && !companies.length}><option value="">Select a company</option>{companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.companyName} ({company.companyId})</option>)}</select></label>}
      {notice && <p className="feedback feedback-success" role="status">{notice}</p>}
      {error && <p className="feedback feedback-error" role="alert">{error}</p>}
      {refreshWarning && <p className="feedback feedback-warning" role="alert">{refreshWarning}</p>}
      {ready && <>
        {isFormOpen && <section className="expenses-editor" aria-labelledby="record-expense-title"><h2 id="record-expense-title">Record expense</h2><ExpenseForm submitting={submitting} onSubmit={recordExpense} onCancel={() => setIsFormOpen(false)} /></section>}
        <div className="expenses-list-header"><h2>Expense history</h2><button className="secondary-button" type="button" onClick={() => loadExpenses()} disabled={loading || submitting}>Refresh</button></div>
        {loading ? <p className="dashboard-status" role="status">Loading expense records…</p> : expenses.length === 0 ? <p className="dashboard-status">No expenses have been recorded yet.</p> : <div className="expenses-table-wrap"><table className="expenses-table"><thead><tr><th>Expense ID</th><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th><th>Notes</th><th>Recorded by</th><th>Created</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.expenseId}><td data-label="Expense ID">{expense.expenseId}</td><td data-label="Date">{formatDate(expense.date)}</td><td data-label="Category">{expense.category?.replaceAll('_', ' ') || '—'}</td><td data-label="Description">{expense.description || '—'}</td><td data-label="Amount">{formatMoney(expense.amount)}</td><td data-label="Payment">{expense.paymentMethod?.replaceAll('_', ' ') || '—'}</td><td data-label="Notes">{expense.notes || '—'}</td><td data-label="Recorded by">{expense.recordedBy || '—'}</td><td data-label="Created">{formatDateTime(expense.createdAt)}</td></tr>)}</tbody></table></div>}
      </>}
      {isSuperAdmin && !companyId && !error && <p className="dashboard-status">Choose a company to view and record its expenses.</p>}
    </section>
  </AppShell>
}
