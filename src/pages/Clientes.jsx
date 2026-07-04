// src/pages/Clientes.jsx
import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout.jsx'
import { useAuth, useToast } from '../lib/context.jsx'
import { getClientes, createCliente, updateCliente, deleteCliente, getUsuarios } from '../lib/db.js'
import { getVisitas, createVisita, uploadFotoCliente, getGPS } from '../lib/visitas.js'
import { Plus, Edit2, Trash2, Phone, MessageCircle, MapPin, X, User, Building2, Camera, Navigation, Clock, CheckCircle, Eye } from 'lucide-react'

const EMPTY = {
  tipo: 'empresa', nombre: '', rut: '', contacto: '', email: '',
  telefono: '', direccion: '', comuna: '', ciudad: '', observaciones: '',
  vendedor_id: null, imagen_url: '', latitud: null, longitud: null,
  username: '', password: '', canal: 'Ruta'
}

function fmt(ts) {
  return new Date(ts).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Clientes() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'
  const fileRef = useRef()

  const [clientes, setClientes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [fotoFile, setFotoFile] = useState(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  // Visitas
  const [visitaModal, setVisitaModal] = useState(null)
  const [visitas, setVisitas] = useState([])
  const [visitaForm, setVisitaForm] = useState({ tipo: 'visita', notas: '' })
  const [visitaSaving, setVisitaSaving] = useState(false)
  const [fotoVisita, setFotoVisita] = useState(null)
  const [fotoVisitaFile, setFotoVisitaFile] = useState(null)
  const fotoVisitaRef = useRef()

  const [filters, setFilters] = useState({ nombre: '', rut: '', comuna: '', tipo: '', vendedor_id: '' })

  async function load() {
    setLoading(true)
    const f = { ...filters }
    if (!isAdmin) f.vendedor_id = user.id
    try {
      const data = await getClientes(f)
      console.log('Clientes cargados:', data?.length, data)
      setClientes(data || [])
    } catch(e) {
      console.error('Error cargando clientes:', e)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [filters])
  useEffect(() => {
    if (isAdmin) getUsuarios().then(u => setUsuarios(u.filter(x => x.role === 'vendedor' || x.role === 'admin')))
  }, [])

  function openCreate() {
    setForm({ ...EMPTY, vendedor_id: user.id })
    setFotoPreview(null); setFotoFile(null)
    setModal('create')
  }
  function openEdit(c) {
    setForm({ ...c })
    setFotoPreview(c.imagen_url || null); setFotoFile(null)
    setSelected(c); setModal('edit')
  }
  function openDelete(c) { setSelected(c); setModal('delete') }

  async function openVisitas(c) {
    setSelected(c)
    const v = await getVisitas({ cliente_id: c.id })
    setVisitas(v)
    setVisitaForm({ tipo: 'visita', notas: '' })
    setFotoVisita(null); setFotoVisitaFile(null)
    setVisitaModal('list')
  }

  function handleFotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setFotoFile(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  function handleFotoVisitaChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setFotoVisitaFile(file)
    setFotoVisita(URL.createObjectURL(file))
  }

  async function captureGPS() {
    setGpsLoading(true)
    const pos = await getGPS()
    setGpsLoading(false)
    if (pos) {
      setForm(f => ({ ...f, latitud: pos.latitud, longitud: pos.longitud }))
      toast('Ubicación capturada ✓', 'success')
    } else {
      toast('No se pudo obtener ubicación. Verifica permisos.', 'error')
    }
  }

  async function handleSave() {
    if (!form.nombre.trim()) { toast('El nombre es obligatorio', 'error'); return }
    setSaving(true)
    try {
      const vendedor_id = isAdmin ? (form.vendedor_id || user.id) : user.id
      let imagen_url = form.imagen_url || ''

      if (modal === 'create') {
        const createData = { ...form, vendedor_id, imagen_url }
        if (!createData.username) delete createData.username
        if (!createData.password) delete createData.password
        const nuevo = await createCliente(createData)
        if (fotoFile && nuevo?.id) {
          const url = await uploadFotoCliente(nuevo.id, fotoFile)
          if (url) await updateCliente(nuevo.id, { imagen_url: url })
        }
        toast('Cliente creado', 'success')
      } else {
        if (fotoFile) {
          const url = await uploadFotoCliente(selected.id, fotoFile)
          if (url) imagen_url = url
        }
        const updateData = { ...form, vendedor_id, imagen_url }
        if (!updateData.username) delete updateData.username
        if (!updateData.password) delete updateData.password
        await updateCliente(selected.id, updateData)
        toast('Cliente actualizado', 'success')
      }
      setModal(null); load()
    } catch (e) { toast('Error al guardar', 'error') }
    setSaving(false)
  }

  async function handleDelete() {
    setSaving(true)
    await deleteCliente(selected.id)
    toast('Cliente eliminado', 'success')
    setSaving(false); setModal(null); load()
  }

  async function handleCheckin() {
    setVisitaSaving(true)
    try {
      const pos = await getGPS()
      let imagen_url = ''
      if (fotoVisitaFile) {
        imagen_url = await uploadFotoCliente(`visita_${selected.id}`, fotoVisitaFile) || ''
      }
      await createVisita({
        cliente_id: selected.id,
        cliente_nombre: selected.nombre,
        vendedor_id: user.id,
        vendedor_nombre: user.nombre,
        tipo: visitaForm.tipo,
        notas: visitaForm.notas,
        imagen_url,
        latitud: pos?.latitud || null,
        longitud: pos?.longitud || null,
      })
      toast('Visita registrada ✓', 'success')
      const v = await getVisitas({ cliente_id: selected.id })
      setVisitas(v)
      setVisitaForm({ tipo: 'visita', notas: '' })
      setFotoVisita(null); setFotoVisitaFile(null)
      setVisitaModal('list')
    } catch (e) { toast('Error al registrar', 'error') }
    setVisitaSaving(false)
  }

  function fmtTel(t) {
    if (!t) return ''
    return t.startsWith('+') ? t : '+569' + t.replace(/\D/g, '').slice(-8)
  }

  const tipoColor = { visita: 'badge-blue', pedido: 'badge-green', sin_venta: 'badge-yellow' }
  const tipoLabel = { visita: 'Visita', pedido: 'Con pedido', sin_venta: 'Sin venta' }

  return (
    <Layout title="Clientes">
      <div className="page-header">
        <h2>Clientes <span className="badge badge-green" style={{ fontSize: '.75rem', marginLeft: 8 }}>{clientes.length}</span></h2>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Nuevo Cliente</button>
      </div>

      {/* Filtros */}
      <div className="filters-bar">
        <div className="form-group">
          <label>Buscar nombre</label>
          <input className="form-control" placeholder="Nombre o razón social..." value={filters.nombre}
            onChange={e => setFilters(f => ({ ...f, nombre: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>RUT</label>
          <input className="form-control" placeholder="12.345.678-9" value={filters.rut}
            onChange={e => setFilters(f => ({ ...f, rut: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Comuna</label>
          <input className="form-control" placeholder="Comuna..." value={filters.comuna}
            onChange={e => setFilters(f => ({ ...f, comuna: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Tipo</label>
          <select className="form-control" value={filters.tipo}
            onChange={e => setFilters(f => ({ ...f, tipo: e.target.value }))}>
            <option value="">Todos</option>
            <option value="empresa">Empresa</option>
            <option value="persona">Persona</option>
          </select>
        </div>
        {isAdmin && (
          <div className="form-group">
            <label>Vendedor</label>
            <select className="form-control" value={filters.vendedor_id}
              onChange={e => setFilters(f => ({ ...f, vendedor_id: e.target.value }))}>
              <option value="">Todos</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ nombre: '', rut: '', comuna: '', tipo: '', vendedor_id: '' })}>
          <X size={14} /> Limpiar
        </button>
      </div>

      {/* Tabla */}
      <div className="table-wrap mobile-cards">
        {loading ? (
          <div className="empty-state"><p>Cargando...</p></div>
        ) : clientes.length === 0 ? (
          <div className="empty-state"><User size={40} /><p>No hay clientes</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Foto</th>
                <th>Tipo</th>
                <th>Nombre / Razón Social</th>
                <th>RUT</th>
                <th>Teléfono</th>
                <th>Comuna</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.id}>
                  <td data-label="Foto">
                    {c.imagen_url ? (
                      <img src={c.imagen_url} alt="local"
                        style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', cursor: 'pointer', border: '2px solid var(--border)' }}
                        onClick={() => window.open(c.imagen_url, '_blank')} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Camera size={18} color="var(--green)" />
                      </div>
                    )}
                  </td>
                  <td data-label="Tipo">
                    <span className={`badge ${c.tipo === 'empresa' ? 'badge-blue' : 'badge-yellow'}`}>
                      {c.tipo === 'empresa' ? <Building2 size={11} /> : <User size={11} />}{' '}{c.tipo}
                    </span>
                  </td>
                  <td data-label="Nombre">
                    <strong>{c.nombre}</strong>
                    {c.contacto && <div className="text-xs text-muted">{c.contacto}</div>}
                    {c.latitud && <div className="text-xs" style={{ color: 'var(--green)' }}>📍 GPS registrado</div>}
                  </td>
                  <td data-label="RUT" className="text-mono">{c.rut || '—'}</td>
                  <td data-label="Teléfono">
                    {c.telefono && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a href={`tel:${fmtTel(c.telefono)}`} className="btn btn-ghost btn-sm btn-icon"><Phone size={14} /></a>
                        <a href={`https://wa.me/${fmtTel(c.telefono).replace('+', '')}`} target="_blank" rel="noreferrer"
                          className="btn btn-ghost btn-sm btn-icon" style={{ color: '#25d366' }}><MessageCircle size={14} /></a>
                        <span style={{ fontSize: '.85rem', alignSelf: 'center' }}>{c.telefono}</span>
                      </div>
                    )}
                  </td>
                  <td data-label="Comuna">{c.comuna || '—'}</td>
                  <td data-label="Acciones">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {c.direccion && (
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.direccion} ${c.comuna} ${c.ciudad}`)}`}
                          target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm btn-icon" title="Google Maps">
                          <MapPin size={14} />
                        </a>
                      )}
                      <button className="btn btn-secondary btn-sm btn-icon" title="Ver visitas" onClick={() => openVisitas(c)}>
                        <Clock size={14} />
                      </button>
                      <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(c)}><Edit2 size={14} /></button>
                      {isAdmin && (
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => openDelete(c)}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODAL CREATE/EDIT ── */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <h3>{modal === 'create' ? 'Nuevo Cliente' : 'Editar Cliente'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Foto del local */}
              <div className="form-group">
                <label>Foto del Local / Negocio</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    onClick={() => fileRef.current.click()}
                    style={{
                      width: 100, height: 100, borderRadius: 10,
                      border: '2px dashed var(--border)',
                      cursor: 'pointer', overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--bg)', flexShrink: 0,
                      transition: 'border-color .18s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--green)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    {fotoPreview ? (
                      <img src={fotoPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <Camera size={24} color="var(--text-secondary)" />
                        <div className="text-xs text-muted" style={{ marginTop: 4 }}>Agregar foto</div>
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()} style={{ marginBottom: 8 }}>
                      <Camera size={14} /> {fotoPreview ? 'Cambiar foto' : 'Tomar / subir foto'}
                    </button>
                    <div className="text-xs text-muted">Acepta JPG, PNG. Se guarda en Supabase Storage.</div>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFotoChange} style={{ display: 'none' }} />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Tipo</label>
                  <select className="form-control" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                    <option value="empresa">Empresa</option>
                    <option value="persona">Persona</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>RUT</label>
                  <input className="form-control" value={form.rut} placeholder="12.345.678-9"
                    onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>{form.tipo === 'empresa' ? 'Razón Social' : 'Nombre Completo'} *</label>
                <input className="form-control" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              {form.tipo === 'empresa' && (
                <div className="form-group">
                  <label>Contacto</label>
                  <input className="form-control" value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} />
                </div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label>Email</label>
                  <input className="form-control" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input className="form-control" value={form.telefono} placeholder="9 XXXX XXXX"
                    onFocus={e => { if (!e.target.value) setForm(f => ({ ...f, telefono: '+569' })) }}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Dirección</label>
                <input className="form-control" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Comuna</label>
                  <input className="form-control" value={form.comuna} onChange={e => setForm(f => ({ ...f, comuna: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Ciudad</label>
                  <input className="form-control" value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
                </div>
              </div>

              {/* GPS */}
              <div className="form-group">
                <label>Ubicación GPS</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={captureGPS} disabled={gpsLoading}>
                    <Navigation size={14} /> {gpsLoading ? 'Obteniendo...' : 'Capturar ubicación actual'}
                  </button>
                  {form.latitud && (
                    <span className="text-xs" style={{ color: 'var(--green)' }}>
                      ✓ {Number(form.latitud).toFixed(5)}, {Number(form.longitud).toFixed(5)}
                    </span>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>Observaciones</label>
                <textarea className="form-control" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
              </div>

              {/* Portal Cliente */}
              <div style={{ background: '#fef0f0', border: '1.5px solid #fca5a5', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '.85rem', color: '#C0392B', marginBottom: 10 }}>
                  🛒 Acceso Portal Cliente (opcional)
                </div>
                <div className="grid-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Usuario</label>
                    <input className="form-control" value={form.username || ''} placeholder="ej: minimarket_juan"
                      onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Contraseña</label>
                    <input className="form-control" type="text" value={form.password || ''} placeholder="ej: 1234"
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 8 }}>
                  Si completas estos campos, el cliente podrá entrar al catálogo con su usuario y contraseña.
                </div>
              </div>
              {isAdmin && (
                <div className="form-group">
                  <label>Asignar a Vendedor</label>
                  <select className="form-control" value={form.vendedor_id || ''}
                    onChange={e => setForm(f => ({ ...f, vendedor_id: Number(e.target.value) || null }))}>
                    <option value="">Sin asignar</option>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DELETE ── */}
      {modal === 'delete' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Eliminar Cliente</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p>¿Eliminar a <strong>{selected?.nombre}</strong>? Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL VISITAS ── */}
      {visitaModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setVisitaModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div>
                <h3>Visitas — {selected?.nombre}</h3>
                <div className="text-xs text-muted">{visitas.length} visita{visitas.length !== 1 ? 's' : ''} registrada{visitas.length !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => setVisitaModal('new')}>
                  <Plus size={14} /> Registrar visita
                </button>
                <button className="btn btn-ghost btn-icon" onClick={() => setVisitaModal(null)}><X size={18} /></button>
              </div>
            </div>
            <div className="modal-body">
              {visitaModal === 'new' ? (
                <div>
                  <div className="form-group">
                    <label>Tipo de visita</label>
                    <select className="form-control" value={visitaForm.tipo} onChange={e => setVisitaForm(f => ({ ...f, tipo: e.target.value }))}>
                      <option value="visita">Visita sin pedido</option>
                      <option value="pedido">Con pedido</option>
                      <option value="sin_venta">Sin venta</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Foto del local (opcional)</label>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {fotoVisita && (
                        <img src={fotoVisita} alt="visita" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover' }} />
                      )}
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => fotoVisitaRef.current.click()}>
                        <Camera size={14} /> {fotoVisita ? 'Cambiar foto' : 'Tomar foto'}
                      </button>
                      <input ref={fotoVisitaRef} type="file" accept="image/*" capture="environment"
                        onChange={handleFotoVisitaChange} style={{ display: 'none' }} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Notas</label>
                    <textarea className="form-control" placeholder="Observaciones de la visita..."
                      value={visitaForm.notas} onChange={e => setVisitaForm(f => ({ ...f, notas: e.target.value }))} />
                  </div>
                  <div style={{ background: 'var(--green-light)', borderRadius: 8, padding: '10px 14px', fontSize: '.82rem', color: 'var(--green)' }}>
                    📍 Se registrará tu ubicación GPS automáticamente al guardar.
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button className="btn btn-secondary" onClick={() => setVisitaModal('list')}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleCheckin} disabled={visitaSaving}>
                      {visitaSaving ? <span className="spinner" /> : <><CheckCircle size={14} /> Registrar visita</>}
                    </button>
                  </div>
                </div>
              ) : (
                visitas.length === 0 ? (
                  <div className="empty-state"><Clock size={36} /><p>Sin visitas registradas</p></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {visitas.map(v => (
                      <div key={v.id} style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div>
                            <span className={`badge ${tipoColor[v.tipo] || 'badge-gray'}`}>{tipoLabel[v.tipo] || v.tipo}</span>
                            <span className="text-xs text-muted" style={{ marginLeft: 8 }}>{fmt(v.created_at)}</span>
                          </div>
                          <span className="text-xs text-muted">{v.vendedor_nombre}</span>
                        </div>
                        {v.notas && <p className="text-sm" style={{ marginBottom: 6 }}>{v.notas}</p>}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {v.latitud && (
                            <a href={`https://www.google.com/maps?q=${v.latitud},${v.longitud}`} target="_blank" rel="noreferrer"
                              className="btn btn-secondary btn-sm" style={{ fontSize: '.75rem' }}>
                              <MapPin size={12} /> Ver en mapa
                            </a>
                          )}
                          {v.imagen_url && (
                            <a href={v.imagen_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ fontSize: '.75rem' }}>
                              <Eye size={12} /> Ver foto
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
