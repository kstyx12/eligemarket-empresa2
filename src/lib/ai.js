// src/lib/ai.js
// Llama a la Edge Function de Supabase que genera el diagnóstico con Claude.
// La API key de Anthropic vive SOLO en Supabase (secreto), nunca en el cliente.
import { getSupabase } from './supabase.js'

export async function generarInsightsIA(datos) {
  const sb = await getSupabase()
  // functions.invoke agrega automáticamente la anon key / Authorization
  const { data, error } = await sb.functions.invoke('generar-insights', {
    body: datos,
  })
  if (error) {
    // Intentar extraer un mensaje útil del cuerpo de la respuesta
    let msg = error.message || 'Error al generar el análisis'
    try {
      const ctx = await error.context?.json?.()
      if (ctx?.error) msg = ctx.error
    } catch { /* noop */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
