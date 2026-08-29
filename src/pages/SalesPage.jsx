import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import { ROLE } from '../config/roles'
import { useAuth } from '../features/auth/AuthContext'
import { authService } from '../features/auth/authService'
import { api } from '../services/api'
import { cacheScope, fetchCached, invalidateCached, readCached, subscribeToVisibility, writeCached } from '../services/dataCache'

const paymentMethods = ['CASH', 'MOBILE_MONEY', 'BANK', 'CREDIT']

function today() {
  return new Date().toLocaleDateString('en-CA')
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 }).format(Number(value ?? 0))
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function SalesForm({ products, inventoryByProductId, submitting, onCancel, onSubmit }) {
  const [values, setValues] = useState({ productId: '', date: today(), customerName: '', customerPhone: '', quantity: '', amountPaid: '0', paymentMethod: 'CASH', notes: '' })
  const [validationError, setValidationError] = useState('')
  const selectedProduct = products.find((product) => product.productId === values.productId)
  const quantity = Number(values.quantity)
  const price = Number(selectedProduct?.sellingPrice)
  const estimatedTotal = Number.isFinite(quantity) && quantity > 0 && Number.isFinite(price) && price >= 0 ? quantity * price : null

  function change(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setValidationError('')
  }

  function submit(event) {
    event.preventDefault()
    const amountPaid = Number(values.amountPaid)
    if (!values.productId) return setValidationError('Select an active product.')
    if (!Number.isFinite(quantity) || quantity <= 0) return setValidationError('Quantity must be greater than zero.')
    if (values.paymentMethod === 'CREDIT' && !values.customerPhone.trim()) return setValidationError('Customer phone is required for credit sales.')
    if (!Number.isFinite(price) || price < 0) return setValidationError('The selected product has an invalid selling price.')
    if (!Number.isFinite(amountPaid) || amountPaid < 0) return setValidationError('Amount paid cannot be negative.')
    if (estimatedTotal !== null && amountPaid > estimatedTotal) return setValidationError('Amount paid cannot exceed the estimated total.')
    onSubmit({
      productId: values.productId,
      date: values.date,
      customerName: values.customerName.trim(),
      customerPhone: values.customerPhone.trim(),
      quantity,
      amountPaid,
      paymentMethod: values.paymentMethod,
      notes: values.notes.trim()
    }, () => setValues({ productId: '', date: today(), customerName: '', customerPhone: '', quantity: '', amountPaid: '0', paymentMethod: 'CASH', notes: '' }))
  }

  return (
    <form className="sales-form" onSubmit={submit}>
      <label>Product<select name="productId" value={values.productId} onChange={change} required disabled={submitting || !products.length}><option value="">Select an active product</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.productName} ({product.unit})</option>)}</select></label>
      <label>Sale date<input name="date" type="date" value={values.date} onChange={change} required disabled={submitting} /></label>
      <label>Customer name<input name="customerName" value={values.customerName} onChange={change} required disabled={submitting} /></label>
      <label>Quantity<input name="quantity" type="number" min="0" step="any" value={values.quantity} onChange={change} required disabled={submitting} /></label>
      <label>Amount paid<input name="amountPaid" type="number" min="0" step="0.01" value={values.amountPaid} onChange={change} required disabled={submitting} /></label>
      <label>Payment method<select name="paymentMethod" value={values.paymentMethod} onChange={change} required disabled={submitting}>{paymentMethods.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}</select></label>
      <label className="sales-contact-field">Customer phone {values.paymentMethod === 'CREDIT' ? <strong>(required for credit sales)</strong> : <em>(optional)</em>}<input name="customerPhone" type="tel" value={values.customerPhone} onChange={change} disabled={submitting} aria-required={values.paymentMethod === 'CREDIT'} /></label>
      <label className="sales-notes-field">Notes <em>(optional)</em><textarea name="notes" value={values.notes} onChange={change} disabled={submitting} rows="3" /></label>
      {selectedProduct && <div className="sale-preview"><p>Available inventory: <strong>{Number(inventoryByProductId[selectedProduct.productId] ?? 0)} {selectedProduct.unit}</strong></p><p>Current selling price: <strong>{formatMoney(price)} / {selectedProduct.unit}</strong></p>{estimatedTotal !== null && <p>Estimated total: <strong>{formatMoney(estimatedTotal)}</strong></p>}</div>}
      {validationError && <p className="form-error" role="alert">{validationError}</p>}
      <div className="sales-form-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={submitting}>Cancel</button><button className="primary-button" type="submit" disabled={submitting || !products.length}>{submitting ? 'Recording…' : 'Record sale'}</button></div>
    </form>
  )
}

export default function SalesPage() {
  const { user } = useAuth()
  const isSuperAdmin = user.role === ROLE.SUPER_ADMIN
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const dataScope = cacheScope(user, companyId)
  const [products, setProducts] = useState(() => readCached('products', dataScope) || [])
  const [sales, setSales] = useState(() => readCached('sales', dataScope) || [])
  const [inventory, setInventory] = useState(() => readCached('inventory', dataScope) || [])
  const [historyProductId, setHistoryProductId] = useState('ALL')
  const [loading, setLoading] = useState(() => !readCached('products', dataScope) && !readCached('sales', dataScope) && !readCached('inventory', dataScope))
  const [error, setError] = useState('')
  const [refreshWarning, setRefreshWarning] = useState('')
  const [notice, setNotice] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const loadRequestRef = useRef(0)

  const loadSalesData = useCallback(async ({ selectedCompanyId = companyId, postMutation = false } = {}) => {
    const requestId = ++loadRequestRef.current
    if (isSuperAdmin && !selectedCompanyId) {
      setProducts([])
      setSales([])
      setInventory([])
      setLoading(false)
      return true
    }
    const selectedScope = cacheScope(user, selectedCompanyId)
    const cachedProducts = readCached('products', selectedScope)
    const cachedSales = readCached('sales', selectedScope)
    const cachedInventory = readCached('inventory', selectedScope)
    if (cachedProducts) setProducts(cachedProducts)
    if (cachedSales) setSales(cachedSales)
    if (cachedInventory) setInventory(cachedInventory)
    setLoading(!cachedProducts && !cachedSales && !cachedInventory)
    setError('')
    setRefreshWarning('')
    const scope = isSuperAdmin ? { companyId: selectedCompanyId } : {}
    try {
      const [nextProducts, nextSales, nextInventory] = await Promise.all([
        fetchCached('products', selectedScope, () => api.getProducts(authService.getToken(), scope)),
        fetchCached('sales', selectedScope, () => api.getSales(authService.getToken(), scope)),
        fetchCached('inventory', selectedScope, () => api.getInventory(authService.getToken(), scope))
      ])
      if (requestId === loadRequestRef.current) {
        setProducts(nextProducts)
        setSales(nextSales)
        setInventory(nextInventory)
      }
      return true
    } catch (requestError) {
      if (requestId === loadRequestRef.current) {
        const message = requestError.message || 'Unable to load sales data.'
        if (postMutation) setRefreshWarning(`Sale was saved, but the latest records could not be loaded: ${message} Use Refresh to try again.`)
        else setError(message)
      }
      return false
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false)
    }
  }, [companyId, isSuperAdmin, user])

  useEffect(() => {
    if (!isSuperAdmin) {
      loadSalesData()
      return
    }
    api.getCompanies(authService.getToken())
      .then(setCompanies)
      .catch((requestError) => {
        setError(requestError.message || 'Unable to load companies.')
        setLoading(false)
      })
  }, [isSuperAdmin, loadSalesData])
  useEffect(() => subscribeToVisibility(loadSalesData), [loadSalesData])

  const activeProducts = products.filter((product) => product.active)
  const productById = useMemo(() => Object.fromEntries(products.map((product) => [product.productId, product])), [products])
  const visibleSales = useMemo(() => sales.filter((sale) => historyProductId === 'ALL' || sale.productId === historyProductId), [historyProductId, sales])
  const inventoryByProductId = useMemo(() => Object.fromEntries(inventory.map((item) => [item.productId, item.quantity])), [inventory])
  const selectedCompany = companies.find((company) => company.companyId === companyId)
  const pageTitle = isSuperAdmin ? 'Super Admin' : user.role === ROLE.SECRETARY ? 'Secretary' : 'Owner'
  const ready = !isSuperAdmin || Boolean(companyId)

  function selectCompany(event) {
    const nextCompanyId = event.target.value
    setCompanyId(nextCompanyId)
    setNotice('')
    setIsFormOpen(false)
    loadSalesData({ selectedCompanyId: nextCompanyId })
  }

  async function recordSale(sale, clearForm) {
    if (submitting) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const createdSale = await api.createSale(isSuperAdmin ? { ...sale, companyId } : sale, authService.getToken())
      setSales((current) => { const next = current.some((item) => item.saleId === createdSale.saleId) ? current : [createdSale, ...current]; writeCached('sales', dataScope, next); return next })
      setInventory((current) => { const next = current.map((item) => item.productId === createdSale.productId ? { ...item, quantity: Number(item.quantity) - Number(createdSale.quantity) } : item); writeCached('inventory', dataScope, next); return next })
      invalidateCached('sales', dataScope)
      invalidateCached('inventory', dataScope)
      clearForm()
      setIsFormOpen(false)
      setNotice('Sale recorded and inventory updated successfully.')
      loadSalesData({ postMutation: true })
    } catch (requestError) {
      setError(requestError.message || 'Unable to record sale.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title={pageTitle} context={isSuperAdmin ? (selectedCompany?.companyName || 'Select a company') : (user.companyId ? `Company ${user.companyId}` : 'Company context')}>
      <section className="sales-page" aria-labelledby="sales-title">
        <div className="sales-heading"><div><p className="eyebrow">Sales</p><h1 id="sales-title">Sales records</h1><p>Sales, stock validation, and inventory deductions are handled by the backend.</p></div>{ready && <button className="primary-button" type="button" onClick={() => { setIsFormOpen(true); setNotice('') }}>Record sale</button>}</div>
        {isSuperAdmin && <label className="company-select">Company<select value={companyId} onChange={selectCompany} disabled={loading && !companies.length}><option value="">Select a company</option>{companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.companyName} ({company.companyId})</option>)}</select></label>}
        {notice && <p className="feedback feedback-success" role="status">{notice}</p>}
        {error && <p className="feedback feedback-error" role="alert">{error}</p>}
        {refreshWarning && <p className="feedback feedback-warning" role="alert">{refreshWarning}</p>}
        {ready && <>
          {isFormOpen && <section className="sales-editor" aria-labelledby="record-sale-title"><h2 id="record-sale-title">Record sale</h2><SalesForm products={activeProducts} inventoryByProductId={inventoryByProductId} submitting={submitting} onSubmit={recordSale} onCancel={() => setIsFormOpen(false)} /></section>}
          <div className="sales-list-header"><h2>Sales history</h2><label className="history-product-filter">Product<select value={historyProductId} onChange={({ target }) => setHistoryProductId(target.value)}><option value="ALL">All products</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.productName}</option>)}</select></label><button className="secondary-button" type="button" onClick={() => loadSalesData()} disabled={loading || submitting}>Refresh</button></div>
          {loading ? <p className="dashboard-status" role="status">Loading sales records…</p> : visibleSales.length === 0 ? <p className="dashboard-status">No sales match this product filter.</p> : <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Sale ID</th><th>Customer</th><th>Phone</th><th>Product</th><th>Quantity</th><th>Unit price</th><th>Total</th><th>Paid</th><th>Balance</th><th>Payment</th><th>Notes</th><th>Date</th><th>Status</th><th>Recorded by</th><th>Created</th></tr></thead><tbody>{visibleSales.map((sale) => <tr key={sale.saleId}><td data-label="Sale ID">{sale.saleId}</td><td data-label="Customer">{sale.customerName}</td><td data-label="Phone">{sale.customerPhone || '—'}</td><td data-label="Product">{productById[sale.productId]?.productName || sale.productId}</td><td data-label="Quantity">{sale.quantity} {sale.unit}</td><td data-label="Unit price">{formatMoney(sale.unitPrice)}</td><td data-label="Total">{formatMoney(sale.totalAmount)}</td><td data-label="Paid">{formatMoney(sale.amountPaid)}</td><td data-label="Balance">{formatMoney(sale.balanceDue)}</td><td data-label="Payment">{sale.paymentMethod?.replace('_', ' ')}</td><td data-label="Notes">{sale.notes || '—'}</td><td data-label="Date">{sale.date}</td><td data-label="Status"><span className={sale.status === 'PAID' ? 'status-badge active' : 'status-badge inactive'}>{sale.status}</span></td><td data-label="Recorded by">{sale.recordedBy || '—'}</td><td data-label="Created">{formatDateTime(sale.createdAt)}</td></tr>)}</tbody></table></div>}
        </>}
        {isSuperAdmin && !companyId && !error && <p className="dashboard-status">Choose a company to view and manage its sales.</p>}
      </section>
    </AppShell>
  )
}
