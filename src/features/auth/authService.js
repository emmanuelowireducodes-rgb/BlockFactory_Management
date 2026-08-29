import { api } from '../../services/api'

const SESSION_STORAGE_KEY = 'blockfactory.auth.session'

function readSession() {
  try {
    const serialized = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!serialized) return null
    const session = JSON.parse(serialized)
    return session?.token && session?.user ? session : null
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

function persistSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export const authService = {
  async getSession() {
    return readSession()?.user ?? null
  },
  async signIn(username, password) {
    const session = await api.login(username, password)
    persistSession(session)
    return session.user
  },
  async signOut() {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  },
  getToken() {
    return readSession()?.token ?? null
  }
}
