import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { authService } from './authService'
import { api } from '../../services/api'
import { subscribeToVisibility } from '../../services/dataCache'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [access, setAccess] = useState(null)
  const [accessLoading, setAccessLoading] = useState(false)

  async function loadAccess() {
    const result = await api.getAccess(authService.getToken())
    setAccess(result)
    return result
  }

  useEffect(() => {
    authService.getSession().then((session) => {
      setUser(session)
      setIsLoading(false)
      if (session) { setAccessLoading(true); loadAccess().catch(() => setAccess(null)).finally(() => setAccessLoading(false)) }
    })
  }, [])

  useEffect(() => user ? subscribeToVisibility(() => loadAccess().catch(() => {})) : undefined, [user])

  const value = useMemo(() => ({
    user,
    isLoading,
    signIn: async (username, password) => {
      const user = await authService.signIn(username, password)
      setUser(user)
      setAccessLoading(true)
      await loadAccess().catch(() => setAccess(null)).finally(() => setAccessLoading(false))
      return user
    },
    signOut: async () => {
      await authService.signOut()
      setUser(null)
      setAccess(null)
    },
    access,
    accessLoading,
    refreshAccess: loadAccess
  }), [user, isLoading, access, accessLoading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
