// src/lib/pdfDownload.js
export function descargarPDF(doc, nombreArchivo) {
  try {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    
    if (isIOS) {
      // En iOS: mostrar en modal dentro de la app
      const dataUri = doc.output('datauristring')
      
      // Crear modal overlay
      const overlay = document.createElement('div')
      overlay.id = 'pdf-viewer-overlay'
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.9);
        display: flex; flex-direction: column;
      `
      
      // Header con botones
      const header = document.createElement('div')
      header.style.cssText = `
        background: #C0392B; padding: 12px 16px;
        display: flex; justify-content: space-between; align-items: center;
        flex-shrink: 0;
      `
      header.innerHTML = `
        <span style="color:#fff; font-weight:700; font-size:14px">📄 ${nombreArchivo}</span>
        <div style="display:flex; gap:8px">
          <a href="${dataUri}" download="${nombreArchivo}" 
            style="background:rgba(255,255,255,0.2); color:#fff; padding:6px 12px; border-radius:6px; text-decoration:none; font-size:13px; font-weight:600">
            ⬇️ Guardar
          </a>
          <button onclick="document.getElementById('pdf-viewer-overlay').remove()" 
            style="background:rgba(255,255,255,0.2); color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:13px; cursor:pointer">
            ✕ Cerrar
          </button>
        </div>
      `
      
      // iframe con el PDF
      const iframe = document.createElement('iframe')
      iframe.src = dataUri
      iframe.style.cssText = `
        flex: 1; border: none; width: 100%; background: white;
      `
      
      overlay.appendChild(header)
      overlay.appendChild(iframe)
      document.body.appendChild(overlay)
      
    } else {
      // Android / Desktop: descarga normal
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombreArchivo
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 3000)
    }
  } catch (err) {
    console.error('PDF error:', err)
    try {
      // Fallback final
      const dataUri = doc.output('datauristring')
      const a = document.createElement('a')
      a.href = dataUri
      a.download = nombreArchivo
      a.click()
    } catch (e2) {
      alert('Error al generar PDF: ' + err.message)
    }
  }
}
