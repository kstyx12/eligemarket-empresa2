// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import { useAuth } from '../lib/context.jsx'
import { countClientes, countRutas, getVentasResumen, getPedidosCliente } from '../lib/db.js'
import { montoReal } from '../lib/entrega.js'
import { Users, MapPin, ShoppingCart, TrendingUp, Clock, ArrowRight, Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ clientes: 0, rutas: 0, pedidos: 0, facturacion: 0 })
  const [recientes, setRecientes] = useState([])
  const [pedidosPendientes, setPedidosPendientes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const filtros = user.role === 'vendedor' ? { vendedor_id: user.id } : {}
      const [clientesCount, rutasCount, ventas, pendientes] = await Promise.all([
        countClientes(filtros),
        countRutas(user.role === 'vendedor' ? user.id : null),
        getVentasResumen(filtros),
        getPedidosCliente({ vendedor_id: user.role === 'vendedor' ? user.id : undefined, estado: 'pendiente' })
      ])
      const facturacion = ventas.reduce((s, v) => s + montoReal(v), 0)
      setPedidosPendientes(pendientes)
      setStats({ clientes: clientesCount, rutas: rutasCount, pedidos: ventas.length, facturacion })
      setRecientes(ventas.slice(0, 5))
      setLoading(false)
    }
    load()
  }, [user])

  const STAT_CARDS = [
    { label: 'Clientes', value: stats.clientes, icon: Users, color: '#1a7f4b', bg: '#e8f5ee', path: '/clientes' },
    { label: 'Rutas', value: stats.rutas, icon: MapPin, color: '#2850b3', bg: '#e8f0ff', path: '/rutas' },
    { label: 'Pedidos', value: stats.pedidos, icon: ShoppingCart, color: '#b07a00', bg: '#fff8e6', path: '/ventas' },
    { label: 'Facturación', value: fmt(stats.facturacion), icon: TrendingUp, color: '#0f766e', bg: '#e6f7f5', path: '/ventas' },
  ]

  return (
    <Layout title="Dashboard">
      <div className="page-header">
        <div>
          <h2>Bienvenido, {user?.nombre || user?.username} 👋</h2>
          <p className="text-muted text-sm">
            {new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Cargando...</p>
      ) : (
        <>
          <div className="stats-grid">
            {STAT_CARDS.map(({ label, value, icon: Icon, color, bg, path }) => (
              <div className="stat-card" key={label} style={{ cursor: 'pointer' }} onClick={() => navigate(path)}>
                <div className="stat-icon" style={{ background: bg }}>
                  <Icon size={22} color={color} />
                </div>
                <div>
                  <div className="stat-value">{value}</div>
                  <div className="stat-label">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pedidos pendientes de clientes */}
          {pedidosPendientes.length > 0 && (
            <div style={{ background: '#fff8e6', border: '1.5px solid #f0c040', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#b07a00' }}>
                  <Bell size={16} /> {pedidosPendientes.length} pedido{pedidosPendientes.length > 1 ? 's' : ''} pendiente{pedidosPendientes.length > 1 ? 's' : ''} de clientes
                </div>
                <button className="btn btn-sm" style={{ background: '#b07a00', color: '#fff' }} onClick={() => navigate('/pedidos-cliente')}>
                  Ver pedidos
                </button>
              </div>
              {pedidosPendientes.slice(0, 3).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #f0e0a0', fontSize: '.88rem' }}>
                  <span><strong>{p.cliente_nombre}</strong> · {typeof p.items === 'string' ? JSON.parse(p.items).length : (p.items || []).length} productos</span>
                  <span style={{ fontWeight: 700, color: '#b07a00' }}>${Math.round(p.total).toLocaleString('es-CL')}</span>
                </div>
              ))}
            </div>
          )}

          {/* Accesos rápidos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Nuevo Pedido', desc: 'Crear una venta nueva', path: '/ventas/nueva', color: 'var(--green)' },
              { label: 'Nuevo Cliente', desc: 'Agregar cliente', path: '/clientes?new=1', color: 'var(--accent)' },
              { label: 'Ver Catálogo', desc: 'Revisar productos', path: '/catalogo', color: '#2850b3' },
            ].map(({ label, desc, path, color }) => (
              <div
                key={label}
                onClick={() => navigate(path)}
                style={{
                  background: 'var(--white)',
                  borderRadius: 'var(--radius)',
                  padding: '18px 20px',
                  boxShadow: 'var(--shadow)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderLeft: `4px solid ${color}`,
                  transition: 'transform .15s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = ''}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.95rem' }}>{label}</div>
                  <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)' }}>{desc}</div>
                </div>
                <ArrowRight size={18} color={color} />
              </div>
            ))}
          </div>

          {/* Pedidos recientes */}
          <div className="table-wrap">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                <Clock size={16} /> Pedidos Recientes
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/ventas')}>Ver todos</button>
            </div>
            {recientes.length === 0 ? (
              <div className="empty-state">
                <ShoppingCart size={40} />
                <p>No hay pedidos aún</p>
              </div>
            ) : (
              <div className="mobile-cards">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Cliente</th>
                      <th>Fecha</th>
                      <th>Total</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recientes.map(v => (
                      <tr key={v.id}>
                        <td data-label="#">#{v.id}</td>
                        <td data-label="Cliente">{v.clientes?.nombre || v.cliente_nombre || '—'}</td>
                        <td data-label="Fecha">{new Date(v.created_at).toLocaleDateString('es-CL')}</td>
                        <td data-label="Total" style={{ fontWeight: 700, color: 'var(--green)' }}>{fmt(v.total || 0)}</td>
                        <td data-label="Estado"><span className="badge badge-green">Confirmado</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  )
}
