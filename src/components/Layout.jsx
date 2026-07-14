import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/context.jsx'
import { LayoutDashboard, Users, MapPin, Package, ShoppingCart, Settings, Menu, X, LogOut, Map, BarChart2, Bell } from 'lucide-react'
import { countPedidosPendientes } from '../lib/db.js'
import { LOGO_URL } from '../lib/logo.js'

const NAV = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Clientes', path: '/clientes', icon: Users },
  { label: 'Rutas', path: '/rutas', icon: MapPin },
  { label: 'Catálogo', path: '/catalogo', icon: Package },
  { label: 'Ventas', path: '/ventas', icon: ShoppingCart },
  { label: 'Mapa', path: '/mapa', icon: Map },
  { label: 'Reportes', path: '/reportes', icon: BarChart2 },
  { label: 'Pedidos Clientes', path: '/pedidos-cliente', icon: Bell },
  { label: 'Configuración', path: '/configuracion', icon: Settings },
]

export default function Layout({ children, title }) {
  const [open, setOpen] = useState(false)
  const [pedidosPendientes, setPedidosPendientes] = useState(0)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const go = (path) => { navigate(path); setOpen(false) }

  useEffect(() => {
    if (user?.role !== 'cliente') {
      const load = () => countPedidosPendientes(user?.role === 'vendedor' ? user.id : null).then(setPedidosPendientes)
      load()
      const interval = setInterval(load, 30000) // cada 30s
      return () => clearInterval(interval)
    }
  }, [user])

  return (
    <div className="app-layout">
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo" style={{ padding: '10px 12px' }}>
          <img src={LOGO_URL} alt="DIMACE" style={{ width: '100%', maxWidth: 170, display: 'block', margin: '0 auto', background: '#fff', borderRadius: 10, padding: 8 }} />
        </div>
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{user?.nombre?.[0]?.toUpperCase() || 'U'}</div>
          <div className="sidebar-user-info">
            <strong>{user?.nombre || user?.username}</strong>
            <p>{user?.role === 'admin' ? 'Administrador' : 'Vendedor'}</p>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">Menú</div>
          {NAV.map(({ label, path, icon: Icon }) => (
            <div key={path} className={`nav-item ${location.pathname === path ? 'active' : ''}`} onClick={() => go(path)}
              style={{ position: 'relative' }}>
              <Icon size={18} />{label}
              {path === '/pedidos-cliente' && pedidosPendientes > 0 && (
                <span style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: '#e53e3e', color: '#fff', borderRadius: '50%',
                  width: 18, height: 18, fontSize: '.65rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{pedidosPendientes}</span>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="logout-btn" onClick={logout}><LogOut size={16} />Cerrar sesión</button>
        </div>
      </aside>
      <div className="main-content">
        <header className="topbar">
          <button className="hamburger" onClick={() => setOpen(o => !o)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
          <h2>{title}</h2>
        </header>
        <main className="page-body">{children}</main>
      </div>
    </div>
  )
}
