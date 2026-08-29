import { useCallback, useEffect, useRef, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import { useAuth } from '../features/auth/AuthContext'
import { authService } from '../features/auth/authService'
import { api } from '../services/api'
import { cacheScope, fetchCached, invalidateCached, readCached, subscribeToVisibility, writeCached } from '../services/dataCache'

const emptyCompany = {
  companyName: '', ownerName: '', ownerUsername: '', ownerPassword: '', phone: '', location: ''
}
const featureOptions = ['PRODUCTS', 'SALES', 'INVENTORY', 'PRODUCTION', 'EXPENSES', 'CUSTOMER_PAYMENTS', 'REPORTS', 'CUSTOMERS']

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(date)
}

function CreateCompanyForm({ onCancel, onSubmit, submitting }) {
  const [values, setValues] = useState(emptyCompany)

  function change(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({
      companyName: values.companyName.trim(),
      ownerName: values.ownerName.trim(),
      ownerUsername: values.ownerUsername.trim(),
      ownerPassword: values.ownerPassword,
      phone: values.phone.trim(),
      location: values.location.trim()
    }, () => setValues(emptyCompany))
  }

  return (
    <form className="company-form" onSubmit={submit}>
      <label>Company name<input name="companyName" value={values.companyName} onChange={change} required disabled={submitting} /></label>
      <label>Owner name<input name="ownerName" value={values.ownerName} onChange={change} required disabled={submitting} /></label>
      <label>Owner username<input name="ownerUsername" value={values.ownerUsername} onChange={change} required disabled={submitting} autoComplete="username" /></label>
      <label>Owner password<input name="ownerPassword" type="password" value={values.ownerPassword} onChange={change} required minLength="12" disabled={submitting} autoComplete="new-password" /><span>Password must contain at least 12 characters.</span></label>
      <label>Phone <em>(optional)</em><input name="phone" type="tel" value={values.phone} onChange={change} disabled={submitting} /></label>
      <label>Location <em>(optional)</em><input name="location" value={values.location} onChange={change} disabled={submitting} /></label>
      <div className="company-form-actions">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create company'}</button>
      </div>
    </form>
  )
}

export default function CompaniesPage() {
  const { user } = useAuth()
  const dataScope = cacheScope(user, 'admin')
  const [companies, setCompanies] = useState(() => readCached('companies', dataScope) || [])
  const [loading, setLoading] = useState(() => !readCached('companies', dataScope))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createdOwner, setCreatedOwner] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [featureCompany, setFeatureCompany] = useState(null)
  const [features, setFeatures] = useState([])
  const [featureError, setFeatureError] = useState('')
  const loadRequestRef = useRef(0)

  const loadCompanies = useCallback(async () => {
    const requestId = ++loadRequestRef.current
    const cachedCompanies = readCached('companies', dataScope)
    if (cachedCompanies) setCompanies(cachedCompanies)
    setLoading(!cachedCompanies)
    setError('')
    try {
      const result = await fetchCached('companies', dataScope, () => api.getCompanies(authService.getToken()))
      if (requestId === loadRequestRef.current) setCompanies(result)
    } catch (requestError) {
      if (requestId === loadRequestRef.current) setError(requestError.message || 'Unable to load companies.')
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false)
    }
  }, [dataScope])

  useEffect(() => { loadCompanies() }, [loadCompanies])
  useEffect(() => subscribeToVisibility(loadCompanies), [loadCompanies])

  async function createCompany(company, clearForm) {
    if (submitting) return
    setSubmitting(true)
    setError('')
    setNotice('')
    setCreatedOwner(null)
    try {
      const result = await api.createCompany(company, authService.getToken())
      clearForm()
      setIsFormOpen(false)
      setNotice(`${result.company.companyName} was created successfully.`)
      setCreatedOwner(result.owner ?? null)
      invalidateCached('companies', dataScope)
      setCompanies((current) => { const next = [...current, result.company]; writeCached('companies', dataScope, next); return next })
      loadCompanies()
    } catch (requestError) {
      setError(requestError.message || 'Unable to create the company.')
    } finally {
      setSubmitting(false)
    }
  }

  async function openFeatures(company) {
    setFeatureCompany(company)
    setFeatureError('')
    try { setFeatures(await api.getCompanyFeatures(company.companyId, authService.getToken())) } catch (requestError) { setFeatureError(requestError.message || 'Unable to load feature access.') }
  }

  async function toggleFeature(feature, enabled) {
    try {
      const updated = await api.setCompanyFeature(featureCompany.companyId, feature, enabled, authService.getToken())
      setFeatures((current) => current.map((item) => item.feature === updated.feature ? updated : item))
    } catch (requestError) { setFeatureError(requestError.message || 'Unable to update feature access.') }
  }

  return (
    <AppShell title="Super Admin" context="Companies">
      <section className="companies-page" aria-labelledby="companies-title">
        <div className="companies-heading">
          <div><p className="eyebrow">Companies</p><h1 id="companies-title">Company management</h1><p>Create and review the companies using BlockFactory.</p></div>
          <button className="primary-button" type="button" onClick={() => { setIsFormOpen(true); setNotice(''); setCreatedOwner(null) }}>Create company</button>
        </div>

        {notice && <p className="feedback feedback-success" role="status">{notice}</p>}
        {error && <p className="feedback feedback-error" role="alert">{error}</p>}
        {createdOwner && <section className="owner-account-result" aria-labelledby="owner-account-result-title"><h2 id="owner-account-result-title">Owner account created</h2><p><strong>{createdOwner.name}</strong> was created as an <strong>{createdOwner.role}</strong> for company {createdOwner.companyId}. Owner credentials are not returned by the API; provide the credentials entered during creation securely.</p></section>}

        {isFormOpen && <section className="company-editor" aria-labelledby="create-company-title"><h2 id="create-company-title">Create company</h2><p>Creating a company also creates its Owner account.</p><CreateCompanyForm submitting={submitting} onSubmit={createCompany} onCancel={() => setIsFormOpen(false)} /></section>}

        <div className="company-list-header"><h2>Existing companies</h2><button className="secondary-button" type="button" onClick={loadCompanies} disabled={loading || submitting}>Refresh</button></div>
        {loading ? <p className="dashboard-status" role="status">Loading companies…</p> : companies.length === 0 ? <p className="dashboard-status">No companies have been created yet.</p> : <div className="companies-table-wrap"><table className="companies-table"><thead><tr><th>Company ID</th><th>Company name</th><th>Owner</th><th>Created</th><th>Status</th><th>Access</th></tr></thead><tbody>{companies.map((company) => <tr key={company.companyId}><td data-label="Company ID">{company.companyId}</td><td data-label="Company name">{company.companyName}</td><td data-label="Owner">{company.ownerName || '—'}</td><td data-label="Created">{formatDate(company.createdAt)}</td><td data-label="Status"><span className={company.status === 'ACTIVE' ? 'status-badge active' : 'status-badge inactive'}>{company.status || '—'}</span></td><td data-label="Access"><button className="text-button" type="button" onClick={() => openFeatures(company)}>Feature Access</button></td></tr>)}</tbody></table></div>}
        {featureCompany && <section className="company-editor" aria-labelledby="feature-access-title"><div className="company-list-header"><h2 id="feature-access-title">Feature Access: {featureCompany.companyName}</h2><button className="secondary-button" type="button" onClick={() => setFeatureCompany(null)}>Close</button></div>{featureError && <p className="feedback feedback-error" role="alert">{featureError}</p>}<div className="feature-access-list"><p><strong>Dashboard</strong><span>Always enabled</span></p>{featureOptions.map((feature) => { const item = features.find((entry) => entry.feature === feature); return <label key={feature}><span>{feature.replaceAll('_', ' ')}</span><input type="checkbox" checked={item?.enabled ?? true} onChange={(event) => toggleFeature(feature, event.target.checked)} /></label> })}</div></section>}
      </section>
    </AppShell>
  )
}
