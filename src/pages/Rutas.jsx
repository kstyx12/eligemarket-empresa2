// src/pages/Rutas.jsx
import { useState, useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import { useAuth, useToast } from '../lib/context.jsx'
import { getRutas, createRuta, updateRuta, deleteRuta, setRutaClientes, getClientes, getUsuarios } from '../lib/db.js'
import { Plus, Edit2, Trash2, MapPin, X, Users, ChevronDown, ChevronUp } from 'lucide-react'

const EMPTY = { nombre: '', descripcion: '', vendedor_id: null }

export default function Rutas() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const [rutas, setRutas] = useState([])
  const [clientes, setClientes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [selClientes, setSelClientes] = useState([])
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)

  async function load() {
    setLoading(true)
    const [r, c, u] = await Promise.all([
      getRutas(isAdmin ? null : user.id),
      getClientes(isAdmin ? {} : { vendedor_id: user.id }),
      isAdmin ? getUsuarios() : Promise.resolve([])
    ])
    setRutas(r)
    setClientes(c)
    setUsuarios(u.filter(x => x.role === 'vendedor' || x.role === 'admin'))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openCreate() {
    setForm({ ...EMPTY, vendedor_id: user.id })
    setSelClientes([])
    setSelected(null)
    setModal('form')
  }
  function openEdit(r) {
    setForm({ nombre: r.nombre, descripcion: r.descripcion || '', vendedor_id: r.vendedor_id })
    const ids = (r.ruta_clientes || []).map(rc => rc.cliente_id)
    setSelClientes(ids)
    setSelected(r)
    setModal('form')
  }
  function openDelete(r) { setSelected(r); setModal('delete') }

  async function handleSave() {
    if (!form.nombre.trim()) { toast('El nombre es obligatorio', 'error'); return }
    setSaving(true)
    try {
      const vendedor_id = isAdmin ? (form.vendedor_id || user.id) : user.id
      let ruta
      if (!selected) {
        ruta = await createRuta({ ...form, vendedor_id })
      } else {
        ruta = await updateRuta(selected.id, { ...form, vendedor_id })
      }
      await setRutaClientes(ruta.id || selected.id, selClientes)
      toast(selected ? 'Ruta actualizada' : 'Ruta creada', 'success')
      setModal(null)
      load()
    } catch (e) { toast('Error al guardar', 'error') }
    setSaving(false)
  }

  async function handleDelete() {
    setSaving(true)
    await deleteRuta(selected.id)
    toast('Ruta eliminada', 'success')
    setSaving(false); setModal(null); load()
  }

  function toggleCliente(id) {
    setSelClientes(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  return (
    <Layout title="Rutas">
      <div className="page-header">
        <h2>Rutas <span className="badge badge-green" style={{ fontSize: '.75rem', marginLeft: 8 }}>{rutas.length}</span></h2>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Nueva Ruta</button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Cargando...</p></div>
      ) : rutas.length === 0 ? (
        <div className="table-wrap"><div className="empty-state"><MapPin size={40} /><p>No hay rutas</p></div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rutas.map(r => {
            const clientesRuta = (r.ruta_clientes || []).filter(rc => rc.clientes)
            const isOpen = expanded === r.id
            return (
              <div key={r.id} className="table-wrap" style={{ overflow: 'visible' }}>
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'var(--green-light)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MapPin size={18} color="var(--green)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{r.nombre}</div>
                      <div className="text-xs text-muted">{r.descripcion}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge badge-blue">
                      <Users size={11} /> {clientesRuta.length} cliente{clientesRuta.length !== 1 ? 's' : ''}
                    </span>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setExpanded(isOpen ? null : r.id)}>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(r)}><Edit2 size={14} /></button>
                    {isAdmin && <button className="btn btn-danger btn-sm btn-icon" onClick={() => openDelete(r)}><Trash2 size={14} /></button>}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--border)' }}>
                    {clientesRuta.length === 0 ? (
                      <p className="text-muted text-sm" style={{ padding: '12px 0' }}>Sin clientes asignados</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 12 }}>
                        {clientesRuta.map(rc => (
                          <span key={rc.cliente_id} className="badge badge-gray">
                            {rc.clientes?.nombre}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Form */}
      {modal === 'form' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>{selected ? 'Editar Ruta' : 'Nueva Ruta'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Nombre de la Ruta *</label>
                <input className="form-control" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <input className="form-control" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              {isAdmin && (
                <div className="form-group">
                  <label>Vendedor</label>
                  <select className="form-control" value={form.vendedor_id || ''} onChange={e => setForm(f => ({ ...f, vendedor_id: Number(e.target.value) }))}>
                    <option value="">Sin asignar</option>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Clientes en esta ruta ({selClientes.length} seleccionados)</label>
                <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, maxHeight: 220, overflowY: 'auto', padding: 4 }}>
                  {clientes.length === 0 ? (
                    <p className="text-muted text-sm" style={{ padding: 12 }}>No hay clientes disponibles</p>
                  ) : clientes.map(c => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer', borderRadius: 6, transition: 'background .12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--green-light)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <input type="checkbox" checked={selClientes.includes(c.id)} onChange={() => toggleCliente(c.id)} />
                      <span style={{ fontSize: '.88rem' }}>{c.nombre}</span>
                      {c.comuna && <span className="text-xs text-muted">· {c.comuna}</span>}
                    </label>
                  ))}
                </div>
              </div>
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

      {modal === 'delete' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>Eliminar Ruta</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p>¿Eliminar la ruta <strong>{selected?.nombre}</strong>?</p>
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
    </Layout>
  )
}
