// src/lib/img.js
// Devuelve una miniatura liviana de una imagen de Supabase Storage usando el
// endpoint de transformación (/render/image/). Baja fotos de ~2 MB a ~20 KB,
// ideal para listas y grillas donde se cargan muchas de golpe.
// Si la URL no es de storage público, la devuelve tal cual.
export function thumb(url, width = 100, quality = 60) {
  if (!url || typeof url !== 'string' || !url.includes('/object/public/')) return url
  const sep = url.includes('?') ? '&' : '?'
  return url.replace('/object/public/', '/render/image/public/') + `${sep}width=${width}&quality=${quality}`
}
