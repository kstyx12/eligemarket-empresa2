import { descargarPDF } from './pdfDownload.js'
// src/lib/pdfGenerator.js
export async function generarPedidoPDF(venta, items, cliente, vendedor) {
  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, margin = 14

  // Header verde
  doc.setFillColor(26, 127, 75)
  doc.rect(0, 0, W, 38, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('EligeMarket', margin, 16)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Gestión Comercial · Vendedores en Ruta', margin, 23)

  // Número de pedido
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(`PEDIDO #${venta.id || '—'}`, W - margin, 16, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(new Date(venta.created_at || Date.now()).toLocaleDateString('es-CL', {
    year: 'numeric', month: 'long', day: 'numeric'
  }), W - margin, 23, { align: 'right' })

  // Info cliente y vendedor
  doc.setTextColor(30, 30, 30)
  let y = 46

  // Box cliente
  doc.setFillColor(232, 245, 238)
  doc.roundedRect(margin, y, 88, 42, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(26, 127, 75)
  doc.text('CLIENTE', margin + 4, y + 7)
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(10)
  doc.text(cliente?.nombre || '—', margin + 4, y + 14)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`RUT: ${cliente?.rut || '—'}`, margin + 4, y + 21)
  doc.text(`${cliente?.direccion || ''} ${cliente?.comuna || ''}`.trim() || '—', margin + 4, y + 27, { maxWidth: 80 })
  doc.text(`Tel: ${cliente?.telefono || '—'}`, margin + 4, y + 33)

  // Box vendedor
  doc.setFillColor(240, 240, 255)
  doc.roundedRect(margin + 92, y, 88, 42, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(40, 80, 179)
  doc.text('VENDEDOR', margin + 96, y + 7)
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(10)
  doc.text(vendedor?.nombre || vendedor?.username || '—', margin + 96, y + 14)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Usuario: ${vendedor?.username || '—'}`, margin + 96, y + 21)
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, margin + 96, y + 27)
  const plazo = venta.plazo_despacho || '48h'
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(plazo === '24h' ? 229 : 26, plazo === '24h' ? 62 : 127, plazo === '24h' ? 62 : 75)
  doc.text(`Despacho: ${plazo === '24h' ? '24 horas - EXPRESS' : '48 horas - Estandar'}`, margin + 96, y + 34)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'normal')

  y += 50

  // Tabla de items
  const tableData = items.map((item, i) => [
    i + 1,
    item.codigo || '',
    item.descripcion || '',
    item.cantidad,
    `$${Number(item.precio_unitario).toLocaleString('es-CL')}`,
    item.descuento_item > 0 ? `${item.descuento_item}%` : '—',
    `$${Number(item.subtotal).toLocaleString('es-CL')}`
  ])

  doc.autoTable({
    startY: y,
    head: [['N°', 'Código', 'Producto', 'Cant.', 'P. Unitario', 'Dto.', 'Subtotal']],
    body: tableData,
    headStyles: {
      fillColor: [26, 127, 75],
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 8.5, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 252, 250] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 20 },
      2: { cellWidth: 72 },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
    tableLineColor: [220, 230, 225],
    tableLineWidth: 0.2,
  })

  y = doc.lastAutoTable.finalY + 6

  // Totales
  const totalesX = W - margin - 70
  doc.setFillColor(248, 252, 250)
  doc.rect(totalesX, y, 70, 28, 'F')
  doc.setDrawColor(26, 127, 75)
  doc.rect(totalesX, y, 70, 28)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text('Subtotal:', totalesX + 4, y + 8)
  doc.text(`$${Number(venta.subtotal || 0).toLocaleString('es-CL')}`, W - margin - 2, y + 8, { align: 'right' })

  if (venta.descuento_global > 0) {
    doc.text(`Descuento (${venta.descuento_global}%):`, totalesX + 4, y + 15)
    doc.setTextColor(220, 50, 50)
    doc.text(`-$${Number((venta.subtotal * venta.descuento_global / 100) || 0).toLocaleString('es-CL')}`, W - margin - 2, y + 15, { align: 'right' })
    doc.setTextColor(80, 80, 80)
  }

  doc.setFillColor(26, 127, 75)
  doc.rect(totalesX, y + 20, 70, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TOTAL:', totalesX + 4, y + 26)
  doc.text(`$${Number(venta.total || 0).toLocaleString('es-CL')}`, W - margin - 2, y + 26, { align: 'right' })

  y = doc.lastAutoTable.finalY + 50

  // Sección firma
  const pageH = doc.internal.pageSize.height
  const firmaY = Math.max(y + 10, pageH - 60)

  doc.setDrawColor(26, 127, 75)
  doc.setLineWidth(0.5)
  doc.line(margin, firmaY, margin + 80, firmaY)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Firma y Timbre del Cliente', margin, firmaY + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)

  const textoCompromiso = 'Al firmar este documento, el cliente confirma haber recibido y aceptado el pedido detallado, comprometiéndose a su pago según las condiciones acordadas.'
  const lines = doc.splitTextToSize(textoCompromiso, 130)
  doc.text(lines, margin + 90, firmaY - 6)

  // Footer
  doc.setFillColor(26, 127, 75)
  doc.rect(0, pageH - 10, W, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(7)
  doc.text('EligeMarket · Gestión Comercial de Vendedores en Ruta', W / 2, pageH - 4, { align: 'center' })

  const nombreCliente = (cliente?.nombre || 'cliente').replace(/[^a-z0-9]/gi, '_')
  descargarPDF(doc, `pedido_${venta.id || 'nuevo'}_${nombreCliente}.pdf`)
}
