// src/lib/auth.js
import { getSupabase, SUPABASE_URL } from './supabase.js'

const DEFAULT_USERS = [
  { id: 1, username: 'admin', password: 'admin123', role: 'admin', nombre: 'Administrador' },
  { id: 2, username: 'sergio', password: 'sergio123', role: 'vendedor', nombre: 'Sergio' },
]

function getLocalUsers() {
  try {
    const stored = localStorage.getItem('em_users')
    return stored ? JSON.parse(stored) : DEFAULT_USERS
  } catch { return DEFAULT_USERS }
}

export function saveLocalUsers(users) {
  localStorage.setItem('em_users', JSON.stringify(users))
}

function isSupabaseConfigured() {
  return typeof SUPABASE_URL === 'string' && !SUPABASE_URL.includes('TU_PROYECTO')
}

export async function login(username, password) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      if (sb) {
        // Intentar login como usuario (admin/vendedor)
        const { data, error } = await sb
          .from('usuarios')
          .select('*')
          .eq('username', username.trim())
          .eq('password', password.trim())
          .single()
        if (!error && data) {
          const user = { id: data.id, username: data.username, role: data.role, nombre: data.nombre }
          localStorage.setItem('em_session', JSON.stringify(user))
          return { user, source: 'supabase' }
        }

        // Intentar login como cliente
        const usernameTrimmed = username.trim().toLowerCase()
        const passwordTrimmed = password.trim()
        const { data: clienteData, error: clienteError } = await sb
          .from('clientes')
          .select('*')
          .ilike('username', usernameTrimmed)
          .single()
        if (!clienteError && clienteData && clienteData.password === passwordTrimmed) {
          const user = {
            id: clienteData.id,
            username: clienteData.username,
            role: 'cliente',
            nombre: clienteData.nombre,
            canal: clienteData.canal || 'Ruta',
            vendedor_id: clienteData.vendedor_id
          }
          localStorage.setItem('em_session', JSON.stringify(user))
          return { user, source: 'supabase' }
        }
      }
    } catch (e) { console.error('login error:', e) }
  }

  const users = getLocalUsers()
  const found = users.find(u => u.username === username && u.password === password)
  if (found) {
    const user = { id: found.id, username: found.username, role: found.role, nombre: found.nombre }
    localStorage.setItem('em_session', JSON.stringify(user))
    return { user, source: 'local' }
  }
  return null
}

export function getSession() {
  try {
    const s = localStorage.getItem('em_session')
    return s ? JSON.parse(s) : null
  } catch { return null }
}

export function logout() {
  localStorage.removeItem('em_session')
}

export function changePassword(username, oldPass, newPass) {
  const users = getLocalUsers()
  const idx = users.findIndex(u => u.username === username && u.password === oldPass)
  if (idx === -1) return false
  users[idx].password = newPass
  saveLocalUsers(users)
  return true
}
