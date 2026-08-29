import { NavLink } from 'react-router-dom'
import { navigationByRole } from '../../config/navigation'
import { ROLE } from '../../config/roles'
import { useAuth } from '../../features/auth/AuthContext'

export default function AppShell({ title, context, children }) {
  const { user, signOut, access } = useAuth()
  const links = (navigationByRole[user.role] ?? navigationByRole[ROLE.SECRETARY]).filter((link) => !access || (!link.feature || link.feature === 'DASHBOARD' || access.features?.some((item) => item.feature === link.feature && item.enabled)) && (!link.permission || access.permissions?.includes(link.permission)))

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><strong>BlockFactory</strong><span>{title}{context ? ` · ${context}` : ''}</span></div>
        <button className="sign-out-button" type="button" onClick={signOut}>Sign out</button>
      </header>
      <main className="page-content">{children}</main>
      <nav className="bottom-nav" aria-label="Primary navigation">
        {links.map((link) => link.disabled
          ? <span key={link.label} className="nav-item-disabled" aria-disabled="true">{link.label}</span>
          : <NavLink key={link.path} to={link.path}>{link.label}</NavLink>
        )}
      </nav>
    </div>
  )
}
