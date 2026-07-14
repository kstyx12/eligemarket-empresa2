import { descargarPDF } from './pdfDownload.js'
import { logoDataURL } from './logo.js'
// src/lib/pdfCatalogo.js
export async function generarCatalogoPDF(productos, opciones = {}) {
  // opciones.ocultarSinStock = true → muestra todos los productos pero sin el banner "SIN STOCK"
  const ocultarSinStock = opciones === true ? false : opciones?.ocultarSinStock === true

  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, H = 297
  const margin = 8
  const contentW = W - margin * 2
  const logo = await logoDataURL()

  // Colores
  const ROJO = [192, 57, 43]
  const ROJO_OSC = [150, 40, 30]
  const AZUL = [40, 80, 179]
  const DORADO = [176, 122, 0]
  const GRIS_BG = [250, 248, 248]
  const GRIS_BORDE = [230, 210, 210]

  // Agrupar por categoría
  const categorias = {}
  for (const p of productos) {
    if (!p.activo) continue
    const cat = p.categoria || 'Sin categoría'
    if (!categorias[cat]) categorias[cat] = []
    categorias[cat].push(p)
  }
  const cats = Object.keys(categorias).sort()

  function fmtPrice(n) {
    if (!n || n === 0) return '—'
    return '$' + Math.round(n).toLocaleString('es-CL')
  }

  function drawPageBase(cat) {
    // Header rojo
    doc.setFillColor(...ROJO)
    doc.rect(0, 0, W, 20, 'F')
    // Logo DIMACE (badge blanco a la izquierda)
    if (logo) doc.addImage(logo, 'JPEG', margin, 2.5, 15, 15)
    const tx = logo ? margin + 18 : margin
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('DIMACE', tx, 9)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.text(cat.toUpperCase(), tx, 15)
    // Derecha
    doc.setFontSize(8)
    doc.text('Catálogo de Productos', W - margin, 12, { align: 'right' })
    doc.setTextColor(30, 30, 30)
    // Footer rojo
    doc.setFillColor(...ROJO_OSC)
    doc.rect(0, H - 7, W, 7, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.text('DIMACE · Distribuidora Mayorista Central', W / 2, H - 2.5, { align: 'center' })
    doc.setTextColor(30, 30, 30)
  }

  async function loadImage(url) {
    if (!url) return null
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      return new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch { return null }
  }

  // Layout: 3 columnas
  const cols = 3
  const gap = 4
  const cardW = (contentW - gap * (cols - 1)) / cols  // ~61mm
  const imgH = 55   // foto alta
  const codeH = 7
  const textH = 38  // espacio para nombre + precios
  const cardH = imgH + codeH + textH  // ~100mm
  const startY = 22
  const rowH = cardH + gap

  let primeraHoja = true

  for (const cat of cats) {
    const prods = categorias[cat]
    if (!prods?.length) continue

    if (!primeraHoja) doc.addPage()
    primeraHoja = false
    drawPageBase(cat)

    let col = 0
    let row = 0

    for (let pi = 0; pi < prods.length; pi++) {
      const p = prods[pi]

      // Nueva página si no cabe
      const y = startY + row * rowH
      if (y + cardH > H - 10) {
        doc.addPage()
        drawPageBase(cat)
        col = 0
        row = 0
      }

      const cx = margin + col * (cardW + gap)
      const cy = startY + row * rowH

      // Fondo tarjeta
      doc.setFillColor(...GRIS_BG)
      doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'F')
      doc.setDrawColor(...GRIS_BORDE)
      doc.setLineWidth(0.3)
      doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'S')

      // ── IMAGEN ──────────────────────────────────────
      const imgData = await loadImage(p.imagen_url)
      // Área imagen con fondo blanco
      doc.setFillColor(255, 255, 255)
      doc.rect(cx + 1, cy + 1, cardW - 2, imgH - 1, 'F')

      if (imgData) {
        try {
          // Centrar imagen manteniendo proporción
          doc.addImage(imgData, 'JPEG', cx + 1, cy + 1, cardW - 2, imgH - 1, undefined, 'FAST')
        } catch {
          doc.setTextColor(...ROJO)
          doc.setFontSize(7)
          doc.text('SIN FOTO', cx + cardW / 2, cy + imgH / 2, { align: 'center' })
          doc.setTextColor(30, 30, 30)
        }
      } else {
        doc.setTextColor(200, 200, 200)
        doc.setFontSize(20)
        doc.text('📦', cx + cardW / 2, cy + imgH / 2 + 4, { align: 'center' })
        doc.setTextColor(30, 30, 30)
      }

      // Sin stock overlay (se omite si ocultarSinStock)
      const marcarSinStock = p.sin_stock && !ocultarSinStock
      if (marcarSinStock) {
        doc.setFillColor(220, 50, 50)
        doc.rect(cx + 1, cy + imgH/2 - 7, cardW - 2, 14, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('SIN STOCK', cx + cardW / 2, cy + imgH/2 + 2.5, { align: 'center' })
        doc.setTextColor(30, 30, 30)
      }

      // ── BARRA CÓDIGO ────────────────────────────────
      const codeY = cy + imgH
      doc.setFillColor(...(marcarSinStock ? [150, 50, 50] : ROJO))
      doc.rect(cx + 1, codeY, cardW - 2, codeH, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.text(p.codigo || '', cx + cardW / 2, codeY + codeH - 1.5, { align: 'center' })
      doc.setTextColor(30, 30, 30)

      // ── NOMBRE ──────────────────────────────────────
      const nombreY = codeY + codeH + 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      const nombreLines = doc.splitTextToSize(p.descripcion || '', cardW - 4)
      const maxNombreLines = 2
      doc.text(nombreLines.slice(0, maxNombreLines), cx + cardW / 2, nombreY, { align: 'center', lineHeightFactor: 1.4 })

      // ── PRECIOS ──────────────────────────────────────
      const uds = Number(p.unidades_caja) || 1
      const precios = [
        { label: 'Ruta:', valor: p.precio_venta, color: ROJO },
        ...(p.precio_ruta > 0 ? [{ label: `Vol +${p.precio_ruta_minimo}:`, valor: p.precio_ruta, color: AZUL }] : []),
        ...(p.precio_mayorista > 0 ? [{ label: `May +${p.precio_mayorista_minimo}:`, valor: p.precio_mayorista, color: DORADO }] : []),
      ]

      const precioStartY = nombreY + (nombreLines.length > 1 ? 9 : 6)
      const lineH = 5.5

      for (let i = 0; i < precios.length; i++) {
        const { label, valor, color } = precios[i]
        const py = precioStartY + i * lineH
        if (py > cy + cardH - 5) break

        const labelX = cx + 3
        const valorX = cx + cardW / 2 - 1
        const unitX = cx + cardW - 3

        // Label izquierda
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(...color)
        doc.text(label, labelX, py)

        // Precio centro
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.text(fmtPrice(valor), valorX, py, { align: 'center' })

        // Precio/ud derecha
        if (uds > 1) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(5.5)
          doc.setTextColor(...color)
          doc.text(`${fmtPrice(Math.round(valor / uds))}/ud`, unitX, py, { align: 'right' })
        }

        doc.setTextColor(30, 30, 30)
      }

      // Uds/caja bottom right
      if (uds > 1) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5.5)
        doc.setTextColor(160, 160, 160)
        doc.text(`${uds} uds/caja`, cx + cardW - 2, cy + cardH - 2, { align: 'right' })
        doc.setTextColor(30, 30, 30)
      }

      col++
      if (col >= cols) { col = 0; row++ }
    }
  }

  // ── PORTADA (insertar al inicio) ──────────────────
  doc.insertPage(1)
  doc.setFillColor(...ROJO)
  doc.rect(0, 0, W, H, 'F')

  // Franja decorativa
  doc.setFillColor(...ROJO_OSC)
  doc.rect(0, H * 0.55, W, H * 0.45, 'F')

  // Títulos
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(48)
  doc.text('Elige', W / 2, H / 2 - 18, { align: 'center' })
  doc.setTextColor(255, 220, 100)
  doc.text('Market', W / 2, H / 2 + 12, { align: 'center' })

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(16)
  doc.text('Catálogo Comercial', W / 2, H / 2 + 30, { align: 'center' })

  doc.setFontSize(10)
  doc.setTextColor(255, 200, 200)
  doc.text(new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }), W / 2, H / 2 + 42, { align: 'center' })

  const totalProds = productos.filter(p => p.activo).length
  doc.setFontSize(9)
  doc.setTextColor(255, 200, 200)
  doc.text(`${totalProds} productos · ${cats.length} categorías`, W / 2, H / 2 + 54, { align: 'center' })

  doc.setFillColor(...ROJO_OSC)
  doc.rect(0, H - 16, W, 16, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.text('Gestión Comercial · Vendedores en Ruta', W / 2, H - 6, { align: 'center' })

  const sufijo = ocultarSinStock ? '_sin_marcas' : ''
  descargarPDF(doc, `catalogo_eligemarket${sufijo}_${new Date().toISOString().split('T')[0]}.pdf`)
}
