import { useCallback, useEffect, useRef, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import { ROLE } from '../config/roles'
import { useAuth } from '../features/auth/AuthContext'
import { authService } from '../features/auth/authService'
import { api } from '../services/api'
import { cacheScope, fetchCached, invalidateCached, readCached, subscribeToVisibility, writeCached } from '../services/dataCache'

const emptyProduct = { productName: '', category: '', unit: '', sellingPrice: '', costPrice: '', minimumStockLevel: '' }

function formatMoney(value) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 }).format(Number(value ?? 0))
}

function ProductForm({ product, onCancel, onSubmit, submitting }) {
  const [values, setValues] = useState(product ? { ...product, minimumStockLevel: product.minimumStockLevel ?? '' } : emptyProduct)

  useEffect(() => { setValues(product ? { ...product, minimumStockLevel: product.minimumStockLevel ?? '' } : emptyProduct) }, [product])

  function change(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({
      productName: values.productName.trim(),
      category: values.category.trim(),
      unit: values.unit.trim(),
      sellingPrice: Number(values.sellingPrice),
      costPrice: Number(values.costPrice),
      ...(values.minimumStockLevel === '' ? {} : { minimumStockLevel: Number(values.minimumStockLevel) })
    })
  }

  return (
    <form className="product-form" onSubmit={submit}>
      <label>Product name<input name="productName" value={values.productName} onChange={change} required disabled={submitting} /></label>
      <label>Category<input name="category" value={values.category} onChange={change} required disabled={submitting} /></label>
      <label>Unit<input name="unit" value={values.unit} onChange={change} required disabled={submitting} /></label>
      <label>Selling price<input name="sellingPrice" type="number" min="0" step="0.01" value={values.sellingPrice} onChange={change} required disabled={submitting} /></label>
      <label>Cost price<input name="costPrice" type="number" min="0" step="0.01" value={values.costPrice} onChange={change} required disabled={submitting} /></label>
      <label>Minimum stock level<input name="minimumStockLevel" type="number" min="0" step="any" value={values.minimumStockLevel} onChange={change} disabled={submitting} /><span>Optional. Alert me when stock reaches this level.</span></label>
      <div className="product-form-actions">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : product ? 'Save changes' : 'Add product'}</button>
      </div>
    </form>
  )
}

export default function ProductsPage() {
  const { user } = useAuth()
  const canManage = user.role === ROLE.SUPER_ADMIN || user.role === ROLE.OWNER
  const isSuperAdmin = user.role === ROLE.SUPER_ADMIN
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const dataScope = cacheScope(user, companyId)
  const [products, setProducts] = useState(() => readCached('products', dataScope) || [])
  const [filter, setFilter] = useState('ACTIVE')
  const [loading, setLoading] = useState(() => !readCached('products', dataScope))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formProduct, setFormProduct] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const loadRequestRef = useRef(0)

  const loadProducts = useCallback(async (selectedCompanyId = companyId) => {
    const requestId = ++loadRequestRef.current
    if (isSuperAdmin && !selectedCompanyId) {
      setProducts([])
      setLoading(false)
      return
    }
    const selectedScope = cacheScope(user, selectedCompanyId)
    const cachedProducts = readCached('products', selectedScope)
    if (cachedProducts) setProducts(cachedProducts)
    setLoading(!cachedProducts)
    setError('')
    try {
      const result = await fetchCached('products', selectedScope, () => api.getProducts(authService.getToken(), isSuperAdmin ? { companyId: selectedCompanyId } : {}))
      if (requestId === loadRequestRef.current) setProducts(result)
    } catch (requestError) {
      if (requestId === loadRequestRef.current) setError(requestError.message || 'Unable to load products.')
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false)
    }
  }, [companyId, isSuperAdmin, user])

  useEffect(() => {
    if (!isSuperAdmin) {
      loadProducts()
      return
    }
    api.getCompanies(authService.getToken())
      .then(setCompanies)
      .catch((requestError) => {
        setError(requestError.message || 'Unable to load companies.')
        setLoading(false)
      })
  }, [isSuperAdmin, loadProducts])
  useEffect(() => subscribeToVisibility(loadProducts), [loadProducts])

  const visibleProducts = products.filter((product) => filter === 'ALL' || (filter === 'ACTIVE' ? product.active : !product.active))

  function selectCompany(event) {
    const nextCompanyId = event.target.value
    setCompanyId(nextCompanyId)
    setNotice('')
    setIsFormOpen(false)
    loadProducts(nextCompanyId)
  }

  async function saveProduct(values) {
    if (submitting) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      let savedProduct
      if (formProduct) {
        savedProduct = await api.updateProduct({ productId: formProduct.productId, ...values }, authService.getToken())
        setNotice('Product updated successfully.')
      } else {
        const product = isSuperAdmin ? { ...values, companyId } : values
        savedProduct = await api.createProduct(product, authService.getToken())
        setNotice('Product added successfully.')
      }
      setProducts((current) => { const next = formProduct ? current.map((item) => item.productId === savedProduct.productId ? savedProduct : item) : [savedProduct, ...current]; writeCached('products', dataScope, next); return next })
      setIsFormOpen(false)
      setFormProduct(null)
      invalidateCached('products', dataScope)
      loadProducts()
    } catch (requestError) {
      setError(requestError.message || 'Unable to save the product.')
    } finally {
      setSubmitting(false)
    }
  }

  async function deactivateProduct(product) {
    if (submitting || !window.confirm(`Deactivate ${product.productName}? It will remain in historical records and cannot be used for new transactions.`)) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const updatedProduct = await api.deactivateProduct(product.productId, authService.getToken())
      setProducts((current) => { const next = current.map((item) => item.productId === updatedProduct.productId ? updatedProduct : item); writeCached('products', dataScope, next); return next })
      setNotice(`${product.productName} was deactivated.`)
      invalidateCached('products', dataScope)
      loadProducts()
    } catch (requestError) {
      setError(requestError.message || 'Unable to deactivate the product.')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCompany = companies.find((company) => company.companyId === companyId)
  const managementReady = !isSuperAdmin || Boolean(companyId)
  const pageTitle = user.role === ROLE.SECRETARY ? 'Secretary' : user.role === ROLE.SUPER_ADMIN ? 'Super Admin' : 'Owner'

  return (
    <AppShell title={pageTitle} context={isSuperAdmin ? (selectedCompany?.companyName || 'Select a company') : (user.companyId ? `Company ${user.companyId}` : 'Company context')}>
      <section className="products-page" aria-labelledby="products-title">
        <div className="products-heading">
          <div><p className="eyebrow">Products</p><h1 id="products-title">Product catalogue</h1><p>Prices here apply to future sales; recorded sales keep their original price.</p></div>
          {canManage && managementReady && <button className="primary-button" type="button" onClick={() => { setFormProduct(null); setIsFormOpen(true); setNotice('') }}>Add product</button>}
        </div>

        {isSuperAdmin && <label className="company-select">Company<select value={companyId} onChange={selectCompany} disabled={loading && !companies.length}><option value="">Select a company</option>{companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.companyName} ({company.companyId})</option>)}</select></label>}
        {notice && <p className="feedback feedback-success" role="status">{notice}</p>}
        {error && <p className="feedback feedback-error" role="alert">{error}</p>}

        {managementReady && <>
          <div className="product-toolbar"><div className="filter-group" aria-label="Product status filter">{[['ACTIVE', 'Active'], ['INACTIVE', 'Inactive'], ['ALL', 'All']].map(([value, label]) => <button key={value} className={filter === value ? 'filter-button active' : 'filter-button'} type="button" onClick={() => setFilter(value)}>{label}</button>)}</div><button className="secondary-button" type="button" onClick={() => loadProducts()} disabled={loading || submitting}>Refresh</button></div>
          {isFormOpen && <section className="product-editor" aria-label={formProduct ? 'Edit product' : 'Add product'}><h2>{formProduct ? 'Edit product' : 'Add product'}</h2><ProductForm product={formProduct} onSubmit={saveProduct} submitting={submitting} onCancel={() => { setIsFormOpen(false); setFormProduct(null) }} /></section>}
          {loading ? <p className="dashboard-status" role="status">Loading products…</p> : visibleProducts.length === 0 ? <p className="dashboard-status">No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}products found.</p> : <div className="products-table-wrap"><table className="products-table"><thead><tr><th>Product name</th><th>Category</th><th>Unit</th><th>Selling price</th><th>Cost price</th><th>Status</th>{canManage && <th>Actions</th>}</tr></thead><tbody>{visibleProducts.map((product) => <tr key={product.productId}><td data-label="Product name">{product.productName}</td><td data-label="Category">{product.category}</td><td data-label="Unit">{product.unit}</td><td data-label="Selling price">{formatMoney(product.sellingPrice)}</td><td data-label="Cost price">{formatMoney(product.costPrice)}</td><td data-label="Status"><span className={product.active ? 'status-badge active' : 'status-badge inactive'}>{product.active ? 'Active' : 'Inactive'}</span></td>{canManage && <td data-label="Actions" className="product-actions"><button className="text-button" type="button" onClick={() => { setFormProduct(product); setIsFormOpen(true); setNotice('') }} disabled={submitting}>Edit</button>{product.active && <button className="text-button danger" type="button" onClick={() => deactivateProduct(product)} disabled={submitting}>Deactivate</button>}</td>}</tr>)}</tbody></table></div>}
        </>}
        {isSuperAdmin && !companyId && !error && <p className="dashboard-status">Choose a company to view and manage its products.</p>}
      </section>
    </AppShell>
  )
}
