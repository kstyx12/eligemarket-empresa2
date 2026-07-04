// src/pages/Configuracion.jsx
import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout.jsx'
import { useAuth, useToast } from '../lib/context.jsx'
import { checkSupabaseConnection, getUsuarios, createUsuario, getClientes, getVentas, getProductos, updateProducto, createProducto } from '../lib/db.js'
import { changePassword } from '../lib/auth.js'
import { Settings, Wifi, RefreshCw, User, Key, Plus, Download, X, Check, Upload, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { SUPABASE_URL } from '../lib/supabase.js'

function exportCSV(data, filename) {
  if (!data.length) return
  const keys = Object.keys(data[0])
  const csv = [keys.join(','), ...data.map(row => keys.map(k => {
    const v = row[k] ?? ''
    return typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))
      ? `"${v.replace(/"/g, '""')}"` : v
  }).join(','))].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ── IMPORTADOR EXCEL ──────────────────────────────────────────────────────────
function ImportadorExcel() {
  const toast = useToast()
  const fileRef = useRef()
  const [preview, setPreview] = useState([])
  const [headers, setHeaders] = useState([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  // Mapeo de columnas del Excel → campos de la BD
  const COLUMN_MAP = {
    'codigo': 'codigo',
    'código': 'codigo',
    'code': 'codigo',
    'descripcion': 'descripcion',
    'descripción': 'descripcion',
    'description': 'descripcion',
    'nombre': 'descripcion',
    'categoria': 'categoria',
    'categoría': 'categoria',
    'category': 'categoria',
    'rol': 'rol',
    'role': 'rol',
    'precio': 'precio_venta',
    'precio_venta': 'precio_venta',
    'price': 'precio_venta',
    'costo': 'costo',
    'cost': 'costo',
    'margen': 'margen',
    'margin': 'margen',
    'precio_volumen': 'precio_volumen',
    'precio volumen': 'precio_volumen',
    'volumen_minimo': 'volumen_minimo',
    'volumen minimo': 'volumen_minimo',
    'volumen mínimo': 'volumen_minimo',
    'unidades_caja': 'unidades_caja',
    'unidades caja': 'unidades_caja',
    'unidades por caja': 'unidades_caja',
    'activo': 'activo',
    'active': 'activo',
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true)
    setPreview([])
    setResult(null)

    try {
      const { read, utils } = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm')
      const buffer = await file.arrayBuffer()
      const wb = read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = utils.sheet_to_json(ws, { header: 1, defval: '' })

      if (data.length < 2) { toast('El archivo está vacío', 'error'); setLoading(false); return }

      const rawHeaders = data[0].map(h => String(h).trim().toLowerCase())
      setHeaders(rawHeaders)

      const rows = data.slice(1).filter(row => row.some(cell => cell !== ''))
      const mapped = rows.map(row => {
        const obj = {}
        rawHeaders.forEach((h, i) => {
          const field = COLUMN_MAP[h]
          if (field) obj[field] = row[i]
        })
        return obj
      }).filter(r => r.descripcion || r.codigo)

      setPreview(mapped.slice(0, 5))
      setLoading(false)

      if (mapped.length === 0) {
        toast('No se encontraron productos válidos. Verifica los nombres de columnas.', 'error')
        return
      }

      toast(`${mapped.length} productos listos para importar`, 'success')

      // Guardar para importar
      fileRef.current._parsedData = mapped
    } catch (err) {
      toast('Error al leer el archivo: ' + err.message, 'error')
      setLoading(false)
    }
  }

  async function handleImport() {
    const data = fileRef.current?._parsedData
    if (!data?.length) { toast('Primero carga un archivo', 'error'); return }

    setImporting(true)
    let creados = 0, actualizados = 0, errores = 0

    for (const row of data) {
      try {
        const producto = {
          codigo: String(row.codigo || '').trim(),
          descripcion: String(row.descripcion || '').trim(),
          categoria: String(row.categoria || 'Sin categoría').trim(),
          rol: String(row.rol || 'COMPLEMENTO').trim(),
          precio_venta: Number(row.precio_venta) || 0,
          costo: Number(row.costo) || 0,
          margen: Number(row.margen) || 0.86,
          precio_volumen: Number(row.precio_volumen) || 0,
          volumen_minimo: Number(row.volumen_minimo) || 6,
          unidades_caja: Number(row.unidades_caja) || 12,
          activo: row.activo === false || row.activo === 'false' || row.activo === 0 ? false : true,
        }

        if (!producto.descripcion) { errores++; continue }

        // Buscar si existe por código
        const existentes = await import('../lib/db.js').then(m => m.getProductos({ codigo: producto.codigo }))
        if (existentes?.length > 0 && producto.codigo) {
          await updateProducto(existentes[0].id, producto)
          actualizados++
        } else {
          await createProducto(producto)
          creados++
        }
      } catch (e) {
        errores++
      }
    }

    setImporting(false)
    setResult({ creados, actualizados, errores })
    toast(`Importación completa: ${creados} creados, ${actualizados} actualizados`, 'success')
    fileRef.current.value = ''
    fileRef.current._parsedData = null
    setPreview([])
  }

  return (
    <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 22, boxShadow: 'var(--shadow)', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <FileSpreadsheet size={18} color="var(--green)" />
        <h3 style={{ fontWeight: 700 }}>Importar Catálogo desde Excel</h3>
      </div>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Sube un archivo <strong>.xlsx</strong> o <strong>.csv</strong> con el catálogo. 
        Columnas recomendadas: <code style={{ background: '#f0f2f5', padding: '1px 5px', borderRadius: 3 }}>codigo, descripcion, categoria, rol, precio_venta, costo, unidades_caja</code>
      </p>

      {/* Zona de carga */}
      <label style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: '2px dashed var(--border)', borderRadius: 10, padding: '28px 20px',
        cursor: 'pointer', transition: 'all .18s', marginBottom: 16,
        background: 'var(--bg)'
      }}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--green)' }}
        onDragLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        onDrop={e => {
          e.preventDefault()
          e.currentTarget.style.borderColor = 'var(--border)'
          const f = e.dataTransfer.files[0]
          if (f) { fileRef.current.files = e.dataTransfer.files; handleFile({ target: { files: [f] } }) }
        }}
      >
        <Upload size={28} color="var(--green)" style={{ marginBottom: 8 }} />
        <span style={{ fontWeight: 600, fontSize: '.9rem' }}>Arrastra tu Excel aquí</span>
        <span className="text-xs text-muted">o haz clic para seleccionar</span>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile}
          style={{ display: 'none' }} />
      </label>

      {loading && <p className="text-muted text-sm">Leyendo archivo...</p>}

      {/* Preview */}
      {preview.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 8 }}>
            Vista previa (primeros {preview.length} productos):
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--green)', color: '#fff' }}>
                  {['Código', 'Descripción', 'Categoría', 'Rol', 'Precio', 'Costo'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--bg)' : '#fff' }}>
                    <td style={{ padding: '5px 10px' }}>{p.codigo || '—'}</td>
                    <td style={{ padding: '5px 10px' }}>{p.descripcion || '—'}</td>
                    <td style={{ padding: '5px 10px' }}>{p.categoria || '—'}</td>
                    <td style={{ padding: '5px 10px' }}>{p.rol || '—'}</td>
                    <td style={{ padding: '5px 10px' }}>${Number(p.precio_venta || 0).toLocaleString('es-CL')}</td>
                    <td style={{ padding: '5px 10px' }}>${Number(p.costo || 0).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted" style={{ marginTop: 6 }}>
            Total a importar: <strong>{fileRef.current?._parsedData?.length || 0} productos</strong> · 
            Si el código ya existe, se actualizará. Si no, se creará.
          </p>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div style={{ background: 'var(--green-light)', border: '1px solid var(--green)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>✅ Importación completada</div>
          <div className="text-sm">
            <span style={{ marginRight: 16 }}>✅ Creados: <strong>{result.creados}</strong></span>
            <span style={{ marginRight: 16 }}>🔄 Actualizados: <strong>{result.actualizados}</strong></span>
            {result.errores > 0 && <span style={{ color: 'var(--danger)' }}>❌ Errores: <strong>{result.errores}</strong></span>}
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
          {importing ? <><span className="spinner" /> Importando...</> : <><Upload size={15} /> Importar {fileRef.current?._parsedData?.length || 0} productos</>}
        </button>
      )}
    </div>
  )
}

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────────
export default function Configuracion() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const [conn, setConn] = useState(null)
  const [checkingConn, setCheckingConn] = useState(false)
  const [usuarios, setUsuarios] = useState([])

  const [pwForm, setPwForm] = useState({ old: '', new1: '', new2: '' })
  const [pwSaving, setPwSaving] = useState(false)

  const [nuevoUser, setNuevoUser] = useState({ username: '', password: '', nombre: '', role: 'vendedor' })
  const [userModal, setUserModal] = useState(false)
  const [userSaving, setUserSaving] = useState(false)

  useEffect(() => {
    checkConn()
    if (isAdmin) getUsuarios().then(setUsuarios)
  }, [])

  async function checkConn() {
    setCheckingConn(true)
    const ok = await checkSupabaseConnection()
    setConn(ok)
    setCheckingConn(false)
  }

  async function handleChangePw(e) {
    e.preventDefault()
    if (pwForm.new1 !== pwForm.new2) { toast('Las contraseñas no coinciden', 'error'); return }
    if (pwForm.new1.length < 4) { toast('Mínimo 4 caracteres', 'error'); return }
    setPwSaving(true)
    const ok = changePassword(user.username, pwForm.old, pwForm.new1)
    setPwSaving(false)
    if (ok) { toast('Contraseña actualizada', 'success'); setPwForm({ old: '', new1: '', new2: '' }) }
    else toast('Contraseña actual incorrecta', 'error')
  }

  async function handleNuevoUser() {
    if (!nuevoUser.username || !nuevoUser.password || !nuevoUser.nombre) { toast('Completa todos los campos', 'error'); return }
    setUserSaving(true)
    try {
      await createUsuario(nuevoUser)
      toast('Usuario creado', 'success')
      setUserModal(false)
      setNuevoUser({ username: '', password: '', nombre: '', role: 'vendedor' })
      getUsuarios().then(setUsuarios)
    } catch (e) { toast('Error al crear usuario', 'error') }
    setUserSaving(false)
  }

  async function exportClientes() {
    const data = await getClientes()
    exportCSV(data.map(c => ({
      id: c.id, tipo: c.tipo, nombre: c.nombre, rut: c.rut, contacto: c.contacto,
      email: c.email, telefono: c.telefono, direccion: c.direccion,
      comuna: c.comuna, ciudad: c.ciudad, observaciones: c.observaciones
    })), 'clientes_eligemarket.csv')
    toast('Clientes exportados', 'success')
  }

  async function exportVentas() {
    const data = await getVentas()
    exportCSV(data.map(v => ({
      id: v.id, cliente: v.clientes?.nombre || v.cliente_nombre,
      vendedor: v.vendedor_nombre, subtotal: v.subtotal,
      descuento: v.descuento_global, total: v.total,
      fecha: v.created_at?.split('T')[0]
    })), 'ventas_eligemarket.csv')
    toast('Ventas exportadas', 'success')
  }

  async function exportProductos() {
    const data = await getProductos({})
    exportCSV(data.map(p => ({
      codigo: p.codigo, descripcion: p.descripcion, categoria: p.categoria, rol: p.rol,
      precio_venta: p.precio_venta, costo: p.costo, margen: p.margen,
      precio_volumen: p.precio_volumen, volumen_minimo: p.volumen_minimo,
      unidades_caja: p.unidades_caja, activo: p.activo
    })), 'catalogo_eligemarket.csv')
    toast('Catálogo exportado', 'success')
  }

  const configured = !SUPABASE_URL.includes('TU_PROYECTO')

  return (
    <Layout title="Configuración">
      <div style={{ maxWidth: 700 }}>

        {/* Estado Supabase */}
        <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 22, boxShadow: 'var(--shadow)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Wifi size={18} color="var(--green)" />
            <h3 style={{ fontWeight: 700 }}>Conexión Supabase</h3>
          </div>
          {!configured ? (
            <div style={{ background: '#fff8e6', border: '1px solid #f0c040', borderRadius: 8, padding: 14 }}>
              <p style={{ fontWeight: 600, color: '#b07a00', marginBottom: 6 }}>⚠️ Supabase no configurado</p>
              <p className="text-sm text-muted">El sistema funciona en modo localStorage. Configura Supabase para sincronizar entre dispositivos.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className={`conn-badge ${conn === true ? 'online' : conn === false ? 'offline' : ''}`}>
                <span className={`conn-dot ${conn === true ? 'online' : 'offline'}`} />
                {checkingConn ? 'Verificando...' : conn === true ? 'Conectado' : conn === false ? 'Sin conexión' : 'Sin verificar'}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={checkConn} disabled={checkingConn}>
                <RefreshCw size={14} /> Verificar
              </button>
            </div>
          )}
        </div>

        {/* Importador Excel — SOLO ADMIN */}
        {isAdmin && <ImportadorExcel />}

        {/* Cambiar contraseña */}
        <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 22, boxShadow: 'var(--shadow)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Key size={18} color="var(--green)" />
            <h3 style={{ fontWeight: 700 }}>Cambiar Contraseña</h3>
          </div>
          <form onSubmit={handleChangePw}>
            <div className="form-group">
              <label>Contraseña Actual</label>
              <input className="form-control" type="password" value={pwForm.old} onChange={e => setPwForm(f => ({ ...f, old: e.target.value }))} required />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label>Nueva Contraseña</label>
                <input className="form-control" type="password" value={pwForm.new1} onChange={e => setPwForm(f => ({ ...f, new1: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Repetir Contraseña</label>
                <input className="form-control" type="password" value={pwForm.new2} onChange={e => setPwForm(f => ({ ...f, new2: e.target.value }))} required />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={pwSaving}>
              {pwSaving ? <span className="spinner" /> : <><Check size={15} /> Actualizar contraseña</>}
            </button>
          </form>
        </div>

        {/* Gestión usuarios */}
        {isAdmin && (
          <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 22, boxShadow: 'var(--shadow)', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <User size={18} color="var(--green)" />
                <h3 style={{ fontWeight: 700 }}>Gestión de Usuarios</h3>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setUserModal(true)}>
                <Plus size={14} /> Nuevo Usuario
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {usuarios.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{u.nombre}</div>
                    <div className="text-xs text-muted">@{u.username}</div>
                  </div>
                  <span className={`badge ${u.role === 'admin' ? 'badge-green' : 'badge-blue'}`}>{u.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exportación */}
        {isAdmin && (
          <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 22, boxShadow: 'var(--shadow)', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Download size={18} color="var(--green)" />
              <h3 style={{ fontWeight: 700 }}>Exportar Datos</h3>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={exportClientes}><Download size={15} /> Clientes CSV</button>
              <button className="btn btn-secondary" onClick={exportVentas}><Download size={15} /> Ventas CSV</button>
              <button className="btn btn-secondary" onClick={exportProductos}><Download size={15} /> Catálogo CSV</button>
            </div>
          </div>
        )}

        {/* Info sistema */}
        <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 22, boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Settings size={18} color="var(--green)" />
            <h3 style={{ fontWeight: 700 }}>Información del Sistema</h3>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              ['Versión', 'v1.0.0'],
              ['Plataforma', 'React 18 + Vite 5'],
              ['Base de datos', configured ? 'Supabase' : 'localStorage (offline)'],
              ['Usuario actual', `${user.nombre} (@${user.username})`],
              ['Rol', user.role]
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="text-muted text-sm">{k}</span>
                <span style={{ fontWeight: 600, fontSize: '.88rem' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal nuevo usuario */}
      {userModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setUserModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Nuevo Usuario</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setUserModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Nombre completo</label>
                <input className="form-control" value={nuevoUser.nombre} onChange={e => setNuevoUser(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Usuario</label>
                  <input className="form-control" value={nuevoUser.username} onChange={e => setNuevoUser(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Contraseña</label>
                  <input className="form-control" type="password" value={nuevoUser.password} onChange={e => setNuevoUser(f => ({ ...f, password: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Rol</label>
                <select className="form-control" value={nuevoUser.role} onChange={e => setNuevoUser(f => ({ ...f, role: e.target.value }))}>
                  <option value="vendedor">Vendedor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setUserModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleNuevoUser} disabled={userSaving}>
                {userSaving ? <span className="spinner" /> : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
