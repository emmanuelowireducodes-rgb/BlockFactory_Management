import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import { ROLE } from '../config/roles'
import { useAuth } from '../features/auth/AuthContext'
import { authService } from '../features/auth/authService'
import { api } from '../services/api'
import { cacheScope, fetchCached, invalidateCached, readCached, subscribeToVisibility, writeCached } from '../services/dataCache'

function today() {
  return new Date().toLocaleDateString('en-CA')
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function ProductionForm({ products, inventoryByProductId, submitting, onCancel, onSubmit }) {
  const [values, setValues] = useState({ productId: '', date: today(), quantity: '' })
  const [validationError, setValidationError] = useState('')
  const selectedProduct = products.find((product) => product.productId === values.productId)

  function change(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setValidationError('')
  }

  function submit(event) {
    event.preventDefault()
    const quantity = Number(values.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setValidationError('Quantity must be greater than zero.')
      return
    }
    onSubmit({ productId: values.productId, date: values.date, quantity }, () => setValues({ productId: '', date: today(), quantity: '' }))
  }

  return (
    <form className="production-form" onSubmit={submit}>
      <label>Product<select name="productId" value={values.productId} onChange={change} required disabled={submitting || !products.length}><option value="">Select an active product</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.productName} ({product.unit})</option>)}</select></label>
      <label>Production date<input name="date" type="date" value={values.date} onChange={change} required disabled={submitting} /></label>
      <label>Quantity<input name="quantity" type="number" min="0" step="any" value={values.quantity} onChange={change} required disabled={submitting} /></label>
      {selectedProduct && <p className="inventory-hint">Current inventory: {Number(inventoryByProductId[selectedProduct.productId] ?? 0)} {selectedProduct.unit}</p>}
      {validationError && <p className="form-error" role="alert">{validationError}</p>}
      <div className="production-form-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={submitting}>Cancel</button><button className="primary-button" type="submit" disabled={submitting || !products.length}>{submitting ? 'Recording…' : 'Record production'}</button></div>
    </form>
  )
}

export default function ProductionPage() {
  const { user } = useAuth()
  const isSuperAdmin = user.role === ROLE.SUPER_ADMIN
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const dataScope = cacheScope(user, companyId)
  const [products, setProducts] = useState(() => readCached('products', dataScope) || [])
  const [records, setRecords] = useState(() => readCached('production', dataScope) || [])
  const [inventory, setInventory] = useState(() => readCached('inventory', dataScope) || [])
  const [historyProductId, setHistoryProductId] = useState('ALL')
  const [loading, setLoading] = useState(() => !readCached('products', dataScope) && !readCached('production', dataScope) && !readCached('inventory', dataScope))
  const [error, setError] = useState('')
  const [refreshWarning, setRefreshWarning] = useState('')
  const [notice, setNotice] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const loadRequestRef = useRef(0)

  const loadOperationalData = useCallback(async ({ selectedCompanyId = companyId, postMutation = false } = {}) => {
    const requestId = ++loadRequestRef.current
    if (isSuperAdmin && !selectedCompanyId) {
      setProducts([])
      setRecords([])
      setInventory([])
      setLoading(false)
      return true
    }
    const selectedScope = cacheScope(user, selectedCompanyId)
    const cachedProducts = readCached('products', selectedScope)
    const cachedRecords = readCached('production', selectedScope)
    const cachedInventory = readCached('inventory', selectedScope)
    if (cachedProducts) setProducts(cachedProducts)
    if (cachedRecords) setRecords(cachedRecords)
    if (cachedInventory) setInventory(cachedInventory)
    setLoading(!cachedProducts && !cachedRecords && !cachedInventory)
    setError('')
    setRefreshWarning('')
    const scope = isSuperAdmin ? { companyId: selectedCompanyId } : {}
    try {
      const [nextProducts, nextRecords, nextInventory] = await Promise.all([
        fetchCached('products', selectedScope, () => api.getProducts(authService.getToken(), scope)),
        fetchCached('production', selectedScope, () => api.getProduction(authService.getToken(), scope)),
        fetchCached('inventory', selectedScope, () => api.getInventory(authService.getToken(), scope))
      ])
      if (requestId === loadRequestRef.current) {
        setProducts(nextProducts)
        setRecords(nextRecords)
        setInventory(nextInventory)
      }
      return true
    } catch (requestError) {
      if (requestId === loadRequestRef.current) {
        const message = requestError.message || 'Unable to load production data.'
        if (postMutation) {
          setRefreshWarning(`Production was saved, but the latest records could not be loaded: ${message} Use Refresh to try again.`)
        } else {
          setError(message)
        }
      }
      return false
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false)
    }
  }, [companyId, isSuperAdmin, user])

  useEffect(() => {
    if (!isSuperAdmin) {
      loadOperationalData()
      return
    }
    api.getCompanies(authService.getToken())
      .then(setCompanies)
      .catch((requestError) => {
        setError(requestError.message || 'Unable to load companies.')
        setLoading(false)
      })
  }, [isSuperAdmin, loadOperationalData])
  useEffect(() => subscribeToVisibility(loadOperationalData), [loadOperationalData])

  const activeProducts = products.filter((product) => product.active)
  const productById = useMemo(() => Object.fromEntries(products.map((product) => [product.productId, product])), [products])
  const visibleRecords = useMemo(() => records.filter((record) => historyProductId === 'ALL' || record.productId === historyProductId), [historyProductId, records])
  const inventoryByProductId = useMemo(() => Object.fromEntries(inventory.map((item) => [item.productId, item.quantity])), [inventory])
  const selectedCompany = companies.find((company) => company.companyId === companyId)
  const pageTitle = isSuperAdmin ? 'Super Admin' : user.role === ROLE.SECRETARY ? 'Secretary' : 'Owner'
  const ready = !isSuperAdmin || Boolean(companyId)

  function selectCompany(event) {
    const nextCompanyId = event.target.value
    setCompanyId(nextCompanyId)
    setNotice('')
    setIsFormOpen(false)
    loadOperationalData({ selectedCompanyId: nextCompanyId })
  }

  async function recordProduction(production, clearForm) {
    if (submitting) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const createdProduction = await api.createProduction(isSuperAdmin ? { ...production, companyId } : production, authService.getToken())
      setRecords((current) => { const next = current.some((record) => record.productionId === createdProduction.productionId) ? current : [createdProduction, ...current]; writeCached('production', dataScope, next); return next })
      setInventory((current) => { const next = current.map((item) => item.productId === createdProduction.productId ? { ...item, quantity: Number(item.quantity) + Number(createdProduction.quantity) } : item); writeCached('inventory', dataScope, next); return next })
      invalidateCached('production', dataScope)
      invalidateCached('inventory', dataScope)
      clearForm()
      setIsFormOpen(false)
      setNotice('Production recorded and inventory updated successfully.')
      loadOperationalData({ postMutation: true })
    } catch (requestError) {
      setError(requestError.message || 'Unable to record production.')
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelProduction(record) {
    if (submitting || !window.confirm(`Cancel production ${record.productionId}? The backend will reverse its inventory increase.`)) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const cancelledProduction = await api.cancelProduction(record.productionId, authService.getToken())
      setRecords((current) => { const next = current.map((item) => item.productionId === cancelledProduction.productionId ? cancelledProduction : item); writeCached('production', dataScope, next); return next })
      setInventory((current) => { const next = current.map((item) => item.productId === cancelledProduction.productId ? { ...item, quantity: Number(item.quantity) - Number(cancelledProduction.quantity) } : item); writeCached('inventory', dataScope, next); return next })
      invalidateCached('production', dataScope)
      invalidateCached('inventory', dataScope)
      setNotice(`Production ${record.productionId} was cancelled and inventory was updated.`)
      loadOperationalData({ postMutation: true })
    } catch (requestError) {
      setError(requestError.message || 'Unable to cancel production.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title={pageTitle} context={isSuperAdmin ? (selectedCompany?.companyName || 'Select a company') : (user.companyId ? `Company ${user.companyId}` : 'Company context')}>
      <section className="production-page" aria-labelledby="production-title">
        <div className="production-heading"><div><p className="eyebrow">Production</p><h1 id="production-title">Production records</h1><p>Completed production and inventory updates are recorded together by the backend.</p></div>{ready && <button className="primary-button" type="button" onClick={() => { setIsFormOpen(true); setNotice('') }}>Record production</button>}</div>
        {isSuperAdmin && <label className="company-select">Company<select value={companyId} onChange={selectCompany} disabled={loading && !companies.length}><option value="">Select a company</option>{companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.companyName} ({company.companyId})</option>)}</select></label>}
        {notice && <p className="feedback feedback-success" role="status">{notice}</p>}
        {error && <p className="feedback feedback-error" role="alert">{error}</p>}
        {refreshWarning && <p className="feedback feedback-warning" role="alert">{refreshWarning}</p>}
        {ready && <>
          {isFormOpen && <section className="production-editor" aria-labelledby="record-production-title"><h2 id="record-production-title">Record production</h2><ProductionForm products={activeProducts} inventoryByProductId={inventoryByProductId} submitting={submitting} onSubmit={recordProduction} onCancel={() => setIsFormOpen(false)} /></section>}
          <div className="production-list-header"><h2>Production history</h2><label className="history-product-filter">Product<select value={historyProductId} onChange={({ target }) => setHistoryProductId(target.value)}><option value="ALL">All products</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.productName}</option>)}</select></label><button className="secondary-button" type="button" onClick={() => loadOperationalData()} disabled={loading || submitting}>Refresh</button></div>
          {loading ? <p className="dashboard-status" role="status">Loading production records…</p> : visibleRecords.length === 0 ? <p className="dashboard-status">No production records match this product filter.</p> : <div className="production-table-wrap"><table className="production-table"><thead><tr><th>Production ID</th><th>Product</th><th>Quantity</th><th>Date</th><th>Status</th><th>Recorded by</th><th>Created</th><th>Actions</th></tr></thead><tbody>{visibleRecords.map((record) => { const product = productById[record.productId]; return <tr key={record.productionId}><td data-label="Production ID">{record.productionId}</td><td data-label="Product">{product?.productName || record.productId}</td><td data-label="Quantity">{record.quantity} {record.unit}</td><td data-label="Date">{record.date}</td><td data-label="Status"><span className={record.status === 'COMPLETED' ? 'status-badge active' : 'status-badge inactive'}>{record.status}</span></td><td data-label="Recorded by">{record.producedBy || '—'}</td><td data-label="Created">{formatDateTime(record.createdAt)}</td><td data-label="Actions" className="product-actions">{record.status === 'COMPLETED' && <button className="text-button danger" type="button" onClick={() => cancelProduction(record)} disabled={submitting}>Cancel</button>}</td></tr> } )}</tbody></table></div>}
        </>}
        {isSuperAdmin && !companyId && !error && <p className="dashboard-status">Choose a company to view and manage its production.</p>}
      </section>
    </AppShell>
  )
}
