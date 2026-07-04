// ⚠️ INSTANCIA 2 — PENDIENTE DE CONFIGURAR
// Reemplaza estas dos líneas con la URL y la key del proyecto Supabase NUEVO
// (Supabase → Settings → API). Mientras diga 'TU_PROYECTO', la app funciona
// en modo localStorage y NO se conecta a ninguna base de datos.
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co'
const SUPABASE_ANON_KEY = 'TU_ANON_KEY_AQUI'

let supabaseClient = null

export async function getSupabase() {
  if (supabaseClient) return supabaseClient
  try {
    const { createClient } = await import('@supabase/supabase-js')
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    return supabaseClient
  } catch (e) {
    return null
  }
}

export { SUPABASE_URL, SUPABASE_ANON_KEY }
