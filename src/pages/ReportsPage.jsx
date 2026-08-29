import { useCallback, useEffect, useRef, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import { ROLE } from '../config/roles'
import { useAuth } from '../features/auth/AuthContext'
import { authService } from '../features/auth/authService'
import { api } from '../services/api'
import { cacheScope, fetchCached, invalidateCached, readCached, subscribeToVisibility, writeCached } from '../services/dataCache'

const reportPeriods = [
  { value: 'TODAY', label: 'Today' },
  { value: 'YESTERDAY', label: 'Yesterday' },
  { value: 'THIS_WEEK', label: 'This Week' },
  { value: 'THIS_MONTH', label: 'This Month' },
  { value: 'ALL_TIME', label: 'All Time' },
  { value: 'CUSTOM', label: 'Custom Range' }
]

function formatMoney(value) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 }).format(Number(value ?? 0))
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-GH', { maximumFractionDigits: 2 }).format(Number(value ?? 0))
}

function isValidCustomDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function reportDateKey(value) {
  const match = String(value ?? '').match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : ''
}

function salesForPeriod(sales, selectedPeriod, startDate, endDate) {
  if (selectedPeriod === 'ALL_TIME') return sales
  const today = new Date().toLocaleDateString('en-CA')
  const date = new Date(`${today}T00:00:00`)
  const start = new Date(date)
  if (selectedPeriod === 'YESTERDAY') start.setDate(start.getDate() - 1)
  if (selectedPeriod === 'THIS_WEEK') start.setDate(start.getDate() - (start.getDay() || 7) + 1)
  if (selectedPeriod === 'THIS_MONTH') start.setDate(1)
  const startKey = selectedPeriod === 'CUSTOM' ? startDate : start.toLocaleDateString('en-CA')
  const endKey = selectedPeriod === 'CUSTOM' ? endDate : selectedPeriod === 'YESTERDAY' ? startKey : today
  return sales.filter((sale) => { const saleDate = reportDateKey(sale.date); return saleDate >= startKey && saleDate <= endKey })
}

function today() {
  return new Date().toLocaleDateString('en-CA')
}

function CustomerPaymentForm({ sale, submitting, onCancel, onSubmit }) {
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [notes, setNotes] = useState('')
  const [validationError, setValidationError] = useState('')
  function submit(event) {
    event.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) return setValidationError('Payment amount must be greater than zero.')
    if (value > Number(sale.balanceDue)) return setValidationError('Payment cannot exceed the outstanding balance.')
    onSubmit({ saleId: sale.saleId, date: today(), amount: value, paymentMethod, notes: notes.trim() })
  }
  return <form className="customer-payment-form" onSubmit={submit}><p className="customer-payment-customer"><strong>{sale.customerName}</strong><span>Sale #{sale.saleId} · Outstanding: {formatMoney(sale.balanceDue)}</span></p><label>Payment amount<input type="number" min="0.01" max={sale.balanceDue} step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setValidationError('') }} required disabled={submitting} /></label><label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={submitting}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile Money</option><option value="BANK">Bank</option><option value="CREDIT">Credit</option></select></label><label>Notes <span>(optional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="3" disabled={submitting} /></label>{validationError && <p className="form-error" role="alert">{validationError}</p>}<div className="customer-payment-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={submitting}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Recording...' : Number(amount) === Number(sale.balanceDue) ? 'Record full payment' : 'Record partial payment'}</button></div></form>
}

function CustomerPaymentModal({ sale, submitting, error, onCancel, onSubmit }) {
  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape' && !submitting) onCancel() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onCancel, submitting])
  return <div className="report-info-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onCancel() }}><section className="report-info-modal" role="dialog" aria-modal="true" aria-labelledby="customer-payment-title"><div className="report-info-header"><h2 id="customer-payment-title">Make Payment</h2><button className="modal-close-button" type="button" onClick={onCancel} disabled={submitting} aria-label="Close">×</button></div><p className="report-info-description">Record a partial or full payment for this sale.</p>{error && <p className="feedback feedback-error" role="alert">{error}</p>}<CustomerPaymentForm sale={sale} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit} /></section></div>
}

function ReportInfoModal({ card, sales, total, onClose, onMakePayment }) {
  const descriptions = {
    totalSales: 'Total Sales is the total value of all sales recorded for the selected report period.',
    totalExpenses: 'Total Expenses is the total amount recorded as business expenses for the selected report period.',
    estimatedOperatingProfit: 'Estimated Operating Profit is calculated as Total Sales minus Total Expenses.',
    totalAmountPaid: 'Amount Collected is the money that has actually been received from customers for the recorded sales.',
    outstandingCustomerBalance: 'These are the customers who still have money outstanding on their sales.'
  }
  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const isOutstanding = card === 'outstandingCustomerBalance'
  return <div className="report-info-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="report-info-modal" role="dialog" aria-modal="true" aria-labelledby="report-info-title"><div className="report-info-header"><h2 id="report-info-title">{isOutstanding ? 'Outstanding Customer Balance' : 'Report Detail'}</h2><button className="modal-close-button" type="button" onClick={onClose} aria-label="Close">×</button></div><p className="report-info-description">{descriptions[card]}</p>{isOutstanding && <>{sales.length === 0 ? <p className="report-info-empty">No customers currently have an outstanding balance.</p> : <div className="report-info-list">{sales.map((sale) => <div className="report-info-row" key={sale.saleId}><div><strong>{sale.customerName}</strong>{sale.customerPhone && <span>{sale.customerPhone}</span>}<span>Sale #{sale.saleId} · {sale.date}</span><span>Outstanding: {formatMoney(sale.balanceDue)}</span></div><button className="text-button" type="button" onClick={() => onMakePayment(sale)}>Make Payment</button></div>)}</div>}<p className="report-info-total">Total outstanding: {formatMoney(total)}</p></>}</section></div>
}

export default function ReportsPage() {
  const { user } = useAuth()
  const isSuperAdmin = user.role === ROLE.SUPER_ADMIN
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const [period, setPeriod] = useState('TODAY')
  const reportScope = cacheScope(user, companyId)
  const [summary, setSummary] = useState(() => readCached('report-TODAY--', reportScope))
  const [sales, setSales] = useState(() => salesForPeriod(readCached('sales', reportScope) || [], 'TODAY'))
  const [activeCard, setActiveCard] = useState(null)
  const [paymentSale, setPaymentSale] = useState(null)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [customError, setCustomError] = useState('')
  const loadRequestRef = useRef(0)

  const loadReport = useCallback(async ({ selectedCompanyId = companyId, selectedPeriod = period, startDate, endDate } = {}) => {
    const requestId = ++loadRequestRef.current
    if (selectedPeriod === 'CUSTOM' && (!isValidCustomDate(startDate) || !isValidCustomDate(endDate) || endDate < startDate)) {
      setSummary(null)
      setLoading(false)
      return false
    }
    if (isSuperAdmin && !selectedCompanyId) {
      setSummary(null)
      setLoading(false)
      return true
    }
    const cacheKey = `report-${selectedPeriod}-${startDate || ''}-${endDate || ''}`
    const cachedSummary = readCached(cacheKey, reportScope)
    const cachedSales = readCached('sales', reportScope)
    if (cachedSummary) setSummary(cachedSummary)
    if (cachedSales) setSales(salesForPeriod(cachedSales, selectedPeriod, startDate, endDate))
    setLoading(!cachedSummary)
    setError('')
    try {
      const scope = { ...(isSuperAdmin ? { companyId: selectedCompanyId } : {}), ...(selectedPeriod === 'CUSTOM' ? { startDate, endDate } : {}) }
      const [nextSummary, nextSales] = await Promise.all([fetchCached(cacheKey, reportScope, () => api.getReportSummary(authService.getToken(), selectedPeriod, scope)), fetchCached('sales', reportScope, () => api.getSales(authService.getToken(), isSuperAdmin ? { companyId: selectedCompanyId } : {}))])
      if (requestId === loadRequestRef.current) { setSummary(nextSummary); setSales(salesForPeriod(nextSales, selectedPeriod, startDate, endDate)) }
      return true
    } catch (requestError) {
      if (requestId === loadRequestRef.current) {
        setError(requestError.message || 'Unable to load the report.')
      }
      return false
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false)
    }
  }, [companyId, isSuperAdmin, period, reportScope])

  useEffect(() => {
    if (!isSuperAdmin) {
      loadReport()
      return
    }
    api.getCompanies(authService.getToken())
      .then(setCompanies)
      .catch((requestError) => {
        setError(requestError.message || 'Unable to load companies.')
        setLoading(false)
      })
  }, [isSuperAdmin, loadReport])
  useEffect(() => subscribeToVisibility(() => loadReport(period === 'CUSTOM' ? { selectedPeriod: 'CUSTOM', startDate: customStartDate, endDate: customEndDate } : {})), [customEndDate, customStartDate, loadReport, period])

  const selectedCompany = companies.find((company) => company.companyId === companyId)
  const pageTitle = isSuperAdmin ? 'Super Admin' : user.role === ROLE.SECRETARY ? 'Secretary' : 'Owner'
  const ready = !isSuperAdmin || Boolean(companyId)
  const isEmpty = summary && summary.totalSales === 0 && summary.totalAmountPaid === 0 && summary.totalExpenses === 0 && summary.completedProductionQuantity === 0

  function selectCompany(event) {
    const nextCompanyId = event.target.value
    setCompanyId(nextCompanyId)
    loadReport({ selectedCompanyId: nextCompanyId })
  }

  function selectPeriod(event) {
    const nextPeriod = event.target.value
    setPeriod(nextPeriod)
    setCustomError('')
    if (nextPeriod === 'CUSTOM') {
      setSummary(null)
      setLoading(false)
      return
    }
    loadReport({ selectedPeriod: nextPeriod })
  }

  function validateCustomRange(event) {
    event.preventDefault()
    if (!isValidCustomDate(customStartDate) || !isValidCustomDate(customEndDate)) return setCustomError('Start and end dates must be valid YYYY-MM-DD dates.')
    if (customEndDate < customStartDate) return setCustomError('End date cannot be before the start date.')
    setCustomError('')
    loadReport({ selectedPeriod: 'CUSTOM', startDate: customStartDate, endDate: customEndDate })
  }

  async function recordCustomerPayment(payment) {
    if (paymentSubmitting) return
    setPaymentSubmitting(true)
    setPaymentError('')
    try {
      const result = await api.createCustomerPayment(isSuperAdmin ? { ...payment, companyId } : payment, authService.getToken())
      const updatedSale = result.sale || { ...paymentSale, amountPaid: Number(paymentSale.amountPaid) + Number(payment.amount), balanceDue: Number(paymentSale.balanceDue) - Number(payment.amount), status: Number(paymentSale.balanceDue) - Number(payment.amount) === 0 ? 'PAID' : 'PARTIAL' }
      setSales((current) => { const next = current.map((sale) => sale.saleId === updatedSale.saleId ? updatedSale : sale); const allSales = (readCached('sales', reportScope) || []).map((sale) => sale.saleId === updatedSale.saleId ? updatedSale : sale); writeCached('sales', reportScope, allSales); return next })
      invalidateCached('sales', reportScope)
      invalidateCached(`report-${period}-${customStartDate || ''}-${customEndDate || ''}`, reportScope)
      setSummary((current) => {
        if (!current) return current
        const next = { ...current, totalAmountPaid: Number(current.totalAmountPaid) + (Number(updatedSale.amountPaid) - Number(paymentSale.amountPaid)), outstandingCustomerBalance: Number(current.outstandingCustomerBalance) + (Number(updatedSale.balanceDue) - Number(paymentSale.balanceDue)) }
        writeCached(`report-${period}-${customStartDate || ''}-${customEndDate || ''}`, reportScope, next)
        if (period === 'TODAY' && !customStartDate && !customEndDate) writeCached('report-summary-today', reportScope, next)
        return next
      })
      setPaymentSale(null)
      loadReport()
    } catch (requestError) {
      setPaymentError(requestError.message || 'Unable to record the customer payment.')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  return <AppShell title={pageTitle} context={isSuperAdmin ? (selectedCompany?.companyName || 'Select a company') : (user.companyId ? `Company ${user.companyId}` : 'Company context')}>
    <section className="reports-page" aria-labelledby="reports-title">
      <div className="reports-heading"><div><p className="eyebrow">Reports</p><h1 id="reports-title">Operations report</h1><p>Financial and operational figures are calculated by the backend for the selected reporting period.</p></div>{ready && (period !== 'CUSTOM' || summary) && <button className="secondary-button" type="button" onClick={() => loadReport(period === 'CUSTOM' ? { selectedPeriod: 'CUSTOM', startDate: customStartDate, endDate: customEndDate } : {})} disabled={loading}>Refresh</button>}</div>
      {isSuperAdmin && <label className="company-select">Company<select value={companyId} onChange={selectCompany} disabled={loading && !companies.length}><option value="">Select a company</option>{companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.companyName} ({company.companyId})</option>)}</select></label>}
      {ready && <section className="report-period-selector" aria-label="Reporting period"><label>Reporting period<select value={period} onChange={selectPeriod} disabled={loading}><>{reportPeriods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</></select></label>{period !== 'CUSTOM' && <p>Showing: <strong>{reportPeriods.find((option) => option.value === period)?.label}</strong></p>}</section>}
      {ready && period === 'CUSTOM' && <form className="custom-range-form" onSubmit={validateCustomRange}><label>Start date<input type="date" value={customStartDate} onChange={(event) => { setCustomStartDate(event.target.value); setCustomError(''); setSummary(null) }} required /></label><label>End date<input type="date" min={customStartDate || undefined} value={customEndDate} onChange={(event) => { setCustomEndDate(event.target.value); setCustomError(''); setSummary(null) }} required /></label><button className="secondary-button" type="submit">View report</button>{customError && <p className="feedback feedback-warning" role="status">{customError}</p>}</form>}
      {error && <p className="feedback feedback-error" role="alert">{error}</p>}
      {ready && (period !== 'CUSTOM' || summary) && <>{loading ? <p className="dashboard-status" role="status">Loading report…</p> : isEmpty ? <p className="dashboard-status">No financial or production activity has been recorded for this period.</p> : summary && <div className="report-content">
        <section aria-labelledby="financial-summary-title"><div className="report-section-heading"><div><p className="eyebrow">Financial summary</p><h2 id="financial-summary-title">Financial position</h2></div><p>{summary.period === 'CUSTOM' ? 'CUSTOM RANGE' : summary.period.replaceAll('_', ' ')}</p></div><div className="report-card-grid"><button className="report-card report-card-button" type="button" onClick={() => setActiveCard('totalSales')}><span>Total sales</span><strong>{formatMoney(summary.totalSales)}</strong></button><button className="report-card expense report-card-button" type="button" onClick={() => setActiveCard('totalExpenses')}><span>Total expenses</span><strong>{formatMoney(summary.totalExpenses)}</strong></button><button className="report-card report-card-button" type="button" onClick={() => setActiveCard('estimatedOperatingProfit')}><span>{summary.estimatedOperatingProfitLabel}</span><strong>{formatMoney(summary.estimatedOperatingProfit)}</strong></button><button className="report-card report-card-button" type="button" onClick={() => setActiveCard('totalAmountPaid')}><span>Amount collected</span><strong>{formatMoney(summary.totalAmountPaid)}</strong></button><button className="report-card report-card-button" type="button" onClick={() => setActiveCard('outstandingCustomerBalance')}><span>Outstanding customer balance</span><strong>{formatMoney(summary.outstandingCustomerBalance)}</strong></button></div></section>
        <section aria-labelledby="operational-summary-title"><div className="report-section-heading"><div><p className="eyebrow">Operational summary</p><h2 id="operational-summary-title">Production and inventory</h2></div><p>Inventory is current, not period-filtered.</p></div><div className="report-card-grid report-card-grid-compact"><article className="report-card"><span>Completed production quantity</span><strong>{formatNumber(summary.completedProductionQuantity)}</strong></article><article className="report-card"><span>Current inventory</span><strong>{formatNumber(summary.currentInventory)}</strong></article></div></section>
      </div>}</>}
      {isSuperAdmin && !companyId && !error && <p className="dashboard-status">Choose a company to view its report.</p>}
      {activeCard && <ReportInfoModal card={activeCard} sales={sales.filter((sale) => Number(sale.balanceDue) > 0).sort((first, second) => String(second.date).localeCompare(String(first.date)))} total={summary?.outstandingCustomerBalance ?? 0} onClose={() => setActiveCard(null)} onMakePayment={(sale) => { setPaymentSale(sale); setActiveCard(null); setPaymentError('') }} />}
      {paymentSale && <CustomerPaymentModal sale={paymentSale} submitting={paymentSubmitting} error={paymentError} onCancel={() => { if (!paymentSubmitting) setPaymentSale(null) }} onSubmit={recordCustomerPayment} />}
    </section>
  </AppShell>
}
