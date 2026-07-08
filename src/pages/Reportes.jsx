// src/pages/Reportes.jsx
import { useState, useEffect, useMemo } from 'react'
import Layout from '../components/Layout.jsx'
import { useAuth, useToast } from '../lib/context.jsx'
import { getVentas, getClientes, getUsuarios, getProductos } from '../lib/db.js'
import { getVisitas } from '../lib/visitas.js'
import { generarInsightsIA } from '../lib/ai.js'
import { montoReal, factorEntrega, estadoVenta, ESTADOS_ENTREGA, ORDEN_ESTADOS } from '../lib/entrega.js'
import {
  TrendingUp, TrendingDown, Users, ShoppingCart, Download, RefreshCw,
  Package, Link2, AlertTriangle, ArrowUpDown, ChevronRight, X,
  Sparkles, Target, Calendar, Award, Zap
} from 'lucide-react'

// ── Helpers de formato ────────────────────────────────────────────────────────
function fmt(ts) {
  return new Date(ts).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtHora(ts) {
  return new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}
function fmtMoney(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CL')
}
function fmtInt(n) {
  return Math.round(n || 0).toLocaleString('es-CL')
}
function diasDesde(ts) {
  if (!ts) return null
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
}
function mediana(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function variacionPct(actual, anterior) {
  if (anterior > 0) return Math.round(((actual - anterior) / anterior) * 100)
  return actual > 0 ? 100 : 0
}

// Segmentación RFM (Recencia, Frecuencia, Monetario)
const RFM_SEGMENTOS = {
  campeones: { label: 'Campeones', emoji: '🏆', color: '#1a7f4b', desc: 'Compran seguido, montos altos, recientes' },
  leales: { label: 'Leales', emoji: '💚', color: '#0f766e', desc: 'Recientes y constantes' },
  nuevos: { label: 'Nuevos', emoji: '🌱', color: '#2850b3', desc: 'Primera compra reciente' },
  enRiesgo: { label: 'En riesgo', emoji: '⚠️', color: '#b07a00', desc: 'Llevan 31-60 días sin comprar' },
  perdidos: { label: 'Perdidos', emoji: '😴', color: '#e53e3e', desc: 'Más de 60 días sin comprar' },
}
function segmentoRFM(c, medianaMonto) {
  const r = c.recencia ?? 9999
  if (r > 60) return 'perdidos'
  if (r > 30) return 'enRiesgo'
  if (c.pedidos <= 1) return 'nuevos'
  if (c.pedidos >= 3 && c.total >= medianaMonto) return 'campeones'
  return 'leales'
}
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Identidad y costo de un item de venta (compatible con ventas antiguas)
function itemKey(i) {
  return i.producto_id != null ? `id:${i.producto_id}` : (i.codigo ? `cod:${i.codigo}` : `desc:${i.descripcion}`)
}

// Exportar a CSV (Excel-friendly)
function exportCSV(filename, rows) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const esc = v => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [keys.join(';'), ...rows.map(r => keys.map(k => esc(r[k])).join(';'))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ── Barra horizontal simple ───────────────────────────────────────────────────
function BarChart({ data, color = 'var(--green)' }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 110, fontSize: '.8rem', textAlign: 'right', color: 'var(--text-secondary)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>
            {d.label}
          </div>
          <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 6, height: 28, overflow: 'hidden' }}>
            <div style={{
              width: `${(d.value / max) * 100}%`,
              height: '100%', background: color, borderRadius: 6,
              display: 'flex', alignItems: 'center', paddingLeft: 8,
              transition: 'width .5s ease', minWidth: d.value > 0 ? 40 : 0
            }}>
              {d.value > 0 && <span style={{ color: '#fff', fontSize: '.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{d.label2 || d.value}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Mini sparkline ────────────────────────────────────────────────────────────
function Sparkline({ values, color = '#1a7f4b' }) {
  if (!values?.length) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const W = 120, H = 36
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <polyline points={`0,${H} ${pts} ${W},${H}`} fill={color} fillOpacity="0.1" stroke="none" />
    </svg>
  )
}

// ── Tarjeta contenedora ───────────────────────────────────────────────────────
function Card({ title, right, children, style }) {
  return (
    <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 20, boxShadow: 'var(--shadow)', marginBottom: 16, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
          {title && <h3 style={{ fontWeight: 700, fontSize: '.95rem' }}>{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Tabla ordenable genérica ──────────────────────────────────────────────────
// columns: [{ key, label, align, fmt:(v,row)=>node, hide }]
function DataTable({ columns, rows, initialSort, maxRows, onRowClick }) {
  const cols = columns.filter(c => !c.hide)
  const [sortKey, setSortKey] = useState(initialSort?.key || cols[0]?.key)
  const [sortDir, setSortDir] = useState(initialSort?.dir || 'desc')

  const sorted = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc'
        ? String(av ?? '').localeCompare(String(bv ?? ''))
        : String(bv ?? '').localeCompare(String(av ?? ''))
    })
    return maxRows ? arr.slice(0, maxRows) : arr
  }, [rows, sortKey, sortDir, maxRows])

  function toggle(k) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {cols.map(c => (
              <th key={c.key} onClick={() => toggle(c.key)}
                style={{
                  padding: '8px 10px', textAlign: c.align || 'left', fontSize: '.72rem',
                  color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer',
                  whiteSpace: 'nowrap', userSelect: 'none', textTransform: 'uppercase'
                }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start' }}>
                  {c.label}
                  <ArrowUpDown size={11} style={{ opacity: sortKey === c.key ? 1 : 0.3 }} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr key={idx}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ borderTop: '1px solid var(--border)', cursor: onRowClick ? 'pointer' : 'default' }}>
              {cols.map(c => (
                <td key={c.key} style={{ padding: '8px 10px', textAlign: c.align || 'left', fontSize: '.85rem', whiteSpace: 'nowrap' }}>
                  {c.fmt ? c.fmt(row[c.key], row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={cols.length} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Sin datos en el período</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function Reportes() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const [tab, setTab] = useState('resumen')
  const [loading, setLoading] = useState(true)
  const [ventas, setVentas] = useState([])
  const [clientes, setClientes] = useState([])
  const [visitas, setVisitas] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [productos, setProductos] = useState([])
  const [clienteSel, setClienteSel] = useState(null)
  const [prodMetric, setProdMetric] = useState('unidades')
  const [insights, setInsights] = useState(null)
  const [loadingIA, setLoadingIA] = useState(false)
  const [errorIA, setErrorIA] = useState(null)

  const hoy = new Date().toISOString().split('T')[0]
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const [desde, setDesde] = useState(inicioMes)
  const [hasta, setHasta] = useState(hoy)
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [periodo, setPeriodo] = useState('mes')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [v, c, vi, u, p] = await Promise.all([
        getVentas(isAdmin ? {} : { vendedor_id: user.id }),
        getClientes(isAdmin ? {} : { vendedor_id: user.id }),
        getVisitas(isAdmin ? {} : { vendedor_id: user.id }),
        isAdmin ? getUsuarios() : Promise.resolve([user]),
        getProductos()
      ])
      setVentas(v)
      setClientes(c)
      setVisitas(vi)
      setUsuarios(u)
      setProductos(p)
    } catch (e) {
      toast('Error al cargar datos', 'error')
    }
    setLoading(false)
  }

  function setPeriodoRapido(p) {
    setPeriodo(p)
    const hoyDate = new Date()
    if (p === 'hoy') {
      setDesde(hoy); setHasta(hoy)
    } else if (p === 'semana') {
      const lunes = new Date(hoyDate)
      lunes.setDate(hoyDate.getDate() - hoyDate.getDay() + 1)
      setDesde(lunes.toISOString().split('T')[0]); setHasta(hoy)
    } else if (p === 'mes') {
      setDesde(inicioMes); setHasta(hoy)
    } else if (p === 'trimestre') {
      const d = new Date(hoyDate); d.setMonth(d.getMonth() - 3)
      setDesde(d.toISOString().split('T')[0]); setHasta(hoy)
    } else if (p === 'anio') {
      setDesde(new Date(hoyDate.getFullYear(), 0, 1).toISOString().split('T')[0]); setHasta(hoy)
    }
  }

  // Filtrar por rango y vendedor
  function filtrar(arr, campoFecha = 'created_at') {
    return arr.filter(x => {
      const fecha = (x[campoFecha] || '').split('T')[0]
      if (desde && fecha < desde) return false
      if (hasta && fecha > hasta) return false
      if (filtroVendedor && String(x.vendedor_id) !== String(filtroVendedor)) return false
      return true
    })
  }

  const ventasFilt = useMemo(() => filtrar(ventas), [ventas, desde, hasta, filtroVendedor])
  const clientesFilt = useMemo(() => filtrar(clientes), [clientes, desde, hasta, filtroVendedor])
  const visitasFilt = useMemo(() => filtrar(visitas), [visitas, desde, hasta, filtroVendedor])

  // Mapa de categorías por producto (para enriquecer items de venta)
  const catMap = useMemo(() => {
    const m = new Map()
    productos.forEach(p => {
      if (p.id != null) m.set(`id:${p.id}`, p.categoria || '—')
      if (p.codigo) m.set(`cod:${p.codigo}`, p.categoria || '—')
    })
    return m
  }, [productos])

  // ── KPIs globales ─────────────────────────────────────────────────────────
  // Facturación = monto REALMENTE entregado (entregada=total, parcial=monto, devuelta/pendiente=0)
  const totalVentas = ventasFilt.reduce((s, v) => s + montoReal(v), 0)
  const ticketPromedio = ventasFilt.length ? totalVentas / ventasFilt.length : 0

  // ══════════════════ ANÁLISIS POR CLIENTE ══════════════════
  const analisisClientes = useMemo(() => {
    const map = new Map()
    ventasFilt.forEach(v => {
      const id = v.cliente_id ?? `nombre:${v.cliente_nombre}`
      if (!map.has(id)) {
        map.set(id, {
          id, nombre: v.clientes?.nombre || v.cliente_nombre || 'Sin nombre',
          pedidos: 0, total: 0, costo: 0, unidades: 0,
          ultima: null, primera: null, productos: new Map()
        })
      }
      const c = map.get(id)
      const factor = factorEntrega(v)
      c.pedidos += 1
      c.total += montoReal(v)
      const fecha = v.created_at
      if (!c.ultima || fecha > c.ultima) c.ultima = fecha
      if (!c.primera || fecha < c.primera) c.primera = fecha
      ;(v.venta_items || []).forEach(i => {
        const cant = Number(i.cantidad || 0)
        c.unidades += cant
        c.costo += Number(i.costo || 0) * cant * factor
        const k = i.descripcion || itemKey(i)
        const prev = c.productos.get(k) || { qty: 0, total: 0 }
        prev.qty += cant; prev.total += Number(i.subtotal || 0) * factor
        c.productos.set(k, prev)
      })
    })
    return Array.from(map.values()).map(c => {
      const ticket = c.pedidos ? c.total / c.pedidos : 0
      const ganancia = c.total - c.costo
      const margenPct = c.total > 0 ? (ganancia / c.total) * 100 : 0
      const recencia = diasDesde(c.ultima)
      // Frecuencia media: días entre primera y última / (pedidos-1)
      let frecuencia = null
      if (c.pedidos >= 2 && c.primera && c.ultima) {
        const span = (new Date(c.ultima) - new Date(c.primera)) / 86400000
        frecuencia = span / (c.pedidos - 1)
      }
      const topProd = Array.from(c.productos.entries())
        .map(([desc, d]) => ({ desc, ...d }))
        .sort((a, b) => b.qty - a.qty).slice(0, 6)
      return { ...c, ticket, ganancia, margenPct, recencia, frecuencia, topProd }
    }).sort((a, b) => b.total - a.total)
  }, [ventasFilt])

  const dormidos = useMemo(
    () => analisisClientes.filter(c => c.recencia != null && c.recencia > 30).sort((a, b) => b.total - a.total),
    [analisisClientes]
  )

  // ══════════════════ ANÁLISIS POR PRODUCTO ══════════════════
  const analisisProductos = useMemo(() => {
    const map = new Map()
    ventasFilt.forEach(v => {
      const clienteId = v.cliente_id ?? v.cliente_nombre
      const factor = factorEntrega(v)
      ;(v.venta_items || []).forEach(i => {
        const k = itemKey(i)
        if (!map.has(k)) {
          map.set(k, {
            key: k, descripcion: i.descripcion || '—', codigo: i.codigo || '',
            categoria: catMap.get(k) || '—',
            unidades: 0, facturacion: 0, costo: 0,
            pedidos: new Set(), clientes: new Set()
          })
        }
        const p = map.get(k)
        const cant = Number(i.cantidad || 0)
        p.unidades += cant
        p.facturacion += Number(i.subtotal || 0) * factor
        p.costo += Number(i.costo || 0) * cant * factor
        p.pedidos.add(v.id)
        if (clienteId != null) p.clientes.add(clienteId)
      })
    })
    return Array.from(map.values()).map(p => {
      const ganancia = p.facturacion - p.costo
      const margenPct = p.facturacion > 0 ? (ganancia / p.facturacion) * 100 : 0
      return {
        ...p, ganancia, margenPct,
        pedidos: p.pedidos.size, clientes: p.clientes.size
      }
    }).sort((a, b) => b.unidades - a.unidades)
  }, [ventasFilt, catMap])

  // ══════════════════ RENTABILIDAD PONDERADA (general) ══════════════════
  // Margen ponderado = ganancia total / facturación total (pesa cada venta por su monto).
  // Es el margen REAL del período, distinto al promedio simple de márgenes por producto.
  const rentabilidad = useMemo(() => {
    let costo = 0
    ventasFilt.forEach(v => {
      const factor = factorEntrega(v)
      ;(v.venta_items || []).forEach(i => { costo += Number(i.costo || 0) * Number(i.cantidad || 0) * factor })
    })
    const ganancia = totalVentas - costo
    const margenPonderado = totalVentas > 0 ? (ganancia / totalVentas) * 100 : 0
    const margenesProd = analisisProductos.filter(p => p.facturacion > 0).map(p => p.margenPct)
    const margenSimple = margenesProd.length ? margenesProd.reduce((s, m) => s + m, 0) / margenesProd.length : 0
    return { costo, ganancia, margenPonderado, margenSimple, tieneCosto: costo > 0 }
  }, [ventasFilt, totalVentas, analisisProductos])

  // ══════════════════ DESGLOSE POR ESTADO DE ENTREGA ══════════════════
  const desgloseEntrega = useMemo(() => {
    const g = {}
    ORDEN_ESTADOS.forEach(e => { g[e] = { n: 0, monto: 0, teorico: 0 } })
    ventasFilt.forEach(v => {
      const e = estadoVenta(v)
      if (!g[e]) g[e] = { n: 0, monto: 0, teorico: 0 }
      g[e].n += 1
      g[e].monto += montoReal(v)
      g[e].teorico += Number(v.total || 0)
    })
    const teoricoTotal = ventasFilt.reduce((s, v) => s + Number(v.total || 0), 0)
    return { g, teoricoTotal, realTotal: totalVentas, perdido: teoricoTotal - totalVentas }
  }, [ventasFilt, totalVentas])

  // Por categoría
  const analisisCategorias = useMemo(() => {
    const map = new Map()
    analisisProductos.forEach(p => {
      const cat = p.categoria || '—'
      const prev = map.get(cat) || { categoria: cat, unidades: 0, facturacion: 0, ganancia: 0, skus: 0 }
      prev.unidades += p.unidades
      prev.facturacion += p.facturacion
      prev.ganancia += p.ganancia
      prev.skus += 1
      map.set(cat, prev)
    })
    return Array.from(map.values()).sort((a, b) => b.facturacion - a.facturacion)
  }, [analisisProductos])

  // Market basket: productos que se compran juntos
  const cestas = useMemo(() => {
    const pares = new Map()
    const cuentaProd = new Map()
    ventasFilt.forEach(v => {
      const items = [...new Set((v.venta_items || []).map(i => i.descripcion).filter(Boolean))].sort()
      items.forEach(it => cuentaProd.set(it, (cuentaProd.get(it) || 0) + 1))
      for (let a = 0; a < items.length; a++) {
        for (let b = a + 1; b < items.length; b++) {
          const k = `${items[a]}|||${items[b]}`
          pares.set(k, (pares.get(k) || 0) + 1)
        }
      }
    })
    return Array.from(pares.entries())
      .map(([k, n]) => {
        const [a, b] = k.split('|||')
        const minSolo = Math.min(cuentaProd.get(a) || 1, cuentaProd.get(b) || 1)
        const conf = minSolo ? Math.round((n / minSolo) * 100) : 0
        return { a, b, n, conf }
      })
      .filter(p => p.n >= 2)
      .sort((x, y) => y.n - x.n)
      .slice(0, 15)
  }, [ventasFilt])

  // ══════════════════ CRECIMIENTO vs PERÍODO ANTERIOR ══════════════════
  const rangoDias = useMemo(() => {
    if (!desde || !hasta) return 0
    return Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1
  }, [desde, hasta])

  const rangoPrevio = useMemo(() => {
    if (!desde || rangoDias <= 0) return null
    const fin = new Date(desde); fin.setDate(fin.getDate() - 1)
    const ini = new Date(fin); ini.setDate(ini.getDate() - (rangoDias - 1))
    return { desde: ini.toISOString().split('T')[0], hasta: fin.toISOString().split('T')[0] }
  }, [desde, rangoDias])

  const crecimiento = useMemo(() => {
    if (!rangoPrevio) return null
    const prev = ventas.filter(v => {
      const f = (v.created_at || '').split('T')[0]
      if (f < rangoPrevio.desde || f > rangoPrevio.hasta) return false
      if (filtroVendedor && String(v.vendedor_id) !== String(filtroVendedor)) return false
      return true
    })
    const totalPrev = prev.reduce((s, v) => s + (v.total || 0), 0)
    const ticketPrev = prev.length ? totalPrev / prev.length : 0
    const clientesPrev = new Set(prev.map(v => v.cliente_id ?? v.cliente_nombre)).size
    return {
      facturacion: { actual: totalVentas, anterior: totalPrev, pct: variacionPct(totalVentas, totalPrev) },
      ticket: { actual: ticketPromedio, anterior: ticketPrev, pct: variacionPct(ticketPromedio, ticketPrev) },
      clientes: { actual: analisisClientes.length, anterior: clientesPrev, pct: variacionPct(analisisClientes.length, clientesPrev) },
    }
  }, [ventas, rangoPrevio, filtroVendedor, totalVentas, ticketPromedio, analisisClientes.length])

  // ══════════════════ PROYECCIÓN DEL MES EN CURSO ══════════════════
  const proyeccionMes = useMemo(() => {
    const now = new Date()
    const ini = new Date(now.getFullYear(), now.getMonth(), 1)
    const iniPrevio = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const finPrevio = new Date(now.getFullYear(), now.getMonth(), 0)
    const diasMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const diaActual = now.getDate()
    const enRango = (v, a, b) => {
      const f = new Date(v.created_at)
      if (f < a || f > b) return false
      if (filtroVendedor && String(v.vendedor_id) !== String(filtroVendedor)) return false
      return true
    }
    const totalMes = ventas.filter(v => enRango(v, ini, now)).reduce((s, v) => s + (v.total || 0), 0)
    const totalMesPrev = ventas.filter(v => enRango(v, iniPrevio, finPrevio)).reduce((s, v) => s + (v.total || 0), 0)
    const proyectado = diaActual > 0 ? (totalMes / diaActual) * diasMes : 0
    return { totalMes, proyectado, mesAnterior: totalMesPrev, pct: variacionPct(proyectado, totalMesPrev), diaActual, diasMes }
  }, [ventas, filtroVendedor])

  // ══════════════════ VENTAS POR DÍA DE LA SEMANA ══════════════════
  const ventasPorDiaSemana = useMemo(() => {
    const acc = [0, 0, 0, 0, 0, 0, 0]
    ventasFilt.forEach(v => { acc[new Date(v.created_at).getDay()] += v.total || 0 })
    // Orden Lun→Dom para mostrar
    const orden = [1, 2, 3, 4, 5, 6, 0]
    return orden.map(d => ({ label: DIAS_SEMANA[d], value: acc[d], label2: fmtMoney(acc[d]) }))
  }, [ventasFilt])

  // ══════════════════ SEGMENTACIÓN RFM ══════════════════
  const rfm = useMemo(() => {
    const medMonto = mediana(analisisClientes.map(c => c.total))
    const grupos = { campeones: [], leales: [], nuevos: [], enRiesgo: [], perdidos: [] }
    analisisClientes.forEach(c => { grupos[segmentoRFM(c, medMonto)].push(c) })
    return grupos
  }, [analisisClientes])

  // ══════════════════ CONCENTRACIÓN (PARETO 80/20) ══════════════════
  const pareto = useMemo(() => {
    const ordenados = [...analisisClientes].sort((a, b) => b.total - a.total)
    const total = ordenados.reduce((s, c) => s + c.total, 0)
    if (total === 0) return null
    let acum = 0, n = 0
    for (const c of ordenados) { acum += c.total; n++; if (acum >= 0.8 * total) break }
    return { n, totalClientes: ordenados.length, pctClientes: ordenados.length ? Math.round((n / ordenados.length) * 100) : 0 }
  }, [analisisClientes])

  // ══════════════════ PRODUCTOS ESTANCADOS ══════════════════
  // Se vendían antes del período pero NO se vendieron dentro del período
  const productosEstancados = useMemo(() => {
    const antes = new Map()
    ventas.forEach(v => {
      const f = (v.created_at || '').split('T')[0]
      if (desde && f >= desde) return
      if (filtroVendedor && String(v.vendedor_id) !== String(filtroVendedor)) return
      ;(v.venta_items || []).forEach(i => {
        const k = itemKey(i)
        const prev = antes.get(k) || { descripcion: i.descripcion || '—', ultima: '', qty: 0 }
        if (v.created_at > prev.ultima) prev.ultima = v.created_at
        prev.qty += Number(i.cantidad || 0)
        antes.set(k, prev)
      })
    })
    const vendidos = new Set(analisisProductos.map(p => p.key))
    return Array.from(antes.entries())
      .filter(([k]) => !vendidos.has(k))
      .map(([, v]) => ({ ...v, recencia: diasDesde(v.ultima) }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 12)
  }, [ventas, desde, filtroVendedor, analisisProductos])

  // ── Generar diagnóstico con IA ─────────────────────────────────────────────
  async function generarIA() {
    setLoadingIA(true)
    setErrorIA(null)
    try {
      const medMonto = mediana(analisisClientes.map(c => c.total))
      const payload = {
        periodo: { desde, hasta, dias: rangoDias },
        kpis: {
          facturacion: Math.round(totalVentas),
          pedidos: ventasFilt.length,
          ticket_promedio: Math.round(ticketPromedio),
          clientes_que_compraron: analisisClientes.length,
          ...(isAdmin && rentabilidad.tieneCosto ? {
            costo_total: Math.round(rentabilidad.costo),
            ganancia_total: Math.round(rentabilidad.ganancia),
            margen_ponderado_pct: Math.round(rentabilidad.margenPonderado * 10) / 10,
          } : {}),
        },
        crecimiento_vs_periodo_anterior: crecimiento ? {
          facturacion_pct: crecimiento.facturacion.pct,
          ticket_pct: crecimiento.ticket.pct,
          clientes_pct: crecimiento.clientes.pct,
        } : null,
        proyeccion_mes: {
          va_actual: Math.round(proyeccionMes.totalMes),
          proyectado_fin_mes: Math.round(proyeccionMes.proyectado),
          mes_anterior: Math.round(proyeccionMes.mesAnterior),
          variacion_pct: proyeccionMes.pct,
        },
        segmentacion_rfm: Object.fromEntries(Object.entries(rfm).map(([k, v]) => [k, v.length])),
        clientes_en_riesgo: rfm.enRiesgo.slice(0, 8).map(c => ({ nombre: c.nombre, dias_sin_comprar: c.recencia, total_historico: Math.round(c.total) })),
        concentracion_pareto: pareto ? { clientes_que_generan_80pct: pareto.n, total_clientes: pareto.totalClientes } : null,
        top_clientes: analisisClientes.slice(0, 10).map(c => ({
          nombre: c.nombre, total: Math.round(c.total), pedidos: c.pedidos,
          ticket: Math.round(c.ticket), dias_sin_comprar: c.recencia,
          ...(isAdmin ? { ganancia: Math.round(c.ganancia), margen_pct: Math.round(c.margenPct) } : {}),
        })),
        top_productos: analisisProductos.slice(0, 10).map(p => ({
          producto: p.descripcion, categoria: p.categoria, unidades: p.unidades,
          facturacion: Math.round(p.facturacion), clientes: p.clientes,
          ...(isAdmin ? { ganancia: Math.round(p.ganancia), margen_pct: Math.round(p.margenPct) } : {}),
        })),
        productos_que_se_compran_juntos: cestas.slice(0, 8).map(c => ({ a: c.a, b: c.b, pedidos_juntos: c.n })),
        productos_estancados: productosEstancados.slice(0, 8).map(p => ({ producto: p.descripcion, dias_sin_vender: p.recencia })),
        ventas_por_dia_semana: Object.fromEntries(ventasPorDiaSemana.map(d => [d.label, Math.round(d.value)])),
      }
      const res = await generarInsightsIA(payload)
      setInsights(res)
    } catch (e) {
      setErrorIA(e.message || 'Error al generar el análisis')
    }
    setLoadingIA(false)
  }

  // ── Datos del tab Resumen (vendedores / visitas / tendencia) ───────────────
  const ventasPorVendedor = usuarios.map(u => {
    const vs = ventasFilt.filter(v => v.vendedor_id === u.id)
    const tot = vs.reduce((s, v) => s + (v.total || 0), 0)
    return { label: u.nombre, value: tot, label2: fmtMoney(tot), pedidos: vs.length }
  }).sort((a, b) => b.value - a.value)

  const visitasPorVendedor = usuarios.map(u => ({
    label: u.nombre,
    value: visitasFilt.filter(v => v.vendedor_id === u.id).length,
  })).sort((a, b) => b.value - a.value)

  const clientesPorVendedor = usuarios.map(u => ({
    label: u.nombre,
    value: clientesFilt.filter(c => c.vendedor_id === u.id).length,
  })).sort((a, b) => b.value - a.value)

  const ultimos14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i))
    return d.toISOString().split('T')[0]
  })
  const ventasPorDia = ultimos14.map(dia => ({
    dia,
    total: ventas.filter(v => v.created_at?.startsWith(dia) && (!filtroVendedor || String(v.vendedor_id) === String(filtroVendedor)))
      .reduce((s, v) => s + (v.total || 0), 0)
  }))

  const resumenHoy = usuarios.map(u => {
    const vHoy = ventas.filter(v => v.created_at?.startsWith(hoy) && v.vendedor_id === u.id)
    const viHoy = visitas.filter(v => v.created_at?.startsWith(hoy) && v.vendedor_id === u.id)
    const cHoy = clientes.filter(c => c.created_at?.startsWith(hoy) && c.vendedor_id === u.id)
    return {
      ...u,
      pedidos: vHoy.length,
      facturacion: vHoy.reduce((s, v) => s + (v.total || 0), 0),
      visitas: viHoy.length,
      clientesNuevos: cHoy.length,
      ultimaActividad: [...vHoy, ...viHoy].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.created_at || null
    }
  })

  const topProductos = analisisProductos.slice(0, 8).map(p => ({
    label: p.descripcion, value: p.unidades, label2: `${fmtInt(p.unidades)} uds`
  }))

  const tipoVisitas = [
    { tipo: 'pedido', label: 'Con pedido', color: '#1a7f4b' },
    { tipo: 'visita', label: 'Visita', color: '#2850b3' },
    { tipo: 'sin_venta', label: 'Sin venta', color: '#e53e3e' },
  ].map(t => ({ ...t, count: visitasFilt.filter(v => v.tipo === t.tipo).length }))

  // ── Exportaciones ──────────────────────────────────────────────────────────
  function exportarResumen() {
    exportCSV(`resumen_${hoy}.csv`, resumenHoy.map(u => ({
      vendedor: u.nombre, pedidos_hoy: u.pedidos, facturacion_hoy: u.facturacion,
      visitas_hoy: u.visitas, clientes_nuevos_hoy: u.clientesNuevos,
      ultima_actividad: u.ultimaActividad ? fmt(u.ultimaActividad) : '—'
    })))
  }
  function exportarClientes() {
    exportCSV(`clientes_${desde}_a_${hasta}.csv`, analisisClientes.map(c => ({
      cliente: c.nombre, pedidos: c.pedidos, total_comprado: Math.round(c.total),
      ticket_promedio: Math.round(c.ticket), unidades: c.unidades,
      ...(isAdmin ? { ganancia: Math.round(c.ganancia), margen_pct: c.margenPct.toFixed(1) } : {}),
      ultima_compra: c.ultima ? fmt(c.ultima) : '—',
      dias_sin_comprar: c.recencia ?? '—',
      frecuencia_dias: c.frecuencia != null ? Math.round(c.frecuencia) : '—'
    })))
  }
  function exportarProductos() {
    exportCSV(`productos_${desde}_a_${hasta}.csv`, analisisProductos.map(p => ({
      codigo: p.codigo, producto: p.descripcion, categoria: p.categoria,
      unidades: p.unidades, facturacion: Math.round(p.facturacion),
      ...(isAdmin ? { ganancia: Math.round(p.ganancia), margen_pct: p.margenPct.toFixed(1) } : {}),
      pedidos: p.pedidos, clientes: p.clientes
    })))
  }

  const TABS = [
    { key: 'resumen', label: 'Resumen', icon: TrendingUp },
    { key: 'clientes', label: 'Clientes', icon: Users },
    { key: 'productos', label: 'Productos', icon: Package },
    ...(isAdmin ? [{ key: 'ia', label: 'Análisis IA', icon: Sparkles }] : []),
  ]

  return (
    <Layout title="Reportes y Análisis">
      {/* Pestañas */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: 'var(--white)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '12px', textAlign: 'center', fontWeight: 700, fontSize: '.9rem',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: tab === key ? 'var(--green)' : 'var(--white)',
              color: tab === key ? '#fff' : 'var(--text-secondary)',
              transition: 'all .2s'
            }}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Filtros (compartidos) */}
      <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16, boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'hoy', label: 'Hoy' },
              { key: 'semana', label: 'Semana' },
              { key: 'mes', label: 'Mes' },
              { key: 'trimestre', label: 'Trimestre' },
              { key: 'anio', label: 'Año' },
            ].map(p => (
              <button key={p.key} className={`btn btn-sm ${periodo === p.key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPeriodoRapido(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Desde</label>
            <input className="form-control" type="date" value={desde} onChange={e => { setDesde(e.target.value); setPeriodo('custom') }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Hasta</label>
            <input className="form-control" type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPeriodo('custom') }} />
          </div>
          {isAdmin && (
            <div className="form-group" style={{ margin: 0, minWidth: 150 }}>
              <label>Vendedor</label>
              <select className="form-control" value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
                <option value="">Todos</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><p>Cargando reportes...</p></div>
      ) : (
        <>
          {/* KPIs comunes */}
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            {[
              { label: 'Facturación', value: fmtMoney(totalVentas), icon: TrendingUp, color: '#1a7f4b', bg: '#e8f5ee', sub: `${ventasFilt.length} pedidos` },
              { label: 'Ticket Promedio', value: fmtMoney(ticketPromedio), icon: ShoppingCart, color: '#2850b3', bg: '#e8f0ff', sub: `${ventasFilt.length} ventas` },
              { label: 'Clientes que compraron', value: analisisClientes.length, icon: Users, color: '#0f766e', bg: '#e6f7f5', sub: `${dormidos.length} sin comprar +30d` },
              { label: 'Productos vendidos', value: analisisProductos.length, icon: Package, color: '#b07a00', bg: '#fff8e6', sub: `${fmtInt(analisisProductos.reduce((s, p) => s + p.unidades, 0))} uds` },
            ].map(({ label, value, icon: Icon, color, bg, sub }) => (
              <div key={label} className="stat-card">
                <div className="stat-icon" style={{ background: bg }}><Icon size={20} color={color} /></div>
                <div>
                  <div className="stat-value" style={{ fontSize: '1.4rem' }}>{value}</div>
                  <div className="stat-label">{label}</div>
                  <div className="text-xs text-muted">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ═══════════════ TAB RESUMEN ═══════════════ */}
          {tab === 'resumen' && (
            <>
              {/* Desglose por estado de entrega */}
              <Card title="🚚 Entregas del período">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                  {ORDEN_ESTADOS.map(e => {
                    const cfg = ESTADOS_ENTREGA[e]
                    const d = desgloseEntrega.g[e] || { n: 0, monto: 0 }
                    return (
                      <div key={e} style={{ background: cfg.bg, borderRadius: 8, padding: 12, borderLeft: `4px solid ${cfg.color}` }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '.03em' }}>{cfg.icon} {cfg.label}</div>
                        <div style={{ fontWeight: 800, fontSize: '1.1rem', marginTop: 4 }}>{fmtMoney(d.monto)}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)' }}>{d.n} venta{d.n === 1 ? '' : 's'}</div>
                      </div>
                    )
                  })}
                </div>
                <div className="text-sm" style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span className="text-muted">Facturación real: <strong style={{ color: 'var(--green)' }}>{fmtMoney(desgloseEntrega.realTotal)}</strong> de {fmtMoney(desgloseEntrega.teoricoTotal)} en pedidos</span>
                  {desgloseEntrega.perdido > 0 && (
                    <span style={{ color: '#c0392b', fontWeight: 700 }}>No entregado/devuelto: −{fmtMoney(desgloseEntrega.perdido)}</span>
                  )}
                </div>
              </Card>

              {/* Crecimiento vs período anterior + Proyección del mes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
                {crecimiento && (
                  <Card title="📊 Crecimiento vs período anterior" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {[
                        { label: 'Facturación', d: crecimiento.facturacion, money: true },
                        { label: 'Ticket prom.', d: crecimiento.ticket, money: true },
                        { label: 'Clientes', d: crecimiento.clientes, money: false },
                      ].map(({ label, d, money }) => {
                        const up = d.pct >= 0
                        return (
                          <div key={label} style={{ textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '12px 6px' }}>
                            <div style={{ fontWeight: 800, fontSize: '1rem' }}>{money ? fmtMoney(d.actual) : d.actual}</div>
                            <div style={{ fontSize: '.66rem', color: 'var(--text-secondary)', margin: '2px 0 6px' }}>{label}</div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '.8rem', fontWeight: 700, color: up ? 'var(--green)' : '#e53e3e' }}>
                              {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{up ? '+' : ''}{d.pct}%
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="text-xs text-muted" style={{ marginTop: 8, textAlign: 'center' }}>
                      vs {rangoPrevio && `${fmt(rangoPrevio.desde)} – ${fmt(rangoPrevio.hasta)}`}
                    </div>
                  </Card>
                )}
                <Card title="🎯 Proyección del mes" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--green)' }}>{fmtMoney(proyeccionMes.proyectado)}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '.85rem', fontWeight: 700, color: proyeccionMes.pct >= 0 ? 'var(--green)' : '#e53e3e' }}>
                      {proyeccionMes.pct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{proyeccionMes.pct >= 0 ? '+' : ''}{proyeccionMes.pct}% vs mes pasado
                    </div>
                  </div>
                  <div className="text-sm text-muted" style={{ marginTop: 6 }}>
                    Llevas <strong>{fmtMoney(proyeccionMes.totalMes)}</strong> en {proyeccionMes.diaActual} de {proyeccionMes.diasMes} días · mes pasado: {fmtMoney(proyeccionMes.mesAnterior)}
                  </div>
                </Card>
              </div>

              {/* Rentabilidad ponderada — solo admin */}
              {isAdmin && rentabilidad.tieneCosto && (
                <Card title="💰 Rentabilidad General (ponderada)">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                    {[
                      { label: 'Facturación', value: fmtMoney(totalVentas), color: 'var(--text)' },
                      { label: 'Costo total', value: fmtMoney(rentabilidad.costo), color: 'var(--text-secondary)' },
                      { label: 'Ganancia total', value: fmtMoney(rentabilidad.ganancia), color: 'var(--green)' },
                      { label: 'Margen ponderado', value: `${rentabilidad.margenPonderado.toFixed(1)}%`, color: rentabilidad.margenPonderado > 30 ? 'var(--green)' : rentabilidad.margenPonderado > 15 ? '#b07a00' : '#e53e3e', big: true },
                    ].map(({ label, value, color, big }) => (
                      <div key={label} style={{ textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '14px 6px' }}>
                        <div style={{ fontWeight: 800, fontSize: big ? '1.6rem' : '1.1rem', color }}>{value}</div>
                        <div style={{ fontSize: '.68rem', color: 'var(--text-secondary)', marginTop: 3 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
                    El <strong>margen ponderado</strong> es el margen real del período (ganancia ÷ facturación): pesa cada venta por su monto.
                    El promedio simple de márgenes por producto sería {rentabilidad.margenSimple.toFixed(1)}% — útil de comparar, pero menos fiel a la realidad.
                  </div>
                </Card>
              )}

              <Card title="📈 Tendencia últimos 14 días" right={<Sparkline values={ventasPorDia.map(d => d.total)} />}>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 80 }}>
                  {ventasPorDia.map((d, i) => {
                    const max = Math.max(...ventasPorDia.map(x => x.total), 1)
                    const h = Math.max((d.total / max) * 72, d.total > 0 ? 4 : 2)
                    const esHoy = d.dia === hoy
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${d.dia}: ${fmtMoney(d.total)}`}>
                        <div style={{
                          width: '100%', height: h,
                          background: esHoy ? 'var(--accent)' : d.total > 0 ? 'var(--green)' : 'var(--border)',
                          borderRadius: '3px 3px 0 0', transition: 'height .3s'
                        }} />
                        {i % 3 === 0 && (
                          <div style={{ fontSize: '.6rem', color: 'var(--text-secondary)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                            {new Date(d.dia + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
                <Card title="💰 Ventas por Vendedor">
                  {ventasPorVendedor.length > 0 ? <BarChart data={ventasPorVendedor} color="var(--green)" /> : <p className="text-muted text-sm">Sin datos</p>}
                </Card>
                <Card title="📍 Visitas por Vendedor">
                  {visitasPorVendedor.some(v => v.value > 0) ? <BarChart data={visitasPorVendedor} color="#2850b3" /> : <p className="text-muted text-sm">Sin datos</p>}
                </Card>
                <Card title="👥 Clientes Nuevos por Vendedor">
                  {clientesPorVendedor.some(c => c.value > 0) ? <BarChart data={clientesPorVendedor} color="#0f766e" /> : <p className="text-muted text-sm">Sin clientes nuevos en el período</p>}
                </Card>
                <Card title="📊 Resultado de Visitas">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {tipoVisitas.map(t => {
                      const total = visitasFilt.length || 1
                      const pct = Math.round((t.count / total) * 100)
                      return (
                        <div key={t.tipo}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span className="text-sm" style={{ fontWeight: 600 }}>{t.label}</span>
                            <span className="text-sm">{t.count} ({pct}%)</span>
                          </div>
                          <div style={{ background: 'var(--bg)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: t.color, borderRadius: 6, transition: 'width .5s' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>

                <Card title="📅 Ventas por Día de la Semana">
                  {ventasPorDiaSemana.some(d => d.value > 0)
                    ? <BarChart data={ventasPorDiaSemana} color="#7c3aed" />
                    : <p className="text-muted text-sm">Sin datos</p>}
                </Card>
              </div>

              {topProductos.length > 0 && (
                <Card title="🏆 Top Productos Vendidos">
                  <BarChart data={topProductos} color="var(--accent)" />
                </Card>
              )}

              <Card
                title={`📅 Resumen de Hoy — ${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}`}
                right={isAdmin && <button className="btn btn-secondary btn-sm" onClick={exportarResumen}><Download size={14} /> Exportar</button>}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                  {resumenHoy.map(u => (
                    <div key={u.id} style={{
                      border: '1.5px solid var(--border)', borderRadius: 10, padding: '14px 16px',
                      borderLeft: `4px solid ${u.pedidos > 0 ? 'var(--green)' : u.visitas > 0 ? '#2850b3' : 'var(--border)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{u.nombre}</div>
                          <div className="text-xs text-muted">@{u.username}</div>
                        </div>
                        {u.ultimaActividad ? (
                          <div style={{ textAlign: 'right' }}>
                            <div className="text-xs text-muted">Última actividad</div>
                            <div className="text-xs" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmtHora(u.ultimaActividad)}</div>
                          </div>
                        ) : <span className="badge badge-gray">Sin actividad</span>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        {[
                          { label: 'Pedidos', value: u.pedidos, color: 'var(--green)' },
                          { label: 'Facturación', value: fmtMoney(u.facturacion), color: 'var(--green)', small: true },
                          { label: 'Visitas', value: u.visitas, color: '#2850b3' },
                          { label: 'C. Nuevos', value: u.clientesNuevos, color: '#0f766e' },
                        ].map(({ label, value, color, small }) => (
                          <div key={label} style={{ textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '8px 4px' }}>
                            <div style={{ fontWeight: 800, fontSize: small ? '.8rem' : '1.2rem', color }}>{value}</div>
                            <div style={{ fontSize: '.65rem', color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* ═══════════════ TAB CLIENTES ═══════════════ */}
          {tab === 'clientes' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
                <Card title="🥇 Top Clientes por Facturación">
                  {analisisClientes.length > 0 ? (
                    <BarChart data={analisisClientes.slice(0, 8).map(c => ({ label: c.nombre, value: c.total, label2: fmtMoney(c.total) }))} color="var(--green)" />
                  ) : <p className="text-muted text-sm">Sin compras en el período</p>}
                </Card>
                <Card title="😴 Clientes Dormidos (sin comprar +30 días)">
                  {dormidos.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {dormidos.slice(0, 8).map(c => (
                        <div key={c.id} onClick={() => setClienteSel(c)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, cursor: 'pointer', borderLeft: '3px solid #e53e3e' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{c.nombre}</div>
                            <div className="text-xs text-muted">Última: {fmt(c.ultima)} · {fmtMoney(c.total)} histórico</div>
                          </div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#e53e3e', fontWeight: 700, fontSize: '.85rem' }}>
                            <AlertTriangle size={13} /> {c.recencia}d
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-muted text-sm">Todos los clientes han comprado recientemente 🎉</p>}
                </Card>
              </div>

              {/* Segmentación RFM + Concentración Pareto */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
                <Card title="🎯 Segmentación de Clientes (RFM)" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
                    {Object.entries(RFM_SEGMENTOS).map(([key, seg]) => (
                      <div key={key} title={seg.desc}
                        style={{ textAlign: 'center', borderRadius: 10, padding: '12px 6px', background: 'var(--bg)', borderTop: `3px solid ${seg.color}` }}>
                        <div style={{ fontSize: '1.3rem' }}>{seg.emoji}</div>
                        <div style={{ fontWeight: 800, fontSize: '1.4rem', color: seg.color }}>{rfm[key].length}</div>
                        <div style={{ fontSize: '.72rem', fontWeight: 600 }}>{seg.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-muted" style={{ marginTop: 10 }}>
                    Pasa el mouse sobre cada grupo para ver su definición. Prioriza recuperar <strong style={{ color: '#b07a00' }}>En riesgo</strong> y cuidar a los <strong style={{ color: '#1a7f4b' }}>Campeones</strong>.
                  </div>
                </Card>
                <Card title="🧲 Concentración de ventas" style={{ marginBottom: 0 }}>
                  {pareto ? (
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                      <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--green)' }}>{pareto.pctClientes}%</div>
                      <div className="text-sm" style={{ fontWeight: 600 }}>de tus clientes</div>
                      <div className="text-sm text-muted" style={{ marginTop: 6 }}>
                        generan el <strong>80%</strong> de la facturación
                      </div>
                      <div className="text-xs text-muted" style={{ marginTop: 8 }}>
                        ({pareto.n} de {pareto.totalClientes} clientes)
                      </div>
                    </div>
                  ) : <p className="text-muted text-sm">Sin datos</p>}
                </Card>
              </div>

              {/* Detalle de cliente seleccionado */}
              {clienteSel && (
                <Card
                  title={`👤 ${clienteSel.nombre}`}
                  right={<button className="btn btn-ghost btn-sm" onClick={() => setClienteSel(null)}><X size={14} /> Cerrar</button>}
                  style={{ borderLeft: '4px solid var(--green)' }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                    {[
                      { label: 'Total comprado', value: fmtMoney(clienteSel.total) },
                      { label: 'Pedidos', value: clienteSel.pedidos },
                      { label: 'Ticket promedio', value: fmtMoney(clienteSel.ticket) },
                      { label: 'Última compra', value: clienteSel.ultima ? fmt(clienteSel.ultima) : '—' },
                      { label: 'Días sin comprar', value: clienteSel.recencia != null ? `${clienteSel.recencia}d` : '—' },
                      { label: 'Compra cada', value: clienteSel.frecuencia != null ? `${Math.round(clienteSel.frecuencia)}d` : '—' },
                      ...(isAdmin ? [{ label: 'Ganancia', value: fmtMoney(clienteSel.ganancia) }, { label: 'Margen', value: `${clienteSel.margenPct.toFixed(0)}%` }] : []),
                    ].map(({ label, value }) => (
                      <div key={label} style={{ textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '10px 6px' }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--green)' }}>{value}</div>
                        <div style={{ fontSize: '.66rem', color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: 8 }}>Qué compra (top productos)</div>
                  <BarChart data={clienteSel.topProd.map(p => ({ label: p.desc, value: p.qty, label2: `${fmtInt(p.qty)} uds · ${fmtMoney(p.total)}` }))} color="#2850b3" />
                </Card>
              )}

              {/* Tabla completa */}
              <Card
                title={`📋 Detalle por Cliente (${analisisClientes.length})`}
                right={isAdmin && <button className="btn btn-secondary btn-sm" onClick={exportarClientes}><Download size={14} /> CSV</button>}
                style={{ padding: 0 }}
              >
                <div style={{ padding: '0 4px 4px' }}>
                  <DataTable
                    onRowClick={c => setClienteSel(c)}
                    initialSort={{ key: 'total', dir: 'desc' }}
                    columns={[
                      { key: 'nombre', label: 'Cliente', fmt: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
                      { key: 'pedidos', label: 'Pedidos', align: 'right' },
                      { key: 'total', label: 'Total', align: 'right', fmt: v => <strong>{fmtMoney(v)}</strong> },
                      { key: 'ticket', label: 'Ticket Prom.', align: 'right', fmt: v => fmtMoney(v) },
                      { key: 'unidades', label: 'Unidades', align: 'right', fmt: v => fmtInt(v) },
                      { key: 'ganancia', label: 'Ganancia', align: 'right', hide: !isAdmin, fmt: v => <span style={{ color: 'var(--green)' }}>{fmtMoney(v)}</span> },
                      { key: 'margenPct', label: 'Margen', align: 'right', hide: !isAdmin, fmt: v => `${v.toFixed(0)}%` },
                      { key: 'recencia', label: 'Días s/comprar', align: 'right', fmt: v => v == null ? '—' : <span style={{ color: v > 30 ? '#e53e3e' : 'var(--text)' }}>{v}d</span> },
                      { key: 'frecuencia', label: 'Compra cada', align: 'right', fmt: v => v == null ? '—' : `${Math.round(v)}d` },
                      { key: 'detalle', label: '', align: 'center', fmt: () => <ChevronRight size={14} style={{ opacity: .5 }} /> },
                    ]}
                    rows={analisisClientes}
                  />
                </div>
              </Card>
            </>
          )}

          {/* ═══════════════ TAB PRODUCTOS ═══════════════ */}
          {tab === 'productos' && (
            <>
              <Card
                title="📊 Ranking de Productos"
                right={
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { k: 'unidades', label: 'Unidades' },
                      { k: 'facturacion', label: 'Facturación' },
                      ...(isAdmin ? [{ k: 'ganancia', label: 'Ganancia' }] : []),
                    ].map(m => (
                      <button key={m.k} className={`btn btn-sm ${prodMetric === m.k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setProdMetric(m.k)}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                }
              >
                {analisisProductos.length > 0 ? (
                  <BarChart
                    data={[...analisisProductos]
                      .sort((a, b) => b[prodMetric] - a[prodMetric])
                      .slice(0, 10)
                      .map(p => ({
                        label: p.descripcion,
                        value: p[prodMetric],
                        label2: prodMetric === 'unidades' ? `${fmtInt(p.unidades)} uds` : fmtMoney(p[prodMetric])
                      }))}
                    color={prodMetric === 'ganancia' ? '#b07a00' : prodMetric === 'facturacion' ? '#2850b3' : 'var(--green)'}
                  />
                ) : <p className="text-muted text-sm">Sin ventas en el período</p>}
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
                <Card title="🛒 Se compran juntos (mismo pedido)">
                  {cestas.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {cestas.map((p, i) => (
                        <div key={i} style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem', fontWeight: 600 }}>
                            <span>{p.a}</span>
                            <Link2 size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                            <span>{p.b}</span>
                          </div>
                          <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                            Juntos en <strong>{p.n}</strong> pedidos · {p.conf}% de coincidencia
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-muted text-sm">Aún no hay suficientes pedidos para detectar combinaciones</p>}
                </Card>

                <Card title="🗂️ Ventas por Categoría">
                  {analisisCategorias.length > 0 ? (
                    <BarChart data={analisisCategorias.slice(0, 10).map(c => ({ label: c.categoria, value: c.facturacion, label2: fmtMoney(c.facturacion) }))} color="#0f766e" />
                  ) : <p className="text-muted text-sm">Sin datos</p>}
                </Card>
              </div>

              {/* Productos estancados */}
              {productosEstancados.length > 0 && (
                <Card title="🥶 Productos Estancados (se vendían antes, no en este período)">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                    {productosEstancados.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, borderLeft: '3px solid #2850b3' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion}</div>
                          <div className="text-xs text-muted">Última venta: {p.ultima ? fmt(p.ultima) : '—'}</div>
                        </div>
                        {p.recencia != null && (
                          <span style={{ flexShrink: 0, color: '#2850b3', fontWeight: 700, fontSize: '.8rem' }}>{p.recencia}d</span>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Tabla completa */}
              <Card
                title={`📦 Detalle por Producto (${analisisProductos.length})`}
                right={isAdmin && <button className="btn btn-secondary btn-sm" onClick={exportarProductos}><Download size={14} /> CSV</button>}
                style={{ padding: 0 }}
              >
                <div style={{ padding: '0 4px 4px' }}>
                  <DataTable
                    initialSort={{ key: 'unidades', dir: 'desc' }}
                    columns={[
                      { key: 'descripcion', label: 'Producto', fmt: (v, r) => <div><div style={{ fontWeight: 600 }}>{v}</div><div className="text-xs text-muted">{r.codigo} · {r.categoria}</div></div> },
                      { key: 'unidades', label: 'Unidades', align: 'right', fmt: v => <strong>{fmtInt(v)}</strong> },
                      { key: 'facturacion', label: 'Facturación', align: 'right', fmt: v => fmtMoney(v) },
                      { key: 'ganancia', label: 'Ganancia', align: 'right', hide: !isAdmin, fmt: v => <span style={{ color: 'var(--green)' }}>{fmtMoney(v)}</span> },
                      { key: 'margenPct', label: 'Margen', align: 'right', hide: !isAdmin, fmt: v => <span style={{ color: v > 30 ? 'var(--green)' : v > 15 ? '#b07a00' : '#e53e3e', fontWeight: 600 }}>{v.toFixed(0)}%</span> },
                      { key: 'pedidos', label: 'Pedidos', align: 'right' },
                      { key: 'clientes', label: 'Clientes', align: 'right' },
                    ]}
                    rows={analisisProductos}
                  />
                </div>
              </Card>
            </>
          )}

          {/* ═══════════════ TAB ANÁLISIS IA ═══════════════ */}
          {tab === 'ia' && isAdmin && (
            <>
              <Card style={{ borderLeft: '4px solid #7c3aed' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ background: '#f3e8ff', borderRadius: 12, padding: 10 }}><Sparkles size={24} color="#7c3aed" /></div>
                    <div>
                      <h3 style={{ fontWeight: 700, fontSize: '1rem' }}>Diagnóstico inteligente</h3>
                      <p className="text-sm text-muted" style={{ maxWidth: 460 }}>
                        La IA lee todas las estadísticas del período seleccionado ({fmt(desde)} – {fmt(hasta)}) y te da un análisis con alertas, oportunidades y acciones concretas.
                      </p>
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={generarIA} disabled={loadingIA} style={{ gap: 8 }}>
                    {loadingIA ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Analizando...</> : <><Zap size={16} /> {insights ? 'Volver a analizar' : 'Generar diagnóstico'}</>}
                  </button>
                </div>
              </Card>

              {errorIA && (
                <Card style={{ borderLeft: '4px solid #e53e3e' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <AlertTriangle size={20} color="#e53e3e" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontWeight: 700, color: '#e53e3e' }}>No se pudo generar el análisis</div>
                      <div className="text-sm text-muted" style={{ marginTop: 4 }}>{errorIA}</div>
                      <div className="text-xs text-muted" style={{ marginTop: 8 }}>
                        Verifica que la función <code>generar-insights</code> esté desplegada en Supabase y que la API key esté configurada.
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {loadingIA && !insights && (
                <div className="empty-state"><p>La IA está analizando tus datos... (puede tomar unos segundos)</p></div>
              )}

              {insights && (
                <>
                  <Card style={{ background: 'linear-gradient(135deg, #faf5ff, #f0f9ff)' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: 8, lineHeight: 1.35 }}>{insights.titular}</div>
                    <p className="text-sm" style={{ lineHeight: 1.6, color: 'var(--text-secondary)' }}>{insights.resumen}</p>
                  </Card>

                  {Array.isArray(insights.hallazgos) && insights.hallazgos.length > 0 && (
                    <Card title="🔍 Hallazgos">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {insights.hallazgos.map((h, i) => {
                          const estilo = {
                            alerta: { color: '#e53e3e', bg: '#fef2f2', Icon: AlertTriangle },
                            oportunidad: { color: '#7c3aed', bg: '#f5f3ff', Icon: Target },
                            positivo: { color: '#1a7f4b', bg: '#e8f5ee', Icon: Award },
                            info: { color: '#2850b3', bg: '#eff6ff', Icon: Sparkles },
                          }[h.tipo] || { color: '#2850b3', bg: '#eff6ff', Icon: Sparkles }
                          const { Icon } = estilo
                          return (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: estilo.bg, borderRadius: 10, borderLeft: `3px solid ${estilo.color}` }}>
                              <Icon size={18} color={estilo.color} style={{ flexShrink: 0, marginTop: 2 }} />
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '.9rem', color: estilo.color }}>{h.titulo}</div>
                                <div className="text-sm" style={{ marginTop: 2, lineHeight: 1.5 }}>{h.detalle}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  )}

                  {Array.isArray(insights.acciones) && insights.acciones.length > 0 && (
                    <Card title="✅ Acciones recomendadas para esta semana">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {insights.acciones.map((a, i) => (
                          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 4px' }}>
                            <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 800 }}>{i + 1}</div>
                            <div className="text-sm" style={{ lineHeight: 1.5, paddingTop: 1 }}>{a}</div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  <div className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 4 }}>
                    Generado por IA a partir de tus datos. Revísalo con criterio antes de tomar decisiones.
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </Layout>
  )
}
