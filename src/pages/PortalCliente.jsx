// src/pages/PortalCliente.jsx
import { useState, useEffect } from 'react'
import { useAuth } from '../lib/context.jsx'
import { getProductos, createPedidoCliente, getPedidosCliente, getClientes } from '../lib/db.js'
import { LogOut, ShoppingCart, Search, X, ChevronDown, ChevronUp, Plus, Minus, Trash2, Send, Clock, Check, XCircle } from 'lucide-react'

function fmt(n) { return '$' + Math.round(n || 0).toLocaleString('es-CL') }

function getEscala(p) {
  const escalas = [{ desde: 1, precio: p.precio_venta, label: 'Ruta' }]
  if (p.precio_ruta > 0 && p.precio_ruta_minimo > 0)
    escalas.push({ desde: p.precio_ruta_minimo, precio: p.precio_ruta, label: 'Volumen' })
  if (p.precio_mayorista > 0 && p.precio_mayorista_minimo > 0)
    escalas.push({ desde: p.precio_mayorista_minimo, precio: p.precio_mayorista, label: 'Mayorista' })
  return escalas
}

function getPrecioActual(p, cantidad) {
  const escalas = getEscala(p).reverse()
  for (const e of escalas) {
    if (cantidad >= e.desde) return e.precio
  }
  return p.precio_venta
}

const ROJO = '#C0392B'
const escalaColors = [ROJO, '#2850b3', '#b07a00']

export default function PortalCliente() {
  const { user, logout } = useAuth()
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('')
  const [categorias, setCategorias] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [expandedCat, setExpandedCat] = useState(null)
  const [carrito, setCarrito] = useState([])
  const [showCarrito, setShowCarrito] = useState(false)
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [pedidos, setPedidos] = useState([])
  const [vista, setVista] = useState('catalogo') // catalogo | pedidos
  const [clienteData, setClienteData] = useState(null)

  useEffect(() => {
    async function load() {
      const [prods, clienteArr] = await Promise.all([
        getProductos({ activo: true }),
        getClientes({ vendedor_id: user.vendedor_id })
      ])
      setProductos(prods)
      const cats = [...new Set(prods.map(p => p.categoria).filter(Boolean))].sort()
      setCategorias(cats)
      if (cats.length) setExpandedCat(cats[0])

      // Buscar datos del cliente
      const cli = clienteArr.find(c => c.username === user.username)
      setClienteData(cli)

      // Cargar pedidos del cliente
      const ps = await getPedidosCliente({ cliente_id: user.id })
      setPedidos(ps)
      setLoading(false)
    }
    load()
  }, [])

  async function recargarPedidos() {
    const ps = await getPedidosCliente({ cliente_id: user.id })
    setPedidos(ps)
  }

  function addToCart(p) {
    setCarrito(c => {
      const exists = c.find(i => i.id === p.id)
      if (exists) {
        return c.map(i => i.id === p.id ? {
          ...i, cantidad: i.cantidad + 1,
          precio: getPrecioActual(p, i.cantidad + 1)
        } : i)
      }
      return [...c, { id: p.id, codigo: p.codigo, descripcion: p.descripcion, cantidad: 1, precio: p.precio_venta, imagen_url: p.imagen_url, unidades_caja: p.unidades_caja, _prod: p }]
    })
  }

  function updateQty(id, qty) {
    if (qty < 1) { removeFromCart(id); return }
    setCarrito(c => c.map(i => {
      if (i.id !== id) return i
      return { ...i, cantidad: qty, precio: getPrecioActual(i._prod, qty) }
    }))
  }

  function removeFromCart(id) { setCarrito(c => c.filter(i => i.id !== id)) }

  const subtotal = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0)

  async function enviarPedido() {
    if (!carrito.length) return
    setEnviando(true)
    try {
      const items = carrito.map(i => ({
        producto_id: i.id, codigo: i.codigo, descripcion: i.descripcion,
        cantidad: i.cantidad, precio_unitario: i.precio,
        subtotal: i.precio * i.cantidad
      }))
      await createPedidoCliente({
        cliente_id: user.id,
        cliente_nombre: clienteData?.nombre || user.nombre || user.username,
        vendedor_id: clienteData?.vendedor_id || user.vendedor_id,
        items: JSON.stringify(items),
        subtotal, total: subtotal,
        plazo_despacho: '48h',
        estado: 'pendiente',
        notas_cliente: notas,
      })
      setCarrito([])
      setNotas('')
      setShowCarrito(false)
      setEnviado(true)
      await recargarPedidos()
      setTimeout(() => setEnviado(false), 4000)
    } catch (e) { alert('Error al enviar pedido') }
    setEnviando(false)
  }

  const filtered = productos.filter(p => {
    if (categoria && p.categoria !== categoria) return false
    if (search && !p.descripcion?.toLowerCase().includes(search.toLowerCase()) &&
        !p.codigo?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const porCategoria = categorias.reduce((acc, cat) => {
    acc[cat] = filtered.filter(p => p.categoria === cat)
    return acc
  }, {})

  const pendientes = pedidos.filter(p => p.estado === 'pendiente').length

  const estadoBadge = {
    pendiente: { bg: '#fff8e6', color: '#b07a00', icon: <Clock size={12} />, label: 'Pendiente' },
    aprobado: { bg: '#e8f5ee', color: '#1a7f4b', icon: <Check size={12} />, label: 'Aprobado' },
    rechazado: { bg: '#fff5f5', color: '#e53e3e', icon: <XCircle size={12} />, label: 'Rechazado' },
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f9fc', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Header */}
      <header style={{
        background: ROJO, color: '#fff', padding: '0 16px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: -.5 }}>
            Elige<span style={{ color: '#FFD700' }}>Market</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['catalogo', 'pedidos'].map(v => (
              <button key={v} onClick={() => setVista(v)} style={{
                background: vista === v ? 'rgba(255,255,255,.25)' : 'transparent',
                border: 'none', color: '#fff', padding: '5px 12px', borderRadius: 6,
                cursor: 'pointer', fontWeight: vista === v ? 700 : 400, fontSize: '.85rem',
                fontFamily: 'inherit', position: 'relative'
              }}>
                {v === 'catalogo' ? 'Catálogo' : 'Mis Pedidos'}
                {v === 'pedidos' && pendientes > 0 && (
                  <span style={{
                    position: 'absolute', top: -2, right: -4,
                    background: '#FFD700', color: '#333',
                    borderRadius: '50%', width: 16, height: 16,
                    fontSize: '.65rem', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>{pendientes}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Carrito */}
          <button onClick={() => setShowCarrito(true)} style={{
            background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff',
            padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem',
            fontFamily: 'inherit', position: 'relative'
          }}>
            <ShoppingCart size={16} />
            {totalItems > 0 && (
              <span style={{
                background: '#FFD700', color: '#333', borderRadius: 10,
                padding: '1px 6px', fontSize: '.72rem', fontWeight: 800
              }}>{totalItems}</span>
            )}
          </button>
          <button onClick={logout} style={{
            background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff',
            padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit'
          }}>
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Toast enviado */}
      {enviado && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1a7f4b', color: '#fff', padding: '12px 24px', borderRadius: 10,
          fontWeight: 700, zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,.2)'
        }}>
          ✅ Pedido enviado — tu vendedor lo revisará pronto
        </div>
      )}

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px' }}>

        {/* ── VISTA CATÁLOGO ── */}
        {vista === 'catalogo' && (
          <>
            <div style={{
              background: '#fff', borderRadius: 12, padding: 14,
              boxShadow: '0 2px 8px rgba(0,0,0,.07)', marginBottom: 16,
              display: 'flex', gap: 10, flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                <input style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '.9rem', outline: 'none', fontFamily: 'inherit' }}
                  placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '.9rem', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
                value={categoria} onChange={e => { setCategoria(e.target.value); if (e.target.value) setExpandedCat(e.target.value) }}>
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c}>{c}</option>)}
              </select>
              {(search || categoria) && (
                <button onClick={() => { setSearch(''); setCategoria('') }}
                  style={{ background: 'none', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <X size={14} /> Limpiar
                </button>
              )}
            </div>

            {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Cargando...</div> :
              categorias.map(cat => {
                const prods = porCategoria[cat]
                if (!prods?.length) return null
                const isOpen = expandedCat === cat || !!search || !!categoria
                return (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <div onClick={() => setExpandedCat(isOpen && !search && !categoria ? null : cat)}
                      style={{ background: ROJO, color: '#fff', padding: '10px 16px', borderRadius: isOpen ? '10px 10px 0 0' : 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                      <span style={{ fontWeight: 700 }}>{cat}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '.8rem', opacity: .8 }}>{prods.length} productos</span>
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ background: '#fff', borderRadius: '0 0 10px 10px', boxShadow: '0 2px 8px rgba(0,0,0,.07)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1, overflow: 'hidden' }}>
                        {prods.map(p => {
                          const enCarrito = carrito.find(i => i.id === p.id)
                          const escalas = getEscala(p)
                          return (
                            <div key={p.id} style={{ padding: 10, borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
                              <div onClick={() => setDetalle(p)} style={{ cursor: 'pointer' }}>
                                <div style={{ width: '100%', height: 100, marginBottom: 6, borderRadius: 8, overflow: 'hidden', background: '#f5f5f5' }}>
                                  {p.imagen_url ? <img src={p.imagen_url} alt={p.descripcion} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>📦</div>}
                                </div>
                                <div style={{ fontSize: '.7rem', color: '#999', fontFamily: 'monospace', marginBottom: 2 }}>{p.codigo}</div>
                                <div style={{ fontWeight: 700, fontSize: '.8rem', lineHeight: 1.3, marginBottom: 5, minHeight: 28 }}>{p.descripcion}</div>
                                {escalas.map((e, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                                    <span style={{ fontSize: '.65rem', color: escalaColors[i] }}>{i === 0 ? 'Ruta' : `+${e.desde}uds`}</span>
                                    <div style={{ textAlign: 'right' }}>
                                      <span style={{ fontWeight: 700, fontSize: '.78rem', color: escalaColors[i] }}>{fmt(e.precio)}</span>
                                      {p.unidades_caja > 1 && <div style={{ fontSize: '.62rem', color: '#bbb' }}>{fmt(Math.round(e.precio / p.unidades_caja))}/ud</div>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {/* Botón agregar */}
                              {p.sin_stock ? (
                                <div style={{ marginTop: 8, padding: '5px', background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8, textAlign: 'center', fontSize: '.72rem', fontWeight: 800, color: '#e53e3e' }}>
                                  ⚠️ SIN STOCK
                                </div>
                              ) : enCarrito ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, background: '#fef0f0', borderRadius: 8, padding: '4px 8px' }}>
                                  <button onClick={() => updateQty(p.id, enCarrito.cantidad - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ROJO, padding: 2 }}><Minus size={14} /></button>
                                  <span style={{ fontWeight: 700, fontSize: '.85rem', color: ROJO }}>{enCarrito.cantidad}</span>
                                  <button onClick={() => updateQty(p.id, enCarrito.cantidad + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ROJO, padding: 2 }}><Plus size={14} /></button>
                                </div>
                              ) : (
                                <button onClick={() => addToCart(p)} style={{ width: '100%', marginTop: 8, padding: '6px', background: ROJO, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  + Agregar
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            }
          </>
        )}

        {/* ── VISTA PEDIDOS ── */}
        {vista === 'pedidos' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 16 }}>Mis Pedidos</div>
            {pedidos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999', background: '#fff', borderRadius: 12 }}>
                <ShoppingCart size={40} style={{ marginBottom: 10, opacity: .3 }} />
                <p>Aún no tienes pedidos</p>
              </div>
            ) : pedidos.map(p => {
              const badge = estadoBadge[p.estado] || estadoBadge.pendiente
              const items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || [])
              return (
                <div key={p.id} style={{ background: '#fff', borderRadius: 12, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,.07)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Pedido #{p.id}</div>
                      <div style={{ fontSize: '.8rem', color: '#999' }}>{new Date(p.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ background: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: 20, fontSize: '.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {badge.icon} {badge.label}
                      </span>
                      <span style={{ fontWeight: 800, color: ROJO }}>{fmt(p.total)}</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 16px' }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem', padding: '3px 0', borderBottom: i < items.length - 1 ? '1px solid #f8f8f8' : 'none' }}>
                        <span>{item.descripcion} <span style={{ color: '#999' }}>x{item.cantidad}</span></span>
                        <span style={{ fontWeight: 600 }}>{fmt(item.subtotal)}</span>
                      </div>
                    ))}
                    {p.plazo_despacho && (
                      <div style={{ marginTop: 8, fontSize: '.78rem', color: '#888' }}>
                        🚚 Despacho: {p.plazo_despacho === '24h' ? '24 horas - EXPRESS' : '48 horas - Estándar'}
                      </div>
                    )}
                    {p.notas_vendedor && (
                      <div style={{ marginTop: 6, background: '#f0f8ff', padding: '6px 10px', borderRadius: 6, fontSize: '.8rem', color: '#2850b3' }}>
                        💬 Vendedor: {p.notas_vendedor}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── MODAL DETALLE ── */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setDetalle(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '100%', height: 200, background: '#f5f5f5', borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
              {detalle.imagen_url ? <img src={detalle.imagen_url} alt={detalle.descripcion} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem' }}>📦</div>}
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '.75rem', color: '#999', fontFamily: 'monospace', marginBottom: 4 }}>{detalle.codigo}</div>
              <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 12 }}>{detalle.descripcion}</h3>
              <div style={{ background: '#fafafa', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ background: ROJO, padding: '7px 12px' }}><span style={{ color: '#fff', fontWeight: 700, fontSize: '.82rem' }}>Precios según cantidad</span></div>
                {getEscala(detalle).map((e, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderBottom: '1px solid #eee', background: i % 2 ? '#f8f8f8' : '#fff' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '.85rem', color: escalaColors[i] }}>{e.label}</div>
                      <div style={{ fontSize: '.72rem', color: '#999' }}>desde {e.desde} ud{e.desde > 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: escalaColors[i] }}>{fmt(e.precio)}</div>
                      {detalle.unidades_caja > 1 && <div style={{ fontSize: '.7rem', color: '#aaa' }}>{fmt(Math.round(e.precio / detalle.unidades_caja))}/ud</div>}
                    </div>
                  </div>
                ))}
              </div>
              {detalle.unidades_caja > 1 && <div style={{ fontSize: '.82rem', color: '#888', marginBottom: 10 }}>📦 {detalle.unidades_caja} unidades por caja</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setDetalle(null)} style={{ flex: 1, padding: 10, background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cerrar</button>
                <button onClick={() => { addToCart(detalle); setDetalle(null) }} style={{ flex: 2, padding: 10, background: ROJO, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Agregar al carrito</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CARRITO LATERAL ── */}
      {showCarrito && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }} onClick={() => setShowCarrito(false)} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 380, background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: ROJO, color: '#fff' }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><ShoppingCart size={18} /> Mi Pedido ({totalItems} items)</div>
              <button onClick={() => setShowCarrito(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {carrito.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                  <ShoppingCart size={36} style={{ opacity: .3, marginBottom: 8 }} />
                  <p>Carrito vacío</p>
                </div>
              ) : carrito.map(item => (
                <div key={item.id} style={{ background: '#fafafa', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    {item.imagen_url && <img src={item.imagen_url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '.82rem', lineHeight: 1.2 }}>{item.descripcion}</div>
                      <div style={{ fontSize: '.72rem', color: '#999' }}>{item.codigo}</div>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e' }}><Trash2 size={14} /></button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '4px 8px', border: '1px solid #eee' }}>
                      <button onClick={() => updateQty(item.id, item.cantidad - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ROJO }}><Minus size={14} /></button>
                      <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.cantidad}</span>
                      <button onClick={() => updateQty(item.id, item.cantidad + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ROJO }}><Plus size={14} /></button>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: ROJO }}>{fmt(item.precio * item.cantidad)}</div>
                      <div style={{ fontSize: '.72rem', color: '#999' }}>{fmt(item.precio)}/ud</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {carrito.length > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>Total:</span>
                  <span style={{ fontWeight: 800, fontSize: '1.2rem', color: ROJO }}>{fmt(subtotal)}</span>
                </div>
                <div style={{ background: '#fff8e6', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: '.78rem', color: '#b07a00' }}>
                  🚚 Despacho estándar: 48 horas
                </div>
                <textarea
                  placeholder="Notas para el vendedor (opcional)..."
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '.85rem', resize: 'none', height: 60, fontFamily: 'inherit', outline: 'none', marginBottom: 10 }}
                />
                <button onClick={enviarPedido} disabled={enviando} style={{ width: '100%', padding: 12, background: ROJO, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.95rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {enviando ? 'Enviando...' : <><Send size={16} /> Enviar Pedido</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
