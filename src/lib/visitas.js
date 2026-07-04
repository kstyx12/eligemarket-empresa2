// src/lib/visitas.js
import { getSupabase } from './supabase.js'

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
function lsSet(key, data) { localStorage.setItem(key, JSON.stringify(data)) }
function nextId(arr) { return arr.length ? Math.max(...arr.map(x => x.id || 0)) + 1 : 1 }

export async function getVisitas(filters = {}) {
  try {
    const sb = await getSupabase()
    if (sb) {
      let q = sb.from('visitas').select('*').order('created_at', { ascending: false })
      if (filters.vendedor_id) q = q.eq('vendedor_id', filters.vendedor_id)
      if (filters.cliente_id) q = q.eq('cliente_id', filters.cliente_id)
      const { data } = await q
      if (data) return data
    }
  } catch (e) { console.error('getVisitas error:', e) }
  let data = lsGet('em_visitas')
  if (filters.vendedor_id) data = data.filter(v => v.vendedor_id === filters.vendedor_id)
  if (filters.cliente_id) data = data.filter(v => v.cliente_id === filters.cliente_id)
  return data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function createVisita(visita) {
  try {
    const sb = await getSupabase()
    if (sb) {
      const { data } = await sb.from('visitas').insert(visita).select().single()
      if (data) return data
    }
  } catch (e) { console.error('createVisita error:', e) }
  const arr = lsGet('em_visitas')
  const nuevo = { ...visita, id: nextId(arr), created_at: new Date().toISOString() }
  lsSet('em_visitas', [...arr, nuevo])
  return nuevo
}

export async function uploadFotoCliente(clienteId, file) {
  try {
    const sb = await getSupabase()
    if (!sb) throw new Error('No Supabase')
    const ext = file.name.split('.').pop()
    const path = `cliente_${clienteId}_${Date.now()}.${ext}`
    const { error } = await sb.storage.from('fotos-clientes').upload(path, file, { upsert: true })
    if (error) throw error
    const { data: urlData } = sb.storage.from('fotos-clientes').getPublicUrl(path)
    return urlData.publicUrl
  } catch (e) {
    console.error('Upload error:', e)
    return null
  }
}

export async function uploadFotoProducto(productoId, file) {
  try {
    const { getSupabase } = await import('./supabase.js')
    const sb = await getSupabase()
    if (!sb) throw new Error('No Supabase')
    const ext = file.name.split('.').pop()
    const path = `producto_${productoId}_${Date.now()}.${ext}`
    const { error } = await sb.storage.from('Fotos-productos').upload(path, file, { upsert: true })
    if (error) throw error
    const { data: urlData } = sb.storage.from('Fotos-productos').getPublicUrl(path)
    return urlData.publicUrl
  } catch (e) {
    console.error('Upload foto producto error:', e)
    return null
  }
}

export function getGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, enableHighAccuracy: true }
    )
  })
}
