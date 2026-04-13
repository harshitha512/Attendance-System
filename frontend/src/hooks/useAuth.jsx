import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('adminInfo'))
    } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) { setLoading(false); return }
    authAPI.me()
      .then(res => setAdmin(res.data.admin))
      .catch(() => {
        localStorage.removeItem('authToken')
        localStorage.removeItem('adminInfo')
        setAdmin(null) // ✅ FIX: clear admin state so user is redirected to /login
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (username, password) => {
    const res = await authAPI.login({ username, password })
    const { token, admin } = res.data
    localStorage.setItem('authToken', token)
    localStorage.setItem('adminInfo', JSON.stringify(admin))
    setAdmin(admin)
    return admin
  }

  const logout = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('adminInfo')
    setAdmin(null)
  }

  return (
    <AuthContext.Provider value={{ admin, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
