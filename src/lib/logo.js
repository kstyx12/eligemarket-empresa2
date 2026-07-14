// src/lib/logo.js — logo de la marca (DIMACE). Se importa como asset (Vite le da una URL).
import logoUrl from '../assets/logo-dimace.jpeg'

export const LOGO_URL = logoUrl

// Devuelve el logo como dataURL base64, para incrustarlo en los PDF con jsPDF.
export async function logoDataURL() {
  try {
    const res = await fetch(logoUrl)
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch { return null }
}
