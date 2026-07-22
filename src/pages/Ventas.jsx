// src/pages/Ventas.jsx
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { useAuth, useToast } from '../lib/context.jsx'
import { getVentas, deleteVenta, updateVenta, updateVentaItem, getClientes, getProductos, createVenta, getUsuarios } from '../lib/db.js'
import { ESTADOS_ENTREGA, ORDEN_ESTADOS, estadoVenta, cantEntregada, montoReal, costoRealVenta, montoRealDesdeItems } from '../lib/entrega.js'
import { generarPedidoPDF } from '../lib/pdfGenerator.js'
import {
  Plus, Trash2, X, ShoppingCart, FileText, Search,
  ChevronDown, ChevronUp, Percent, User
} from 'lucide-react'

function fmt(n) { return '$' + Math.round(n || 0).toLocaleString('es-CL') }

// ────────────────────────────── NUEVA VENTA ──────────────────────────────────
function NuevaVenta({ onBack }) {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState(1) // 1=cliente, 2=productos, 3=confirmar
  const [clientes, setClientes] = useState([])
  const [productos, setProductos] = useState([])
  const [filteredProductos, setFilteredProductos] = useState([])
  const [clienteSelected, setClienteSelected] = useState(null)
  const [clienteSearch, setClienteSearch] = useState('')
  const [prodSearch, setProdSearch] = useState('')
  const [prodCat, setProdCat] = useState('')
  const [carrito, setCarrito] = useState([])
  const [descGlobal, setDescGlobal] = useState(0)
  const [plazoDespacho, setPlazoDespacho] = useState('48h')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const f = user.role === 'vendedor' ? { vendedor_id: user.id } : {}
    getClientes(f).then(setClientes)
    getProductos({ activo: true }).then(d => { setProductos(d); setFilteredProductos(d) })
  }, [])

  useEffect(() => {
    let d = productos
    if (prodSearch) d = d.filter(p => p.descripcion.toLowerCase().includes(prodSearch.toLowerCase()) || p.codigo.toLowerCase().includes(prodSearch.toLowerCase()))
    if (prodCat) d = d.filter(p => p.categoria === prodCat)
    setFilteredProductos(d)
  }, [prodSearch, prodCat, productos])

  const filteredClientes = clientes.filter(c =>
    !clienteSearch || c.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) || (c.rut || '').includes(clienteSearch)
  )

  function getPrecio(p_or_item, cantidad) {
    const base = Number(p_or_item.precio_venta || p_or_item.precio_base || 0)
    const precioRuta = Number(p_or_item.precio_ruta || 0)
    const minimoRuta = Number(p_or_item.precio_ruta_minimo || 0)
    const precioMay = Number(p_or_item.precio_mayorista || 0)
    const minimoMay = Number(p_or_item.precio_mayorista_minimo || 0)

    // Mayorista tiene prioridad si se alcanza su mínimo
    if (precioMay > 0 && minimoMay > 0 && cantidad >= minimoMay) return precioMay
    // Luego precio ruta
    if (precioRuta > 0 && minimoRuta > 0 && cantidad >= minimoRuta) return precioRuta
    // Si no, precio cliente final
    return base
  }

  function getNivelPrecio(p_or_item, cantidad) {
    const precioRuta = Number(p_or_item.precio_ruta || 0)
    const minimoRuta = Number(p_or_item.precio_ruta_minimo || 0)
    const precioMay = Number(p_or_item.precio_mayorista || 0)
    const minimoMay = Number(p_or_item.precio_mayorista_minimo || 0)
    if (precioMay > 0 && minimoMay > 0 && cantidad >= minimoMay) return '🏭 Precio Mayorista'
    if (precioRuta > 0 && minimoRuta > 0 && cantidad >= minimoRuta) return 'Precio Volumen'
    return null
  }

  function addToCart(p) {
    const exists = carrito.find(i => i.producto_id === p.id)
    if (exists) {
      setCarrito(c => c.map(i => {
        if (i.producto_id !== p.id) return i
        const nuevaCantidad = i.cantidad + 1
        const nuevoPrecio = getPrecio(p, nuevaCantidad)
        const dto = Number(i.descuento_item) / 100
        return { ...i, cantidad: nuevaCantidad, precio_unitario: nuevoPrecio, subtotal: nuevaCantidad * nuevoPrecio * (1 - dto), _nivelPrecio: getNivelPrecio(p, nuevaCantidad) }
      }))
    } else {
      setCarrito(c => [...c, {
        producto_id: p.id, codigo: p.codigo, descripcion: p.descripcion,
        cantidad: 1, precio_unitario: p.precio_venta, precio_base: p.precio_venta,
        descuento_item: 0, subtotal: p.precio_venta,
        precio_volumen: p.precio_volumen, volumen_minimo: p.volumen_minimo,
        precio_ruta: Number(p.precio_ruta || 0),
        precio_ruta_minimo: Number(p.precio_ruta_minimo || 0),
        precio_mayorista: Number(p.precio_mayorista || 0),
        precio_mayorista_minimo: Number(p.precio_mayorista_minimo || 0),
        costo: Number(p.costo || 0),
        _nivelPrecio: null
      }])
    }
  }

  function updateItem(id, field, val) {
    setCarrito(c => c.map(i => {
      if (i.producto_id !== id) return i
      const updated = { ...i, [field]: val }
      const qty = Number(updated.cantidad)
      // Auto-aplicar precio por niveles al cambiar cantidad
      if (field === 'cantidad') {
        updated.precio_unitario = getPrecio(updated, qty)
        updated._nivelPrecio = getNivelPrecio(updated, qty)
      }
      const precio = Number(updated.precio_unitario)
      const dto = Number(updated.descuento_item) / 100
      updated.subtotal = precio * qty * (1 - dto)
      return updated
    }))
  }

  function removeItem(id) { setCarrito(c => c.filter(i => i.producto_id !== id)) }

  const subtotal = carrito.reduce((s, i) => s + i.subtotal, 0)
  const totalFinal = subtotal * (1 - descGlobal / 100)

  async function confirmarVenta() {
    if (!clienteSelected) { toast('Selecciona un cliente', 'error'); return }
    if (!carrito.length) { toast('Agrega al menos un producto', 'error'); return }
    setSaving(true)
    try {
      const ventaData = {
        cliente_id: clienteSelected.id,
        cliente_nombre: clienteSelected.nombre,
        vendedor_id: user.id,
        vendedor_nombre: user.nombre,
        subtotal, descuento_global: descGlobal, total: totalFinal,
        plazo_despacho: plazoDespacho,
        estado_entrega: 'pendiente',
        created_at: new Date().toISOString()
      }
      const items = carrito.map(i => ({
        producto_id: i.producto_id, codigo: i.codigo,
        descripcion: i.descripcion, cantidad: Number(i.cantidad),
        precio_unitario: Number(i.precio_unitario),
        descuento_item: Number(i.descuento_item),
        subtotal: Number(i.subtotal),
        costo: Number(i.costo || 0)
      }))
      const venta = await createVenta(ventaData, items)
      toast('Pedido guardado correctamente', 'success')
      await generarPedidoPDF({ ...ventaData, id: venta.id }, items, clienteSelected, user)
      navigate('/ventas')
    } catch (e) { toast('No se guardó el pedido. Revisa tu conexión e intenta de nuevo.', 'error') }
    setSaving(false)
  }

  const cats = [...new Set(productos.map(p => p.categoria).filter(Boolean))].sort()

  return (
    <Layout title="Nuevo Pedido">
      {/* Steps */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--white)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        {[{ n: 1, label: 'Cliente' }, { n: 2, label: 'Productos' }, { n: 3, label: 'Confirmar' }].map(({ n, label }) => (
          <div key={n} onClick={() => n < step && setStep(n)}
            style={{
              flex: 1, padding: '12px', textAlign: 'center', fontWeight: 600, fontSize: '.88rem',
              background: step === n ? 'var(--green)' : step > n ? 'var(--green-light)' : 'var(--white)',
              color: step === n ? '#fff' : step > n ? 'var(--green)' : 'var(--text-secondary)',
              cursor: n < step ? 'pointer' : 'default',
              transition: 'all .2s'
            }}>
            {n}. {label}
          </div>
        ))}
      </div>

      {/* STEP 1: Cliente */}
      {step === 1 && (
        <div>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h2>Seleccionar Cliente</h2>
            <button className="btn btn-secondary" onClick={onBack}><X size={16} /> Cancelar</button>
          </div>
          <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 16, boxShadow: 'var(--shadow)', marginBottom: 16 }}>
            <input className="form-control" placeholder="Buscar por nombre o RUT..." value={clienteSearch}
              onChange={e => setClienteSearch(e.target.value)} style={{ marginBottom: 0 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredClientes.map(c => (
              <div key={c.id} onClick={() => { setClienteSelected(c); setStep(2) }}
                style={{
                  background: clienteSelected?.id === c.id ? 'var(--green-light)' : 'var(--white)',
                  border: `2px solid ${clienteSelected?.id === c.id ? 'var(--green)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', padding: '14px 18px', cursor: 'pointer', transition: 'all .15s',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{c.nombre}</div>
                  <div className="text-xs text-muted">{c.rut} · {c.comuna}</div>
                </div>
                <span className="badge badge-gray">{c.tipo}</span>
              </div>
            ))}
            {filteredClientes.length === 0 && <div className="empty-state"><User size={32} /><p>Sin clientes</p></div>}
          </div>
        </div>
      )}

      {/* STEP 2: Productos + Carrito */}
      {step === 2 && (
        <div style={{ display: 'flex', gap: 16, position: 'relative' }}>
          {/* Productos */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ background: 'var(--white)', padding: 14, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>
                Cliente: <span style={{ color: 'var(--green)' }}>{clienteSelected?.nombre}</span>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setStep(1)}>Cambiar</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="form-control" placeholder="Buscar producto..." value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
                <select className="form-control" value={prodCat} onChange={e => setProdCat(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
                  <option value="">Todas las categorías</option>
                  {cats.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="table-wrap mobile-cards">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Precio</th>
                    <th>Agregar</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProductos.map(p => {
                    const enCarrito = carrito.find(i => i.producto_id === p.id)
                    return (
                      <tr key={p.id}>
                        <td data-label="Código" className="text-mono text-xs">{p.codigo}</td>
                        <td data-label="Producto">
                          <div style={{ fontWeight: 500 }}>{p.descripcion}</div>
                          {p.precio_volumen > 0 && <div className="text-xs" style={{ color: 'var(--accent)' }}>Vol +{p.volumen_minimo}: {fmt(p.precio_volumen)}</div>}
                        </td>
                        <td data-label="Precio" style={{ fontWeight: 700, color: 'var(--green)' }}>{fmt(p.precio_venta)}</td>
                        <td data-label="Agregar">
                          {p.sin_stock ? (
                            <span style={{ background: '#e53e3e', color: '#fff', fontSize: '.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>SIN STOCK</span>
                          ) : (
                            <button className={`btn btn-sm ${enCarrito ? 'btn-primary' : 'btn-secondary'}`} onClick={() => addToCart(p)}>
                              {enCarrito ? `+1 (${enCarrito.cantidad})` : '+ Agregar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Carrito lateral */}
          <div style={{ width: 320, flexShrink: 0 }}>
            <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', position: 'sticky', top: 80 }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShoppingCart size={16} /> Carrito ({carrito.length})
                </div>
              </div>
              <div style={{ maxHeight: 380, overflowY: 'auto', padding: 10 }}>
                {carrito.length === 0 ? (
                  <p className="text-muted text-sm" style={{ padding: '20px 0', textAlign: 'center' }}>Sin productos</p>
                ) : carrito.map(item => (
                  <div key={item.producto_id} className="cart-item">
                    <div className="cart-item-name">{item.descripcion}</div>
                    <div className="cart-item-controls">
                      <div>
                        <div className="text-xs text-muted">Cant</div>
                        <input type="number" min="1" value={item.cantidad}
                          onChange={e => updateItem(item.producto_id, 'cantidad', Number(e.target.value))}
                          style={{ width: 55, padding: '4px 6px', border: '1.5px solid var(--border)', borderRadius: 5, fontSize: '.85rem', textAlign: 'center' }} />
                      </div>
                      <div>
                        <div className="text-xs text-muted">Precio</div>
                        <input type="number" value={item.precio_unitario}
                          onChange={e => updateItem(item.producto_id, 'precio_unitario', Number(e.target.value))}
                          style={{ width: 80, padding: '4px 6px', border: '1.5px solid var(--border)', borderRadius: 5, fontSize: '.85rem' }} />
                      </div>
                      <div>
                        <div className="text-xs text-muted">Dto%</div>
                        <input type="number" min="0" max="100" value={item.descuento_item}
                          onChange={e => updateItem(item.producto_id, 'descuento_item', Number(e.target.value))}
                          style={{ width: 50, padding: '4px 6px', border: '1.5px solid var(--border)', borderRadius: 5, fontSize: '.85rem', textAlign: 'center' }} />
                      </div>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeItem(item.producto_id)}><Trash2 size={12} /></button>
                    </div>
                    <div style={{ textAlign: 'right', marginTop: 4 }}>
                      {item._nivelPrecio && (
                        <div style={{ fontSize: '.72rem', color: item._nivelPrecio.includes('Mayorista') ? '#b07a00' : '#2850b3', fontWeight: 700, marginBottom: 2 }}>
                          {item._nivelPrecio}
                        </div>
                      )}
                      <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: '.9rem' }}>{fmt(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Percent size={14} />
                  <span className="text-sm" style={{ flex: 1 }}>Descuento global</span>
                  <input type="number" min="0" max="100" value={descGlobal} onChange={e => setDescGlobal(Number(e.target.value))}
                    style={{ width: 60, padding: '4px 8px', border: '1.5px solid var(--border)', borderRadius: 5, textAlign: 'center', fontSize: '.9rem' }} />
                  <span>%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="text-muted text-sm">Subtotal:</span>
                  <span style={{ fontWeight: 600 }}>{fmt(subtotal)}</span>
                </div>
                {descGlobal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="text-muted text-sm">Descuento ({descGlobal}%):</span>
                    <span style={{ color: 'var(--danger)' }}>-{fmt(subtotal * descGlobal / 100)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1.5px solid var(--border)', marginTop: 4 }}>
                  <span style={{ fontWeight: 700 }}>TOTAL:</span>
                  <span style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--green)' }}>{fmt(totalFinal)}</span>
                </div>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                  onClick={() => carrito.length && setStep(3)} disabled={!carrito.length}>
                  Continuar →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Confirmar */}
      {step === 3 && (
        <div>
          <div className="page-header">
            <h2>Confirmar Pedido</h2>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Volver</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ background: 'var(--green-light)', borderRadius: 'var(--radius)', padding: 18 }}>
              <div className="text-xs text-muted" style={{ marginBottom: 4 }}>CLIENTE</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{clienteSelected?.nombre}</div>
              <div className="text-sm text-muted">{clienteSelected?.rut} · {clienteSelected?.comuna}</div>
            </div>
            <div style={{ background: '#e8f0ff', borderRadius: 'var(--radius)', padding: 18 }}>
              <div className="text-xs text-muted" style={{ marginBottom: 4 }}>RESUMEN</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{carrito.reduce((s, i) => s + Number(i.cantidad), 0)} productos</div>
              <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--green)' }}>{fmt(totalFinal)}</div>
            </div>
          </div>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Producto</th><th>Cant.</th><th>P. Unit.</th><th>Dto.</th><th>Subtotal</th></tr></thead>
              <tbody>
                {carrito.map(i => (
                  <tr key={i.producto_id}>
                    <td>{i.descripcion}</td>
                    <td style={{ textAlign: 'center' }}>{i.cantidad}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(i.precio_unitario)}</td>
                    <td style={{ textAlign: 'center' }}>{i.descuento_item > 0 ? `${i.descuento_item}%` : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Plazo de despacho */}
          <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: '16px 20px', boxShadow: 'var(--shadow)', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Plazo de Despacho</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setPlazoDespacho('48h')}
                style={{
                  flex: 1, padding: '12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  border: `2px solid ${plazoDespacho === '48h' ? 'var(--green)' : 'var(--border)'}`,
                  background: plazoDespacho === '48h' ? 'var(--green-light)' : 'var(--white)', textAlign: 'center'
                }}>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: plazoDespacho === '48h' ? 'var(--green)' : 'var(--text)' }}>48 horas</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>Estandar</div>
              </button>
              <button type="button" onClick={() => setPlazoDespacho('24h')}
                style={{
                  flex: 1, padding: '12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  border: `2px solid ${plazoDespacho === '24h' ? 'var(--danger)' : 'var(--border)'}`,
                  background: plazoDespacho === '24h' ? 'var(--danger-light)' : 'var(--white)', textAlign: 'center'
                }}>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: plazoDespacho === '24h' ? 'var(--danger)' : 'var(--text)' }}>24 horas</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>Express</div>
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: '.82rem', color: 'var(--text-secondary)' }}>
              Seleccionado: <strong style={{ color: plazoDespacho === '24h' ? 'var(--danger)' : 'var(--green)' }}>
                Despacho en {plazoDespacho === '24h' ? '24 horas - EXPRESS' : '48 horas - Estandar'}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Volver</button>
            <button className="btn btn-primary" onClick={confirmarVenta} disabled={saving}
              style={{ gap: 8 }}>
              {saving ? <span className="spinner" /> : <><FileText size={16} /> Confirmar y Generar PDF</>}
            </button>
          </div>
        </div>
      )}
    </Layout>
  )
}

// ──────────────────────────── LISTADO VENTAS ─────────────────────────────────
export default function Ventas() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const [ventas, setVentas] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const esNueva = location.pathname === '/ventas/nueva'

  async function load() {
    setLoading(true)
    const f = isAdmin ? (filtroVendedor ? { vendedor_id: Number(filtroVendedor) } : {}) : { vendedor_id: user.id }
    const [v, u] = await Promise.all([
      getVentas(f),
      isAdmin ? getUsuarios() : Promise.resolve([])
    ])
    setVentas(v)
    setUsuarios(u)
    setLoading(false)
  }
  useEffect(() => { if (!esNueva) load() }, [esNueva, filtroVendedor])

  if (esNueva) return <NuevaVenta onBack={() => navigate('/ventas')} />

  async function handleDelete(id) {
    setDeleting(id)
    await deleteVenta(id)
    toast('Venta eliminada', 'success')
    setDeleting(null)
    load()
  }

  async function actualizarVenta(id, changes) {
    setVentas(vs => vs.map(v => v.id === id ? { ...v, ...changes } : v))
    await updateVenta(id, changes)
  }
  function cambiarEstado(v, nuevo) {
    const changes = { estado_entrega: nuevo }
    changes.monto_entregado = nuevo === 'parcial' ? Number(v.total || 0) : null
    actualizarVenta(v.id, changes)
    if (nuevo === 'parcial') setExpanded(v.id)
    toast('Estado de entrega actualizado', 'success')
  }

  // En entrega parcial: registra cuánto se entregó de un ítem y recalcula el ingreso real.
  async function cambiarCantEntregada(ventaId, itemId, nuevaCant) {
    let nuevoMonto = 0
    setVentas(vs => vs.map(v => {
      if (v.id !== ventaId) return v
      const items = (v.venta_items || []).map(i => i.id === itemId ? { ...i, cantidad_entregada: nuevaCant } : i)
      nuevoMonto = Math.round(montoRealDesdeItems(items, v.descuento_global))
      return { ...v, venta_items: items, monto_entregado: nuevoMonto }
    }))
    await updateVentaItem(itemId, { cantidad_entregada: nuevaCant })
    await updateVenta(ventaId, { monto_entregado: nuevoMonto })
  }

  const totalFacturacion = ventas.reduce((s, v) => s + (v.total || 0), 0)

  return (
    <Layout title="Ventas">
      <div className="page-header">
        <div>
          <h2>Pedidos <span className="badge badge-green" style={{ fontSize: '.75rem', marginLeft: 8 }}>{ventas.length}</span></h2>
          <p className="text-muted text-sm">Facturación total: <strong style={{ color: 'var(--green)' }}>{fmt(totalFacturacion)}</strong></p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/ventas/nueva')}>
          <Plus size={16} /> Nuevo Pedido
        </button>
      </div>

      {isAdmin && (
        <div className="filters-bar">
          <div className="form-group">
            <label>Filtrar por Vendedor</label>
            <select className="form-control" value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="">Todos los vendedores</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state"><p>Cargando...</p></div>
      ) : ventas.length === 0 ? (
        <div className="table-wrap"><div className="empty-state"><ShoppingCart size={40} /><p>Sin pedidos</p></div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ventas.map(v => {
            const isOpen = expanded === v.id
            const items = v.venta_items || []
            const esParcial = estadoVenta(v) === 'parcial'
            return (
              <div key={v.id} className="table-wrap" style={{ overflow: 'visible' }}>
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ background: 'var(--green-light)', borderRadius: 8, padding: '6px 10px', fontWeight: 800, color: 'var(--green)', fontSize: '.85rem' }}>#{v.id}</div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{v.clientes?.nombre || v.cliente_nombre}</div>
                      <div className="text-xs text-muted">
                        {new Date(v.created_at).toLocaleDateString('es-CL')} · {v.vendedor_nombre || 'Vendedor'} · {items.length} items
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {(() => {
                      const est = estadoVenta(v)
                      const cfg = ESTADOS_ENTREGA[est]
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <select value={est} onChange={e => cambiarEstado(v, e.target.value)} title="Estado de entrega"
                            style={{ fontSize: '.72rem', fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}55`, borderRadius: 6, padding: '4px 6px', cursor: 'pointer' }}>
                            {ORDEN_ESTADOS.map(k => <option key={k} value={k}>{ESTADOS_ENTREGA[k].icon} {ESTADOS_ENTREGA[k].label}</option>)}
                          </select>
                          {est === 'parcial' && (
                            <span title="Ingreso real entregado — edita las cantidades en el detalle" style={{ fontSize: '.72rem', color: cfg.color, fontWeight: 800 }}>
                              → {fmt(montoReal(v))}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--green)' }}>{fmt(v.total)}</span>
                    <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setExpanded(isOpen ? null : v.id)}>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button className="btn btn-secondary btn-sm btn-icon" title="Generar PDF"
                      onClick={() => generarPedidoPDF(v, items, v.clientes || { nombre: v.cliente_nombre }, { nombre: v.vendedor_nombre })}>
                      <FileText size={14} />
                    </button>
                    {isAdmin && (
                      <button className="btn btn-danger btn-sm btn-icon" disabled={deleting === v.id}
                        onClick={() => { if (window.confirm('¿Eliminar este pedido?')) handleDelete(v.id) }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ padding: '0 18px 14px', borderTop: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Producto</th>
                          <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: '.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Cant.</th>
                          {esParcial && <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: '.75rem', color: '#b07a00', fontWeight: 700 }}>Entregado</th>}
                          <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>P. Unit.</th>
                          <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Subtotal</th>
                          {isAdmin && <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Margen</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => {
                          const costoItem = Number(item.costo || 0) * Number(item.cantidad)
                          const margenItem = Number(item.subtotal) - costoItem
                          const pctMargen = item.subtotal > 0 ? Math.round((margenItem / Number(item.subtotal)) * 100) : 0
                          return (
                            <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 10px', fontSize: '.88rem' }}>{item.descripcion}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: '.88rem' }}>{item.cantidad}</td>
                              {esParcial && (
                                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                  <input type="number" min="0" max={item.cantidad}
                                    value={cantEntregada(item, 'parcial')}
                                    onChange={e => cambiarCantEntregada(v.id, item.id, Math.max(0, Math.min(Number(item.cantidad), Number(e.target.value) || 0)))}
                                    title="Cantidad realmente entregada"
                                    style={{ width: 56, textAlign: 'center', fontSize: '.82rem', padding: '3px 4px', border: '1px solid #b07a0066', borderRadius: 5, fontWeight: 700, color: '#b07a00' }} />
                                </td>
                              )}
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '.88rem' }}>{fmt(item.precio_unitario)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontSize: '.88rem' }}>{fmt(item.subtotal)}</td>
                              {isAdmin && (
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '.88rem' }}>
                                  <span style={{ color: pctMargen > 30 ? 'var(--green)' : pctMargen > 15 ? '#b07a00' : 'var(--danger)', fontWeight: 600 }}>
                                    {item.costo > 0 ? `${pctMargen}%` : '—'}
                                  </span>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {(() => {
                      const ingresoReal = montoReal(v)
                      const costoReal = costoRealVenta(v)
                      const margenNeto = ingresoReal - costoReal
                      const pctTotal = ingresoReal > 0 ? Math.round((margenNeto / ingresoReal) * 100) : 0
                      const tieneCosto = items.some(i => i.costo > 0)
                      const noCompleto = estadoVenta(v) !== 'entregada'
                      return isAdmin && tieneCosto ? (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 10, padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, flexWrap: 'wrap' }}>
                          {noCompleto && (
                            <span style={{ fontSize: '.85rem', color: '#b07a00', fontWeight: 700 }}>
                              Entregado: {fmt(ingresoReal)} de {fmt(v.total)}
                            </span>
                          )}
                          {v.descuento_global > 0 && (
                            <span style={{ fontSize: '.85rem', color: 'var(--danger)' }}>
                              Descuento global: {v.descuento_global}%
                            </span>
                          )}
                          <span style={{ fontSize: '.85rem', color: 'var(--text-secondary)' }}>
                            Costo {noCompleto ? 'real' : 'total'}: <strong>{fmt(costoReal)}</strong>
                          </span>
                          <span style={{ fontSize: '.85rem' }}>
                            Margen {noCompleto ? 'real' : 'neto'}: <strong style={{ color: pctTotal > 30 ? 'var(--green)' : pctTotal > 15 ? '#b07a00' : 'var(--danger)' }}>
                              {fmt(margenNeto)} ({pctTotal}%)
                            </strong>
                          </span>
                        </div>
                      ) : v.descuento_global > 0 ? (
                        <div style={{ textAlign: 'right', fontSize: '.85rem', color: 'var(--danger)', marginTop: 6 }}>
                          Descuento global: {v.descuento_global}%
                        </div>
                      ) : null
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
