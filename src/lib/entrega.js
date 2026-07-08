// src/lib/entrega.js
// Estado de entrega de una venta y cálculo del monto/costo REALMENTE entregado.
// En entregas parciales se registra cuánto se entregó de cada ítem
// (venta_items.cantidad_entregada), y de ahí se recalcula el ingreso y el margen reales.

export const ESTADOS_ENTREGA = {
  entregada: { label: 'Entregada', color: '#1a7f4b', bg: '#e8f5ee', icon: '✓' },
  parcial:   { label: 'Parcial',   color: '#b07a00', bg: '#fff8e6', icon: '◐' },
  devuelta:  { label: 'Devuelta',  color: '#c0392b', bg: '#fdecea', icon: '↩' },
  pendiente: { label: 'Pendiente', color: '#5f6d64', bg: '#eef1ef', icon: '⏳' },
}

export const ORDEN_ESTADOS = ['entregada', 'parcial', 'devuelta', 'pendiente']

// Estado efectivo (las ventas viejas sin campo se consideran entregadas)
export function estadoVenta(v) {
  return v.estado_entrega || 'entregada'
}

// Cantidad realmente entregada de un ítem según el estado de la venta.
export function cantEntregada(item, estado) {
  const cant = Number(item.cantidad || 0)
  if (estado === 'entregada' || !estado) return cant
  if (estado === 'devuelta' || estado === 'pendiente') return 0
  // parcial: usa cantidad_entregada (null = aún se considera entregado completo)
  if (item.cantidad_entregada == null) return cant
  return Math.max(0, Math.min(cant, Number(item.cantidad_entregada)))
}

// Subtotal realmente entregado de un ítem (proporcional a lo entregado).
export function subtotalEntregado(item, estado) {
  const cant = Number(item.cantidad || 0)
  if (cant <= 0) return 0
  return Number(item.subtotal || 0) * (cantEntregada(item, estado) / cant)
}

// Ingreso REAL de la venta (aplica el descuento global sobre lo entregado).
export function montoReal(v) {
  const e = estadoVenta(v)
  if (e === 'entregada' || !v.estado_entrega) return Number(v.total || 0)
  if (e === 'devuelta' || e === 'pendiente') return 0
  const items = v.venta_items || []
  // Sin ítems cargados (p.ej. Dashboard) usamos el monto cacheado.
  if (!items.length) return Number(v.monto_entregado || 0)
  const sub = items.reduce((s, i) => s + subtotalEntregado(i, e), 0)
  return sub * (1 - Number(v.descuento_global || 0) / 100)
}

// Costo REAL de lo entregado (para el margen real).
export function costoRealVenta(v) {
  const e = estadoVenta(v)
  return (v.venta_items || []).reduce((s, i) => s + Number(i.costo || 0) * cantEntregada(i, e), 0)
}

// Recalcula el ingreso real a partir de una lista de ítems (para guardar en cache).
export function montoRealDesdeItems(items, descuentoGlobal) {
  const sub = (items || []).reduce((s, i) => s + subtotalEntregado(i, 'parcial'), 0)
  return sub * (1 - Number(descuentoGlobal || 0) / 100)
}
