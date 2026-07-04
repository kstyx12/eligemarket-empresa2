// INSTANCIA 2 — apunta a su propio proyecto Supabase (datos aislados)
const SUPABASE_URL = 'https://xkdphzjllvwzrpghajva.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_6hqc0kmG4Tkea4EOeeGvfQ_UoAmT9Dh'

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
