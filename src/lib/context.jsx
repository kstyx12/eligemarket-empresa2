// src/lib/context.jsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { getSession, logout as authLogout } from './auth.js'

// ── TOAST ─────────────────────────────────────────────────
const ToastCtx = createContext(null)
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const toast = useCallback((msg, type = 'default', ms = 3500) => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ms)
  }, [])
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// ── AUTH ──────────────────────────────────────────────────
const AuthCtx = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSession())
  const login = (u) => setUser(u)
  const logout = () => { authLogout(); setUser(null) }
  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>
}
export const useAuth = () => useContext(AuthCtx)
