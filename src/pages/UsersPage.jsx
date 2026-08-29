import { useCallback, useEffect, useRef, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import { ROLE } from '../config/roles'
import { useAuth } from '../features/auth/AuthContext'
import { authService } from '../features/auth/authService'
import { api } from '../services/api'
import { cacheScope, fetchCached, invalidateCached, readCached, subscribeToVisibility, writeCached } from '../services/dataCache'

const emptyUser = { name: '', username: '', password: '', roleId: '' }
const permissionOptions = ['VIEW_DASHBOARD', 'VIEW_PRODUCTS', 'MANAGE_PRODUCTS', 'VIEW_SALES', 'CREATE_SALE', 'VIEW_INVENTORY', 'MANAGE_INVENTORY', 'VIEW_PRODUCTION', 'CREATE_PRODUCTION', 'VIEW_EXPENSES', 'CREATE_EXPENSE', 'VIEW_CUSTOMER_PAYMENTS', 'CREATE_CUSTOMER_PAYMENT', 'VIEW_REPORTS', 'VIEW_CUSTOMERS', 'MANAGE_USERS', 'MANAGE_ROLES']

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(date)
}

function UserForm({ roles, initialUser, onCancel, onSubmit, submitting }) {
  const [values, setValues] = useState({ ...emptyUser, ...initialUser, roleId: initialUser?.roleId || roles[0]?.roleId || '' })
  const [error, setError] = useState('')
  useEffect(() => { if (!values.roleId && roles[0]) setValues((current) => ({ ...current, roleId: roles[0].roleId })) }, [roles, values.roleId])

  function change(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
  }

  function submit(event) {
    event.preventDefault()
    if (!values.name.trim() || !values.username.trim() || !values.password) return setError('Name, username, and password are required.')
    if (!initialUser && values.password.length < 12) return setError('Password must contain at least 12 characters.')
    onSubmit({ userId: initialUser?.userId, name: values.name.trim(), username: values.username.trim(), password: values.password, roleId: values.roleId })
  }

  return <form className="user-form" onSubmit={submit}>
    <label>Name<input name="name" value={values.name} onChange={change} required disabled={submitting} /></label>
    <label>Username<input name="username" value={values.username} onChange={change} required disabled={submitting} autoComplete="username" /></label>
    <label>Password<input name="password" type="password" value={values.password} onChange={change} required={!initialUser} minLength="12" disabled={submitting} autoComplete="new-password" /><span>{initialUser ? 'Leave blank to keep the current password.' : 'At least 12 characters.'}</span></label>
    <label>Role<select name="roleId" value={values.roleId} onChange={change} disabled={submitting || !roles.length}>{roles.map((role) => <option key={role.roleId} value={role.roleId}>{role.name}</option>)}</select></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="user-form-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={submitting}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : initialUser ? 'Save user' : 'Add user'}</button></div>
  </form>
}

function ResetPasswordForm({ target, onCancel, onSubmit, submitting }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function submit(event) {
    event.preventDefault()
    if (password.length < 12) return setError('Password must contain at least 12 characters.')
    if (!window.confirm(`Reset the password for ${target.name}?`)) return
    onSubmit(password)
  }

  return <form className="user-form" onSubmit={submit}>
    <label>New password for {target.name}<input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} required minLength="12" disabled={submitting} autoComplete="new-password" /><span>At least 12 characters.</span></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="user-form-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={submitting}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Resetting…' : 'Reset password'}</button></div>
  </form>
}

export default function UsersPage() {
  const { user } = useAuth()
  const isSuperAdmin = user.role === ROLE.SUPER_ADMIN
  const [companyId, setCompanyId] = useState('')
  const dataScope = cacheScope(user, companyId)
  const adminScope = cacheScope(user, 'admin')
  const [companies, setCompanies] = useState(() => readCached('companies', adminScope) || [])
  const [users, setUsers] = useState(() => readCached('users', dataScope) || [])
  const [loading, setLoading] = useState(() => !readCached('users', dataScope))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [roles, setRoles] = useState([])
  const [roleName, setRoleName] = useState('')
  const [rolePermissions, setRolePermissions] = useState([])
  const [roleError, setRoleError] = useState('')
  const [roleEditing, setRoleEditing] = useState(null)
  const loadRequestRef = useRef(0)

  const loadUsers = useCallback(async (selectedCompanyId = companyId) => {
    const requestId = ++loadRequestRef.current
    if (isSuperAdmin && !selectedCompanyId) {
      setUsers([])
      setLoading(false)
      return
    }
    const selectedScope = cacheScope(user, selectedCompanyId)
    const cachedUsers = readCached('users', selectedScope)
    if (cachedUsers) setUsers(cachedUsers)
    setLoading(!cachedUsers)
    setError('')
    try {
      const result = await fetchCached('users', selectedScope, () => api.getUsers(authService.getToken(), isSuperAdmin ? { companyId: selectedCompanyId } : {}))
      if (requestId === loadRequestRef.current) setUsers(result)
    } catch (requestError) {
      if (requestId === loadRequestRef.current) setError(requestError.message || 'Unable to load users.')
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false)
    }
  }, [companyId, isSuperAdmin, user])

  useEffect(() => {
    if (!isSuperAdmin) {
      loadUsers()
      return
    }
    fetchCached('companies', adminScope, () => api.getCompanies(authService.getToken()))
      .then(setCompanies)
      .catch((requestError) => { setError(requestError.message || 'Unable to load companies.'); setLoading(false) })
  }, [isSuperAdmin, loadUsers])
  useEffect(() => { api.getRoles(authService.getToken(), isSuperAdmin ? { companyId } : {}).then(setRoles).catch((requestError) => setRoleError(requestError.message || 'Unable to load company roles.')) }, [companyId, isSuperAdmin])
  useEffect(() => subscribeToVisibility(loadUsers), [loadUsers])

  const selectedCompany = companies.find((company) => company.companyId === companyId)
  const ready = !isSuperAdmin || Boolean(companyId)
  const pageTitle = isSuperAdmin ? 'Super Admin' : 'Owner'

  function selectCompany(event) {
    const nextCompanyId = event.target.value
    setCompanyId(nextCompanyId)
    setNotice('')
    setIsCreateOpen(false)
    setResetTarget(null)
    loadUsers(nextCompanyId)
  }

  async function createUser(values) {
    if (submitting) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const createdUser = editTarget
        ? await api.updateUser(isSuperAdmin ? { ...values, companyId } : values, authService.getToken())
        : await api.createUser(isSuperAdmin ? { ...values, companyId } : values, authService.getToken())
      invalidateCached('users', dataScope)
      setUsers((current) => { const next = editTarget ? current.map((item) => item.userId === createdUser.userId ? createdUser : item) : [createdUser, ...current]; writeCached('users', dataScope, next); return next })
      setIsCreateOpen(false)
      setEditTarget(null)
      setNotice('User created successfully.')
      loadUsers()
    } catch (requestError) {
      setError(requestError.message || 'Unable to create user.')
    } finally {
      setSubmitting(false)
    }
  }

  async function createRole(event) {
    event.preventDefault()
    if (!roleName.trim()) return setRoleError('Role name is required.')
    try {
      const created = roleEditing ? await api.updateRole({ roleId: roleEditing.roleId, name: roleName.trim(), permissions: rolePermissions }, authService.getToken()) : await api.createRole({ name: roleName.trim(), permissions: rolePermissions }, authService.getToken())
      setRoles((current) => roleEditing ? current.map((role) => role.roleId === created.roleId ? created : role) : [...current, created]); setRoleName(''); setRolePermissions([]); setRoleEditing(null); setRoleError('')
    } catch (requestError) { setRoleError(requestError.message || 'Unable to create role.') }
  }

  async function deleteRole(role) {
    try { await api.deleteRole(role.roleId, authService.getToken()); setRoles((current) => current.filter((item) => item.roleId !== role.roleId)); setRoleError('') } catch (requestError) { setRoleError(requestError.message || 'Unable to delete role.') }
  }

  async function resetPassword(newPassword) {
    if (!resetTarget || submitting) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      await api.resetPassword(resetTarget.userId, newPassword, authService.getToken(), isSuperAdmin ? { companyId } : {})
      setResetTarget(null)
      setNotice(`Password reset for ${resetTarget.name}.`)
      invalidateCached('users', dataScope)
      loadUsers()
    } catch (requestError) {
      setError(requestError.message || 'Unable to reset password.')
    } finally {
      setSubmitting(false)
    }
  }

  async function setActive(managedUser, active) {
    const action = active ? 'activate' : 'deactivate'
    if (submitting || !window.confirm(`${active ? 'Activate' : 'Deactivate'} ${managedUser.name}?`)) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const updatedUser = await api.setUserActive(managedUser.userId, active, authService.getToken(), isSuperAdmin ? { companyId } : {})
      invalidateCached('users', dataScope)
      setUsers((current) => { const next = current.map((item) => item.userId === updatedUser.userId ? updatedUser : item); writeCached('users', dataScope, next); return next })
      setNotice(`${managedUser.name} was ${action}d.`)
      loadUsers()
    } catch (requestError) {
      setError(requestError.message || `Unable to ${action} user.`)
    } finally {
      setSubmitting(false)
    }
  }

  return <AppShell title={pageTitle} context={isSuperAdmin ? (selectedCompany?.companyName || 'Select a company') : (user.companyId ? `Company ${user.companyId}` : 'Company context')}>
    <section className="users-page" aria-labelledby="users-title">
      <div className="users-heading"><div><p className="eyebrow">Users</p><h1 id="users-title">User management</h1><p>Manage accounts for the selected company.</p></div>{ready && <button className="primary-button" type="button" onClick={() => { setIsCreateOpen(true); setResetTarget(null); setNotice('') }}>Add user</button>}</div>
      {isSuperAdmin && <label className="company-select">Company<select value={companyId} onChange={selectCompany} disabled={loading && !companies.length}><option value="">Select a company</option>{companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.companyName} ({company.companyId})</option>)}</select></label>}
      {notice && <p className="feedback feedback-success" role="status">{notice}</p>}
      {error && <p className="feedback feedback-error" role="alert">{error}</p>}
      {ready && <>
        <div className="users-toolbar"><h2>Company users</h2><button className="secondary-button" type="button" onClick={() => loadUsers()} disabled={loading || submitting}>Refresh</button></div>
        {(isCreateOpen || editTarget) && <section className="user-editor" aria-labelledby="add-user-title"><h2 id="add-user-title">{editTarget ? 'Edit user' : 'Add user'}</h2><UserForm roles={roles.filter((role) => role.name !== 'OWNER')} initialUser={editTarget} submitting={submitting} onSubmit={createUser} onCancel={() => { setIsCreateOpen(false); setEditTarget(null) }} /></section>}
        {!isSuperAdmin && <section className="user-editor" aria-labelledby="role-management-title"><h2 id="role-management-title">Role management</h2>{roleError && <p className="form-error" role="alert">{roleError}</p>}<div className="role-list">{roles.map((role) => <p key={role.roleId}><strong>{role.name}</strong><span>{role.systemRole ? 'Protected system role' : `${users.filter((item) => item.roleId === role.roleId).length} users assigned`}</span>{!role.systemRole && <><button className="text-button" type="button" onClick={() => { setRoleEditing(role); setRoleName(role.name); setRolePermissions(role.permissions) }}>Edit</button><button className="text-button danger" type="button" onClick={() => deleteRole(role)}>Delete</button></>}</p>)}</div><form className="role-form" onSubmit={createRole}><label>{roleEditing ? 'Edit role' : 'New role'}<input value={roleName} onChange={(event) => setRoleName(event.target.value)} /></label><div className="permission-options">{permissionOptions.map((permission) => <label key={permission}><input type="checkbox" checked={rolePermissions.includes(permission)} onChange={(event) => setRolePermissions((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} />{permission.replaceAll('_', ' ')}</label>)}</div><button className="secondary-button" type="submit">{roleEditing ? 'Save role' : 'Create role'}</button></form></section>}
        {resetTarget && <section className="user-editor" aria-labelledby="reset-password-title"><h2 id="reset-password-title">Reset password</h2><ResetPasswordForm target={resetTarget} submitting={submitting} onSubmit={resetPassword} onCancel={() => setResetTarget(null)} /></section>}
        {loading ? <p className="dashboard-status" role="status">Loading users…</p> : users.length === 0 ? <p className="dashboard-status">No users have been created for this company.</p> : <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>{users.map((managedUser) => { const manageable = isSuperAdmin || managedUser.role !== ROLE.OWNER; return <tr key={managedUser.userId}><td data-label="Name">{managedUser.name}</td><td data-label="Username">{managedUser.username}</td><td data-label="Role">{managedUser.role.replaceAll('_', ' ')}</td><td data-label="Status"><span className={managedUser.active ? 'status-badge active' : 'status-badge inactive'}>{managedUser.active ? 'ACTIVE' : 'INACTIVE'}</span></td><td data-label="Created">{formatDate(managedUser.createdAt)}</td><td data-label="Actions" className="user-actions">{manageable && <><button className="text-button" type="button" onClick={() => { setEditTarget(managedUser); setIsCreateOpen(false); setResetTarget(null); setNotice('') }} disabled={submitting}>Edit</button><button className="text-button" type="button" onClick={() => { setResetTarget(managedUser); setIsCreateOpen(false); setEditTarget(null); setNotice('') }} disabled={submitting}>Reset password</button><button className={managedUser.active ? 'text-button danger' : 'text-button'} type="button" onClick={() => setActive(managedUser, !managedUser.active)} disabled={submitting}>{managedUser.active ? 'Deactivate' : 'Activate'}</button></>}</td></tr> } )}</tbody></table></div>}
      </>}
      {isSuperAdmin && !companyId && !error && <p className="dashboard-status">Choose a company to view and manage its users.</p>}
    </section>
  </AppShell>
}
