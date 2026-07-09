// src/pages/PedidosCliente.jsx
import { useState, useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import { useAuth, useToast } from '../lib/context.jsx'
import { getPedidosCliente, updatePedidoCliente, getUsuarios, createVenta } from '../lib/db.js'
import { generarPedidoPDF } from '../lib/pdfGenerator.js'
import { Clock, Check, XCircle, Edit2, FileText, ChevronDown, ChevronUp, X, Trash2, Plus, Minus } from 'lucide-react'

function fmt(n) { return '$' + Math.round(n || 0).toLocaleString('es-CL') }

export default function PedidosCliente() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('pendiente')
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [usuarios, setUsuarios] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [notasVendedor, setNotasVendedor] = useState('')
  const [plazo, setPlazo] = useState('48h')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const f = isAdmin
      ? (filtroVendedor ? { vendedor_id: Number(filtroVendedor) } : {})
      : { vendedor_id: user.id }
    if (filtroEstado) f.estado = filtroEstado
    const data = await getPedidosCliente(f)
    setPedidos(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [filtroEstado, filtroVendedor])
  useEffect(() => { if (isAdmin) getUsuarios().then(u => setUsuarios(u.filter(x => x.role === 'vendedor'))) }, [])

  function openEdit(p) {
    const items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || [])
    setEditItems(items.map(i => ({ ...i })))
    setNotasVendedor(p.notas_vendedor || '')
    setPlazo(p.plazo_despacho || '48h')
    setEditModal(p)
  }

  function updateItemQty(idx, qty) {
    if (qty < 1) {
      setEditItems(items => items.filter((_, i) => i !== idx))
      return
    }
    setEditItems(items => items.map((item, i) => i === idx ? { ...item, cantidad: qty, subtotal: item.precio_unitario * qty } : item))
  }

  const editTotal = editItems.reduce((s, i) => s + Number(i.subtotal), 0)

  async function handleAction(pedido, accion) {
    setSaving(true)
    try {
      if (accion === 'rechazar') {
        await updatePedidoCliente(pedido.id, { estado: 'rechazado', notas_vendedor: notasVendedor })
        toast('Pedido rechazado', 'default')
        setEditModal(null)
      } else if (accion === 'aprobar') {
        const items = editModal ? editItems : (typeof pedido.items === 'string' ? JSON.parse(pedido.items) : pedido.items || [])
        const total = items.reduce((s, i) => s + Number(i.subtotal), 0)

        await updatePedidoCliente(pedido.id, {
          estado: 'aprobado',
          items: JSON.stringify(items),
          total, subtotal: total,
          plazo_despacho: plazo,
          notas_vendedor: notasVendedor
        })

        // Crear venta real
        const ventaData = {
          cliente_id: pedido.cliente_id,
          cliente_nombre: pedido.cliente_nombre,
          vendedor_id: pedido.vendedor_id || user.id,
          vendedor_nombre: user.nombre,
          subtotal: total, descuento_global: 0, total,
          plazo_despacho: plazo,
          estado_entrega: 'pendiente',
          created_at: new Date().toISOString()
        }
        const ventaItems = items.map(i => ({
          producto_id: i.producto_id, codigo: i.codigo,
          descripcion: i.descripcion, cantidad: Number(i.cantidad),
          precio_unitario: Number(i.precio_unitario),
          descuento_item: 0, subtotal: Number(i.subtotal)
        }))
        const venta = await createVenta(ventaData, ventaItems)

        // Generar PDF
        await generarPedidoPDF(
          { ...ventaData, id: venta.id },
          ventaItems,
          { nombre: pedido.cliente_nombre },
          { nombre: user.nombre, username: user.username }
        )

        toast('Pedido aprobado y PDF generado ✓', 'success')
        setEditModal(null)
      }
      load()
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    }
    setSaving(false)
  }

  const estadoBadge = {
    pendiente: { bg: '#fff8e6', color: '#b07a00', icon: <Clock size={12} />, label: 'Pendiente' },
    aprobado: { bg: '#e8f5ee', color: '#1a7f4b', icon: <Check size={12} />, label: 'Aprobado' },
    rechazado: { bg: '#fff5f5', color: '#e53e3e', icon: <XCircle size={12} />, label: 'Rechazado' },
  }

  const pendientesCount = pedidos.filter(p => p.estado === 'pendiente').length

  return (
    <Layout title="Pedidos de Clientes">
      <div className="page-header">
        <div>
          <h2>Pedidos de Clientes
            {pendientesCount > 0 && (
              <span style={{ background: '#e53e3e', color: '#fff', borderRadius: '50%', width: 22, height: 22, fontSize: '.75rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 10 }}>
                {pendientesCount}
              </span>
            )}
          </h2>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters-bar">
        <div className="form-group">
          <label>Estado</label>
          <select className="form-control" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobado">Aprobados</option>
            <option value="rechazado">Rechazados</option>
          </select>
        </div>
        {isAdmin && (
          <div className="form-group">
            <label>Vendedor</label>
            <select className="form-control" value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="">Todos</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading ? <div className="empty-state"><p>Cargando...</p></div> :
        pedidos.length === 0 ? (
          <div className="table-wrap"><div className="empty-state"><Clock size={40} /><p>No hay pedidos {filtroEstado}</p></div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pedidos.map(p => {
              const badge = estadoBadge[p.estado] || estadoBadge.pendiente
              const items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || [])
              const isOpen = expanded === p.id
              return (
                <div key={p.id} className="table-wrap" style={{ overflow: 'visible' }}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '6px 10px', fontWeight: 800, fontSize: '.85rem' }}>#{p.id}</div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{p.cliente_nombre}</div>
                        <div className="text-xs text-muted">
                          {new Date(p.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {' · '}{items.length} productos
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: 20, fontSize: '.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {badge.icon} {badge.label}
                      </span>
                      <span style={{ fontWeight: 800, color: 'var(--green)' }}>{fmt(p.total)}</span>
                      <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setExpanded(isOpen ? null : p.id)}>
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {p.estado === 'pendiente' && (
                        <button className="btn btn-primary btn-sm" onClick={() => openEdit(p)}>
                          <Edit2 size={14} /> Gestionar
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '0 18px 14px', borderTop: '1px solid var(--border)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: '.88rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)' }}>
                            <th style={{ padding: '5px 8px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '.75rem' }}>Producto</th>
                            <th style={{ padding: '5px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '.75rem' }}>Cant.</th>
                            <th style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '.75rem' }}>P.Unit</th>
                            <th style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '.75rem' }}>Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, i) => (
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '5px 8px' }}>{item.descripcion}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'center' }}>{item.cantidad}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(item.precio_unitario)}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{fmt(item.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {p.notas_cliente && (
                        <div style={{ marginTop: 8, background: 'var(--accent-light)', padding: '6px 10px', borderRadius: 6, fontSize: '.82rem', color: '#b07a00' }}>
                          💬 Cliente: {p.notas_cliente}
                        </div>
                      )}
                      {p.notas_vendedor && (
                        <div style={{ marginTop: 6, background: 'var(--green-light)', padding: '6px 10px', borderRadius: 6, fontSize: '.82rem', color: 'var(--green)' }}>
                          📝 Vendedor: {p.notas_vendedor}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      }

      {/* Modal Gestionar Pedido */}
      {editModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditModal(null)}>
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <div>
                <h3>Gestionar Pedido #{editModal.id}</h3>
                <div className="text-xs text-muted">{editModal.cliente_nombre}</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Items editables */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: '.88rem', marginBottom: 8 }}>Productos del pedido</div>
                {editItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, fontSize: '.85rem', fontWeight: 500 }}>{item.descripcion}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button className="btn btn-secondary btn-sm btn-icon" onClick={() => updateItemQty(idx, item.cantidad - 1)}><Minus size={12} /></button>
                      <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{item.cantidad}</span>
                      <button className="btn btn-secondary btn-sm btn-icon" onClick={() => updateItemQty(idx, item.cantidad + 1)}><Plus size={12} /></button>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--green)', minWidth: 80, textAlign: 'right' }}>{fmt(item.subtotal)}</div>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => updateItemQty(idx, 0)}><Trash2 size={12} /></button>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0', fontWeight: 800, fontSize: '1.05rem' }}>
                  Total: <span style={{ color: 'var(--green)', marginLeft: 8 }}>{fmt(editTotal)}</span>
                </div>
              </div>

              {/* Plazo despacho */}
              <div className="form-group">
                <label>Plazo de Despacho</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['48h', '24h'].map(op => (
                    <button key={op} type="button" onClick={() => setPlazo(op)}
                      style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', border: `2px solid ${plazo === op ? (op === '24h' ? 'var(--danger)' : 'var(--green)') : 'var(--border)'}`, background: plazo === op ? (op === '24h' ? 'var(--danger-light)' : 'var(--green-light)') : 'var(--white)', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800 }}>{op === '48h' ? '48 horas' : '24 horas'}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)' }}>{op === '48h' ? 'Estándar' : 'Express'}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas vendedor */}
              <div className="form-group">
                <label>Notas para el cliente (opcional)</label>
                <textarea className="form-control" value={notasVendedor} onChange={e => setNotasVendedor(e.target.value)}
                  placeholder="Ej: Producto X sin stock, se reemplazó por Y..." />
              </div>

              {editModal.notas_cliente && (
                <div style={{ background: 'var(--accent-light)', padding: '8px 12px', borderRadius: 8, fontSize: '.85rem', color: '#b07a00', marginBottom: 8 }}>
                  💬 Nota del cliente: {editModal.notas_cliente}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={() => handleAction(editModal, 'rechazar')} disabled={saving}>
                <XCircle size={14} /> Rechazar
              </button>
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => handleAction(editModal, 'aprobar')} disabled={saving || !editItems.length}>
                {saving ? <span className="spinner" /> : <><FileText size={14} /> Aprobar y Generar PDF</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
