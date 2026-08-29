export default function DashboardPlaceholder({ roleLabel, companyId }) {
  return (
    <section className="dashboard-placeholder">
      <p className="eyebrow">{roleLabel}</p>
      <h1>Dashboard</h1>
      {companyId && <p className="company-context">Company: {companyId}</p>}
      <p>Phase 1 foundation is ready. Operational modules will be added in later phases.</p>
    </section>
  )
}
