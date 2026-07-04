import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, ToastProvider, useAuth } from './lib/context.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Clientes from './pages/Clientes.jsx'
import Rutas from './pages/Rutas.jsx'
import Catalogo from './pages/Catalogo.jsx'
import Ventas from './pages/Ventas.jsx'
import Mapa from './pages/Mapa.jsx'
import Reportes from './pages/Reportes.jsx'
import Configuracion from './pages/Configuracion.jsx'
import PortalCliente from './pages/PortalCliente.jsx'
import PedidosCliente from './pages/PedidosCliente.jsx'
import './styles/global.css'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'cliente') return <Navigate to="/portal" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/clientes" element={<PrivateRoute><Clientes /></PrivateRoute>} />
      <Route path="/rutas" element={<PrivateRoute><Rutas /></PrivateRoute>} />
      <Route path="/catalogo" element={<PrivateRoute><Catalogo /></PrivateRoute>} />
      <Route path="/ventas" element={<PrivateRoute><Ventas /></PrivateRoute>} />
      <Route path="/ventas/nueva" element={<PrivateRoute><Ventas /></PrivateRoute>} />
      <Route path="/mapa" element={<PrivateRoute><Mapa /></PrivateRoute>} />
      <Route path="/reportes" element={<PrivateRoute><Reportes /></PrivateRoute>} />
      <Route path="/configuracion" element={<PrivateRoute><Configuracion /></PrivateRoute>} />
      <Route path="/portal" element={user?.role === 'cliente' ? <PortalCliente /> : <Navigate to="/" replace />} />
      <Route path="/pedidos-cliente" element={<PrivateRoute><PedidosCliente /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  )
}
