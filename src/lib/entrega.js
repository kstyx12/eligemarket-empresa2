// src/lib/entrega.js
// Estado de entrega de una venta y cálculo del monto REALMENTE entregado,
// para que los reportes reflejen la facturación real (no la teórica).

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

// Monto realmente entregado: entregada = total, parcial = monto_entregado,
// devuelta y pendiente = 0.
export function montoReal(v) {
  const e = estadoVenta(v)
  if (e === 'parcial') return Number(v.monto_entregado || 0)
  if (e === 'devuelta' || e === 'pendiente') return 0
  return Number(v.total || 0)
}

// Factor (0..1) para prorratear ítems/costos de una venta según lo entregado.
export function factorEntrega(v) {
  const t = Number(v.total || 0)
  if (t <= 0) return montoReal(v) > 0 ? 1 : 0
  return montoReal(v) / t
}
