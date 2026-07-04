// src/pages/Mapa.jsx
import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout.jsx'
import { useAuth, useToast } from '../lib/context.jsx'
import { getClientes, getUsuarios } from '../lib/db.js'
import { getVisitas } from '../lib/visitas.js'
import { MapPin, Users, Clock, RefreshCw, Eye, EyeOff, Camera } from 'lucide-react'

const GOOGLE_MAPS_KEY = 'AIzaSyDvWZmKtAMJ_3HuMvSl3xjsKFRCxTh0X8w'

const COLORES = [
  '#1a7f4b', '#2850b3', '#e53e3e', '#b07a00', '#0f766e',
  '#7c3aed', '#db2777', '#ea580c', '#65a30d', '#0284c7'
]

function fmt(ts) {
  return new Date(ts).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

function cargarGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) { resolve(window.google.maps); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`
    script.async = true
    script.onload = () => resolve(window.google.maps)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export default function Mapa() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const infoWindowRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState([])
  const [visitas, setVisitas] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [vendedorColors, setVendedorColors] = useState({})
  const [mapReady, setMapReady] = useState(false)

  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroFecha, setFiltroFecha] = useState(new Date().toISOString().split('T')[0])
  const [mostrarClientes, setMostrarClientes] = useState(true)
  const [mostrarVisitas, setMostrarVisitas] = useState(true)
  const [stats, setStats] = useState({ clientes: 0, visitas: 0 })

  useEffect(() => {
    async function init() {
      try {
        await cargarGoogleMaps(GOOGLE_MAPS_KEY)
        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: -33.45, lng: -70.65 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        })
        mapInstanceRef.current = map
        infoWindowRef.current = new window.google.maps.InfoWindow()
        setMapReady(true)
        await loadData()
      } catch (e) {
        toast('Error al cargar el mapa', 'error')
        setLoading(false)
      }
    }
    init()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [cs, us] = await Promise.all([
        getClientes(isAdmin ? {} : { vendedor_id: user.id }),
        isAdmin ? getUsuarios() : Promise.resolve([user])
      ])
      const colors = {}
      us.forEach((u, i) => { colors[u.id] = COLORES[i % COLORES.length] })
      const vs = await getVisitas(isAdmin ? {} : { vendedor_id: user.id })
      
      const clientesConGPS = cs.filter(c => c.latitud && c.longitud)
      const visitasConGPS = vs.filter(v => v.latitud && v.longitud)
      
      console.log('Clientes totales:', cs.length, 'Con GPS:', clientesConGPS.length)
      console.log('Visitas totales:', vs.length, 'Con GPS:', visitasConGPS.length)
      
      setVendedorColors(colors)
      setUsuarios(us)
      setClientes(cs)
      setVisitas(vs)
      setStats({
        clientes: clientesConGPS.length,
        visitas: visitasConGPS.length,
      })
      
      // Forzar actualización de marcadores después de que los datos lleguen
      if (mapInstanceRef.current && window.google) {
        setTimeout(() => actualizarMarcadoresConDatos(cs, vs, colors), 100)
      }
    } catch (e) {
      console.error('loadData error:', e)
      toast('Error al cargar datos', 'error')
    }
    setLoading(false)
  }

  function actualizarMarcadoresConDatos(cs, vs, colors) {
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    const map = mapInstanceRef.current
    if (!map) return
    const bounds = new window.google.maps.LatLngBounds()
    let hayPuntos = false

    cs.filter(c => c.latitud && c.longitud)
      .forEach(c => {
        const color = colors[c.vendedor_id] || '#1a7f4b'
        const marker = new window.google.maps.Marker({
          position: { lat: Number(c.latitud), lng: Number(c.longitud) },
          map,
          title: c.nombre,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          zIndex: 10,
        })
        marker.addListener('click', () => {
          infoWindowRef.current.setContent(`
            <div style="font-family:sans-serif;min-width:200px;padding:4px">
              ${c.imagen_url ? `<img src="${c.imagen_url}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px"/>` : ''}
              <div style="font-weight:700;font-size:14px;margin-bottom:4px">🏪 ${c.nombre}</div>
              <div style="font-size:12px;color:#666;margin-bottom:2px">📍 ${c.direccion || ''} ${c.comuna || ''}</div>
              ${c.telefono ? `<div style="font-size:12px;color:#666">📞 ${c.telefono}</div>` : ''}
              <div style="margin-top:8px">
                <a href="https://www.google.com/maps?q=${c.latitud},${c.longitud}" target="_blank"
                  style="background:#1a7f4b;color:#fff;padding:4px 10px;border-radius:6px;text-decoration:none;font-size:12px">
                  Ver en Maps
                </a>
              </div>
            </div>
          `)
          infoWindowRef.current.open(map, marker)
        })
        markersRef.current.push(marker)
        bounds.extend({ lat: Number(c.latitud), lng: Number(c.longitud) })
        hayPuntos = true
      })

    if (hayPuntos) {
      map.fitBounds(bounds)
      if (markersRef.current.length === 1) map.setZoom(15)
    }
  }

  useEffect(() => {
    if (!mapReady || !window.google) return
    actualizarMarcadores()
  }, [clientes, visitas, filtroVendedor, filtroFecha, mostrarClientes, mostrarVisitas, mapReady, vendedorColors])

  function actualizarMarcadores() {
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    const map = mapInstanceRef.current
    const bounds = new window.google.maps.LatLngBounds()
    let hayPuntos = false

    // CLIENTES
    if (mostrarClientes) {
      clientes
        .filter(c => {
          if (!c.latitud || !c.longitud) return false
          if (filtroVendedor && String(c.vendedor_id) !== String(filtroVendedor)) return false
          return true
        })
        .forEach(c => {
          const color = vendedorColors[c.vendedor_id] || '#1a7f4b'
          const marker = new window.google.maps.Marker({
            position: { lat: Number(c.latitud), lng: Number(c.longitud) },
            map,
            title: c.nombre,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
            zIndex: 10,
          })

          const vendNombre = usuarios.find(u => u.id === c.vendedor_id)?.nombre || '—'
          marker.addListener('click', () => {
            infoWindowRef.current.setContent(`
              <div style="font-family:sans-serif;min-width:200px;padding:4px">
                ${c.imagen_url ? `<img src="${c.imagen_url}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px"/>` : ''}
                <div style="font-weight:700;font-size:14px;margin-bottom:4px">🏪 ${c.nombre}</div>
                <div style="font-size:12px;color:#666;margin-bottom:2px">📍 ${c.direccion || ''} ${c.comuna || ''}</div>
                <div style="font-size:12px;color:#666;margin-bottom:2px">👤 Vendedor: ${vendNombre}</div>
                ${c.telefono ? `<div style="font-size:12px;color:#666">📞 ${c.telefono}</div>` : ''}
                <div style="margin-top:8px">
                  <a href="https://www.google.com/maps?q=${c.latitud},${c.longitud}" target="_blank"
                    style="background:#1a7f4b;color:#fff;padding:4px 10px;border-radius:6px;text-decoration:none;font-size:12px">
                    Ver en Maps
                  </a>
                </div>
              </div>
            `)
            infoWindowRef.current.open(map, marker)
          })

          markersRef.current.push(marker)
          bounds.extend({ lat: Number(c.latitud), lng: Number(c.longitud) })
          hayPuntos = true
        })
    }

    // VISITAS
    if (mostrarVisitas) {
      const hoy = filtroFecha

      visitas
        .filter(v => {
          if (!v.latitud || !v.longitud) return false
          if (filtroVendedor && String(v.vendedor_id) !== String(filtroVendedor)) return false
          if (hoy && !v.created_at?.startsWith(hoy)) return false
          return true
        })
        .forEach((v, idx) => {
          const color = vendedorColors[v.vendedor_id] || '#2850b3'
          const tipoIcon = { visita: '👁️', pedido: '🛒', sin_venta: '❌' }
          const marker = new window.google.maps.Marker({
            position: { lat: Number(v.latitud), lng: Number(v.longitud) },
            map,
            title: `Visita: ${v.cliente_nombre}`,
            icon: {
              path: 'M 0,-10 L 6,6 L 0,2 L -6,6 Z',
              scale: 1.2,
              fillColor: color,
              fillOpacity: 0.85,
              strokeColor: '#ffffff',
              strokeWeight: 1.5,
              rotation: 0,
            },
            zIndex: 5,
            label: {
              text: String(idx + 1),
              color: '#fff',
              fontSize: '10px',
              fontWeight: 'bold',
            }
          })

          marker.addListener('click', () => {
            infoWindowRef.current.setContent(`
              <div style="font-family:sans-serif;min-width:200px;padding:4px">
                ${v.imagen_url ? `<img src="${v.imagen_url}" style="width:100%;height:100px;object-fit:cover;border-radius:8px;margin-bottom:8px"/>` : ''}
                <div style="font-weight:700;font-size:14px;margin-bottom:4px">${tipoIcon[v.tipo] || '📍'} ${v.cliente_nombre}</div>
                <div style="font-size:12px;color:#666;margin-bottom:2px">👤 ${v.vendedor_nombre}</div>
                <div style="font-size:12px;color:#666;margin-bottom:2px">🕐 ${fmt(v.created_at)}</div>
                <div style="display:inline-block;background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;margin-top:4px">
                  ${v.tipo === 'visita' ? 'Visita' : v.tipo === 'pedido' ? 'Con pedido' : 'Sin venta'}
                </div>
                ${v.notas ? `<div style="font-size:12px;margin-top:6px;color:#444">"${v.notas}"</div>` : ''}
                <div style="margin-top:8px">
                  <a href="https://www.google.com/maps?q=${v.latitud},${v.longitud}" target="_blank"
                    style="background:#2850b3;color:#fff;padding:4px 10px;border-radius:6px;text-decoration:none;font-size:12px">
                    Ver ubicación
                  </a>
                </div>
              </div>
            `)
            infoWindowRef.current.open(map, marker)
          })

          markersRef.current.push(marker)
          bounds.extend({ lat: Number(v.latitud), lng: Number(v.longitud) })
          hayPuntos = true
        })
    }

    if (hayPuntos && markersRef.current.length > 0) {
      map.fitBounds(bounds)
      if (markersRef.current.length === 1) map.setZoom(15)
    }
  }

  return (
    <Layout title="Mapa de Vendedores">
      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        {[
          { label: 'Clientes con GPS', value: stats.clientes, icon: MapPin, color: '#1a7f4b', bg: '#e8f5ee' },
          { label: 'Visitas con GPS', value: stats.visitas, icon: Clock, color: '#2850b3', bg: '#e8f0ff' },
          { label: 'Vendedores', value: usuarios.length, icon: Users, color: '#b07a00', bg: '#fff8e6' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className="stat-icon" style={{ background: bg }}><Icon size={20} color={color} /></div>
            <div><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 12, boxShadow: 'var(--shadow)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        {isAdmin && (
          <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
            <label>Vendedor</label>
            <select className="form-control" value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="">Todos</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
          <label>Fecha visitas</label>
          <input className="form-control" type="date" value={filtroFecha}
            onChange={e => setFiltroFecha(e.target.value)} />
        </div>
        <button className={`btn btn-sm ${mostrarClientes ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMostrarClientes(v => !v)}>
          {mostrarClientes ? <Eye size={14} /> : <EyeOff size={14} />} Clientes
        </button>
        <button className={`btn btn-sm ${mostrarVisitas ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMostrarVisitas(v => !v)}>
          {mostrarVisitas ? <Eye size={14} /> : <EyeOff size={14} />} Visitas
        </button>
        <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Leyenda vendedores */}
      {isAdmin && usuarios.length > 0 && (
        <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 12, boxShadow: 'var(--shadow)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {usuarios.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: vendedorColors[u.id] || '#ccc' }} />
              <span className="text-sm">{u.nombre}</span>
            </div>
          ))}
          <span className="text-xs text-muted" style={{ alignSelf: 'center' }}>● Clientes &nbsp; ▲ Visitas</span>
        </div>
      )}

      {/* Mapa */}
      <div style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, borderRadius: 'var(--radius)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div className="spinner" style={{ borderColor: 'rgba(26,127,75,.3)', borderTopColor: 'var(--green)', width: 36, height: 36, borderWidth: 3 }} />
              <p className="text-sm text-muted" style={{ marginTop: 10 }}>Cargando mapa...</p>
            </div>
          </div>
        )}
        <div ref={mapRef} style={{ width: '100%', height: 'calc(100vh - 340px)', minHeight: 400 }} />
      </div>

      {/* Info sin GPS */}
      {!loading && stats.clientes === 0 && stats.visitas === 0 && (
        <div style={{ background: '#fff8e6', border: '1px solid #f0c040', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <p style={{ fontWeight: 600, color: '#b07a00', marginBottom: 4 }}>⚠️ Sin datos GPS</p>
          <p className="text-sm text-muted">Para ver puntos en el mapa, los clientes deben tener ubicación GPS registrada. Usa el botón "Capturar ubicación" al crear o editar un cliente, o registra visitas con GPS desde la ficha del cliente.</p>
        </div>
      )}
    </Layout>
  )
}
