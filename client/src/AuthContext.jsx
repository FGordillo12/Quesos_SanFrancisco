import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api.get('/auth/me')
      .then(({ data }) => { if (active) setUser(data.data.user) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    async signIn(credentials) {
      const { data } = await api.post('/auth/login', credentials)
      setUser(data.data.user)
      return data.data.user
    },
    async signOut() {
      try { await api.post('/auth/logout') } finally { setUser(null) }
    },
    setAuthenticatedUser: setUser,
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.')
  return context
}
