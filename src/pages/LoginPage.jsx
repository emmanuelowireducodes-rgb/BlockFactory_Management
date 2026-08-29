import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROLE } from '../config/roles'
import { useAuth } from '../features/auth/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username') ?? '')
    const password = String(form.get('password') ?? '')
    try {
      const user = await signIn(username, password)
      navigate(user.role === ROLE.SUPER_ADMIN ? '/super-admin' : user.role === ROLE.SECRETARY ? '/secretary' : '/owner')
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in.')
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="eyebrow">Management PWA</p>
        <h1>BlockFactory</h1>
        <p>Sign in with the account issued for your company.</p>
        <form className="role-options" onSubmit={handleSubmit}>
          <label>Username<input name="username" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  )
}
