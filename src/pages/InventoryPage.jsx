import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import { ROLE } from '../config/roles'
import { useAuth } from '../features/auth/AuthContext'
import { authService } from '../features/auth/authService'
import { api } from '../services/api'
import { cacheScope, fetchCached, invalidateCached, readCached, subscribeToVisibility, writeCached } from '../services/dataCache'
import { inventoryStatus, inventoryStatusClass, inventoryStatusLabel } from '../utils/inventoryStatus'

const today = () => new Date().toLocaleDateString('en-CA')
function date(value, time = false) {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GH', time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(parsed)
}

function OpeningStockForm({ product, submitting, onCancel, onSubmit }) {
  const [values, setValues] = useState({ quantity: '', date: today(), notes: '' })
  const [validationError, setValidationError] = useState('')
  useEffect(() => { setValues({ quantity: '', date: today(), notes: '' }); setValidationError('') }, [product.productId])
  const change = ({ target: { name, value } }) => { setValues((current) => ({ ...current, [name]: value })); setValidationError('') }
  function submit(event) {
    event.preventDefault()
    const quantity = Number(values.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) return setValidationError('Quantity must be greater than zero.')
    if (!values.notes.trim()) return setValidationError('Notes are required for opening stock.')
    onSubmit({ productId: product.productId, quantity, date: values.date, notes: values.notes.trim() }, () => setValues({ quantity: '', date: today(), notes: '' }))
  }
  return <form className="opening-stock-form" onSubmit={submit}>
    <label>Quantity ({product.unit || 'unit'})<input name="quantity" type="number" min="0" step="any" value={values.quantity} onChange={change} required disabled={submitting} /></label>
    <label>Date<input name="date" type="date" value={values.date} onChange={change} required disabled={submitting} /></label>
    <label className="opening-stock-notes">Notes<input name="notes" value={values.notes} onChange={change} required disabled={submitting} /></label>
    {validationError && <p className="form-error" role="alert">{validationError}</p>}
    <div className="opening-stock-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={submitting}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Add opening stock'}</button></div>
  </form>
}

function InventoryStatusModal({ status, products, onClose }) {
  const isRunningLow = status === 'RUNNING_LOW'
  const title = isRunningLow ? 'Running Low' : 'Out of Stock'
  const description = isRunningLow
    ? 'These products are below their minimum stock level and may need to be restocked soon.'
    : 'These products currently have no stock available.'

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div className={`inventory-status-backdrop ${isRunningLow ? 'running-low' : 'out-of-stock'}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="inventory-status-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-status-title">
      <div className="inventory-status-modal-header"><div><p className="eyebrow">Inventory alert</p><h2 id="inventory-status-title">{title}</h2></div><button className="modal-close-button" type="button" onClick={onClose} aria-label="Close">×</button></div>
      <p className="inventory-status-description">{description}</p>
      <div className="inventory-status-list">
        {products.map((product) => <div className="inventory-status-row" key={product.productId}><div><strong>{product.productName || product.productId}</strong>{isRunningLow ? <span>{product.quantity} remaining · Minimum: {product.minimumStockLevel}</span> : <span className="out-of-stock-label">OUT OF STOCK</span>}</div></div>)}
      </div>
      <p className="inventory-status-total">{products.length} product{products.length === 1 ? '' : 's'} {isRunningLow ? 'running low' : 'out of stock'}</p>
    </section>
  </div>
}

export default function InventoryPage() {
  const { user } = useAuth()
  const isSuperAdmin = user.role === ROLE.SUPER_ADMIN
  const canCreateOpeningStock = isSuperAdmin || user.role === ROLE.OWNER
  const [companies, setCompanies] = useState([]), [companyId, setCompanyId] = useState('')
  const dataScope = cacheScope(user, companyId)
  const [products, setProducts] = useState(() => readCached('products', dataScope) || [])
  const [inventory, setInventory] = useState(() => readCached('inventory', dataScope) || [])
  const [transactions, setTransactions] = useState(() => readCached('inventory-transactions', dataScope) || [])
  const [selectedProductId, setSelectedProductId] = useState(''), [historyProductId, setHistoryProductId] = useState('ALL'), [loading, setLoading] = useState(() => !readCached('products', dataScope) && !readCached('inventory', dataScope) && !readCached('inventory-transactions', dataScope)), [error, setError] = useState(''), [refreshWarning, setRefreshWarning] = useState(''), [notice, setNotice] = useState(''), [isFormOpen, setIsFormOpen] = useState(false), [submitting, setSubmitting] = useState(false)
  const loadRequestRef = useRef(0)
  const loadInventoryData = useCallback(async ({ selectedCompanyId = companyId, postMutation = false } = {}) => {
    const requestId = ++loadRequestRef.current
    if (isSuperAdmin && !selectedCompanyId) { setProducts([]); setInventory([]); setTransactions([]); setSelectedProductId(''); setLoading(false); return true }
    const selectedScope = cacheScope(user, selectedCompanyId)
    const cachedProducts = readCached('products', selectedScope), cachedInventory = readCached('inventory', selectedScope), cachedTransactions = readCached('inventory-transactions', selectedScope)
    if (cachedProducts) setProducts(cachedProducts)
    if (cachedInventory) setInventory(cachedInventory)
    if (cachedTransactions) setTransactions(cachedTransactions)
    setLoading(!cachedProducts && !cachedInventory && !cachedTransactions); setError(''); setRefreshWarning('')
    try {
      const scope = isSuperAdmin ? { companyId: selectedCompanyId } : {}
      const [nextProducts, nextInventory, nextTransactions] = await Promise.all([fetchCached('products', selectedScope, () => api.getProducts(authService.getToken(), scope)), fetchCached('inventory', selectedScope, () => api.getInventory(authService.getToken(), scope)), fetchCached('inventory-transactions', selectedScope, () => api.getInventoryTransactions(authService.getToken(), scope))])
      if (requestId === loadRequestRef.current) { setProducts(nextProducts); setInventory(nextInventory); setTransactions(nextTransactions); setSelectedProductId((current) => nextProducts.some((item) => item.productId === current) || nextInventory.some((item) => item.productId === current) ? current : (nextInventory[0]?.productId || nextProducts[0]?.productId || '')) }
      return true
    } catch (requestError) {
      if (requestId === loadRequestRef.current) { const message = requestError.message || 'Unable to load inventory data.'; postMutation ? setRefreshWarning(`Opening stock was saved, but the latest inventory data could not be loaded: ${message} Use Refresh to try again.`) : setError(message) }
      return false
    } finally { if (requestId === loadRequestRef.current) setLoading(false) }
  }, [companyId, isSuperAdmin, user])
  useEffect(() => {
    if (!isSuperAdmin) { loadInventoryData(); return }
    api.getCompanies(authService.getToken()).then(setCompanies).catch((requestError) => { setError(requestError.message || 'Unable to load companies.'); setLoading(false) })
  }, [isSuperAdmin, loadInventoryData])
  useEffect(() => subscribeToVisibility(loadInventoryData), [loadInventoryData])
  const productById = useMemo(() => Object.fromEntries(products.map((product) => [product.productId, product])), [products])
  const openingProductIds = useMemo(() => new Set(transactions.filter((item) => item.transactionType === 'OPENING_STOCK').map((item) => item.productId)), [transactions])
  const inventoryByProductId = useMemo(() => Object.fromEntries(inventory.map((item) => [item.productId, item])), [inventory])
  const productCards = useMemo(() => [...products, ...inventory.filter((item) => !productById[item.productId]).map((item) => ({ productId: item.productId, unit: '' }))], [inventory, productById, products])
  const runningLowProducts = useMemo(() => productCards.filter((product) => {
    const item = inventoryByProductId[product.productId]
    const quantity = Number(item?.quantity)
    const minimumStockLevel = Number(product.minimumStockLevel)
    return item && quantity > 0 && Number.isFinite(minimumStockLevel) && quantity <= minimumStockLevel
  }).map((product) => ({ ...product, quantity: Number(inventoryByProductId[product.productId].quantity) })), [inventoryByProductId, productCards])
  const zeroStockProducts = useMemo(() => productCards.filter((product) => {
    const item = inventoryByProductId[product.productId]
    return item && Number(item.quantity) === 0
  }), [inventoryByProductId, productCards])
  const runningLowCount = runningLowProducts.length
  const [statusModal, setStatusModal] = useState(null)
  const selectedInventory = inventoryByProductId[selectedProductId], selectedProduct = productById[selectedProductId] || productCards.find((item) => item.productId === selectedProductId), selectedTransactions = transactions.filter((item) => historyProductId === 'ALL' || item.productId === historyProductId)
  const selectedCompany = companies.find((company) => company.companyId === companyId), ready = !isSuperAdmin || Boolean(companyId), openingStockRecorded = openingProductIds.has(selectedProductId)
  const selectCompany = ({ target }) => { setCompanyId(target.value); setNotice(''); setIsFormOpen(false); setSelectedProductId(''); loadInventoryData({ selectedCompanyId: target.value }) }
  async function addOpeningStock(openingStock, clearForm) {
    if (submitting || openingProductIds.has(openingStock.productId)) return
    setSubmitting(true); setError(''); setNotice('')
    try { const created = await api.createOpeningStock(isSuperAdmin ? { ...openingStock, companyId } : openingStock, authService.getToken()); setTransactions((current) => { const next = current.some((item) => item.transactionId === created.transactionId) ? current : [created, ...current]; writeCached('inventory-transactions', dataScope, next); return next }); setInventory((current) => { const next = current.some((item) => item.productId === openingStock.productId) ? current.map((item) => item.productId === openingStock.productId ? { ...item, quantity: Number(item.quantity) + Number(openingStock.quantity) } : item) : [...current, { productId: openingStock.productId, quantity: Number(openingStock.quantity) }]; writeCached('inventory', dataScope, next); return next }); invalidateCached('inventory', dataScope); invalidateCached('inventory-transactions', dataScope); clearForm(); setIsFormOpen(false); setNotice('Opening stock was added successfully.'); loadInventoryData({ postMutation: true }) }
    catch (requestError) { setError(requestError.message || 'Unable to add opening stock.') } finally { setSubmitting(false) }
  }
  const pageTitle = isSuperAdmin ? 'Super Admin' : user.role === ROLE.SECRETARY ? 'Secretary' : 'Owner'
  return <AppShell title={pageTitle} context={isSuperAdmin ? (selectedCompany?.companyName || 'Select a company') : (user.companyId ? `Company ${user.companyId}` : 'Company context')}>
    <section className="inventory-page" aria-labelledby="inventory-title">
      <div className="inventory-heading"><div><p className="eyebrow">Inventory</p><h1 id="inventory-title">Current inventory</h1><p>Balances and transactions are maintained by the backend.</p></div></div>
      {isSuperAdmin && <label className="company-select">Company<select value={companyId} onChange={selectCompany} disabled={loading && !companies.length}><option value="">Select a company</option>{companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.companyName} ({company.companyId})</option>)}</select></label>}
      {notice && <p className="feedback feedback-success" role="status">{notice}</p>}{error && <p className="feedback feedback-error" role="alert">{error}</p>}{refreshWarning && <p className="feedback feedback-warning" role="alert">{refreshWarning}</p>}
      {ready && <><div className="inventory-section-heading"><h2>Inventory summary</h2><button className="secondary-button" type="button" onClick={() => loadInventoryData()} disabled={loading || submitting}>Refresh</button></div>
        {loading ? <p className="dashboard-status" role="status">Loading inventory...</p> : <div className="inventory-summary"><article><span>Products with records</span><strong>{inventory.length}</strong></article><button className="zero-stock-summary-card" type="button" onClick={() => setStatusModal('OUT_OF_STOCK')}><span>Products at zero stock</span><strong>{zeroStockProducts.length}</strong></button><button className="running-low-summary-card" type="button" onClick={() => setStatusModal('RUNNING_LOW')}><span>Running low</span><strong>{runningLowCount}</strong></button></div>}
        {!loading && productCards.length === 0 ? <p className="dashboard-status">No products or inventory balances are available yet.</p> : !loading && <section className="inventory-products"><div className="inventory-section-heading"><h2>Products</h2><p>Choose a product to view its balance and history.</p></div><div className="inventory-balance-grid">{productCards.map((product) => { const item = inventoryByProductId[product.productId], selected = product.productId === selectedProductId, outOfStock = item?.quantity != null && Number(item.quantity) === 0; return <button className={`inventory-balance-card${selected ? ' selected' : ''}${outOfStock ? ' out-of-stock' : ''}`} key={product.productId} type="button" onClick={() => { setSelectedProductId(product.productId); setIsFormOpen(false); setNotice('') }} aria-pressed={selected}><span className="inventory-card-name">{product.productName || product.productId}</span>{outOfStock && <span className="out-of-stock-label">OUT OF STOCK</span>}<strong>{item ? item.quantity : 'Not recorded'} <span>{product.unit || ''}</span></strong><span className="inventory-card-id">{product.productId}</span></button> })}</div></section>}
        {!loading && selectedProduct && <section className="inventory-detail"><div className="inventory-detail-heading"><div><p className="eyebrow">Selected product</p><h2>{selectedProduct.productName || selectedProductId}</h2><p>Product ID: {selectedProductId}</p><p>Minimum stock: {selectedProduct.minimumStockLevel === null || selectedProduct.minimumStockLevel === undefined || selectedProduct.minimumStockLevel === '' ? 'Minimum stock not set' : `${selectedProduct.minimumStockLevel} ${selectedProduct.unit || ''}`}</p></div><div className="inventory-current-balance"><span>Current inventory</span><strong>{selectedInventory ? selectedInventory.quantity : 'Not recorded'} <small>{selectedProduct.unit || ''}</small></strong>{selectedInventory && <span className={`status-badge ${inventoryStatusClass(inventoryStatus(Number(selectedInventory.quantity), selectedProduct.minimumStockLevel))}`}>{inventoryStatusLabel(inventoryStatus(Number(selectedInventory.quantity), selectedProduct.minimumStockLevel))}</span>}{selectedInventory?.updatedAt && <p>Updated {date(selectedInventory.updatedAt, true)}</p>}</div></div>
          {canCreateOpeningStock && !openingStockRecorded && <div className="inventory-detail-action"><div><h3>Add opening stock</h3><p>Opening stock can be recorded once for this product. The backend creates the balance and transaction.</p></div><button className="primary-button" type="button" onClick={() => { setIsFormOpen((current) => !current); setNotice('') }} disabled={submitting}>{isFormOpen ? 'Close form' : 'Add opening stock'}</button></div>}
          {canCreateOpeningStock && openingStockRecorded && <p className="inventory-opening-recorded">Opening stock has already been recorded for this product.</p>}
          {isFormOpen && canCreateOpeningStock && !openingStockRecorded && <section className="opening-stock-editor"><h3>Opening stock for {selectedProduct?.productName || selectedProductId}</h3><OpeningStockForm product={selectedProduct || { productId: selectedProductId, unit: '' }} submitting={submitting} onSubmit={addOpeningStock} onCancel={() => setIsFormOpen(false)} /></section>}
          <section className="inventory-history"><div className="inventory-section-heading"><h3>Transaction history</h3><label className="history-product-filter">Product<select value={historyProductId} onChange={({ target }) => setHistoryProductId(target.value)}><option value="ALL">All products</option>{productCards.map((product) => <option key={product.productId} value={product.productId}>{product.productName || product.productId}</option>)}</select></label></div>{selectedTransactions.length === 0 ? <p className="dashboard-status">No inventory transactions match this product filter.</p> : <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Product</th><th>Type</th><th>Quantity change</th><th>Date</th><th>Reference</th><th>Recorded by</th><th>Notes</th></tr></thead><tbody>{selectedTransactions.map((transaction) => { const increase = Number(transaction.quantityChange) >= 0, reference = transaction.referenceType && transaction.referenceId ? `${transaction.referenceType}: ${transaction.referenceId}` : transaction.referenceId || transaction.referenceType || 'Not available', transactionProduct = productById[transaction.productId]; return <tr key={transaction.transactionId}><td data-label="Product">{transactionProduct?.productName || transaction.productId}</td><td data-label="Type">{transaction.transactionType || 'Not available'}</td><td data-label="Quantity change"><span className={increase ? 'quantity-change increase' : 'quantity-change decrease'}>{increase ? '+' : ''}{transaction.quantityChange} {transactionProduct?.unit || ''}</span></td><td data-label="Date">{date(transaction.date)}</td><td data-label="Reference">{reference}</td><td data-label="Recorded by">{transaction.recordedBy || 'Not available'}</td><td data-label="Notes">{transaction.notes || 'Not available'}</td></tr> })}</tbody></table></div>}</section>
        </section>}</>}
      {isSuperAdmin && !companyId && !error && <p className="dashboard-status">Choose a company to view its inventory.</p>}
      {statusModal && <InventoryStatusModal status={statusModal} products={statusModal === 'RUNNING_LOW' ? runningLowProducts : zeroStockProducts} onClose={() => setStatusModal(null)} />}
    </section>
  </AppShell>
}
