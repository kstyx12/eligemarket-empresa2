// src/pages/Catalogo.jsx
import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout.jsx'
import { useAuth, useToast } from '../lib/context.jsx'
import { uploadFotoProducto } from '../lib/visitas.js'
import { generarCatalogoPDF } from '../lib/pdfCatalogo.js'
import { getProductos, createProducto, updateProducto, deleteProducto } from '../lib/db.js'
import { Plus, Edit2, LayoutGrid, List, X, Package, Search, Download, Upload, Trash2, AlertTriangle, FileText } from 'lucide-react'

// Categorías cargadas dinámicamente desde productos
const ROLES = ['ANCLA DIARIA','ALTO VALOR','ALTA ROTACIÓN','COMPLEMENTO']

const EMPTY_P = {
  codigo: '', descripcion: '', categoria: 'Score Energy', rol: 'ALTA ROTACIÓN',
  precio_venta: '', costo: '', margen: 0.86, precio_volumen: '',
  volumen_minimo: 6, unidades_caja: 12, descripcion_detallada: '', activo: true
}

function fmt(n) { return '$' + Number(n || 0).toLocaleString('es-CL') }

export default function Catalogo() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('table')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY_P)
  const [saving, setSaving] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfLoadingSinMarcas, setPdfLoadingSinMarcas] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState([])
  const [importing, setImporting] = useState(false)
  const importRef = useRef(null)
  const fotoProductoRef = useRef(null)
  const [fotoProductoPreview, setFotoProductoPreview] = useState(null)
  const [fotoProductoFile, setFotoProductoFile] = useState(null)

  const [filters, setFilters] = useState({ nombre: '', codigo: '', categoria: '', rol: '', activo: 'true' })

  async function load() {
    setLoading(true)
    const f = { ...filters }
    if (f.activo !== '') f.activo = f.activo === 'true'
    else delete f.activo
    const data = await getProductos(f)
    setProductos(data)
    setLoading(false)
  }

  async function loadCategorias() {
    // Cargar todas las categorías existentes dinámicamente
    const todos = await getProductos({})
    const cats = [...new Set(todos.map(p => p.categoria).filter(Boolean))].sort()
    setCategorias(cats)
  }

  useEffect(() => { load() }, [filters])
  useEffect(() => { loadCategorias() }, [])

  function openCreate() { setForm({ ...EMPTY_P }); setSelected(null); setFotoProductoPreview(null); setFotoProductoFile(null); setModal('form') }
  function openEdit(p) { setForm({ ...p }); setSelected(p); setFotoProductoPreview(p.imagen_url || null); setFotoProductoFile(null); setModal('form') }

  async function handleSave() {
    if (!form.descripcion.trim()) { toast('La descripción es obligatoria', 'error'); return }
    setSaving(true)
    try {
      const data = {
        ...form,
        precio_venta: Number(form.precio_venta) || 0,
        costo: Number(form.costo) || 0,
        precio_volumen: Number(form.precio_volumen) || 0,
        volumen_minimo: Number(form.volumen_minimo) || 6,
        unidades_caja: Number(form.unidades_caja) || 12,
        margen: Number(form.margen) || 0.86,
      }
      if (!selected) {
        const nuevo = await createProducto(data)
        if (!nuevo) throw new Error('No se pudo crear')
        if (fotoProductoFile && nuevo?.id) {
          const url = await uploadFotoProducto(nuevo.id, fotoProductoFile)
          if (url) await updateProducto(nuevo.id, { imagen_url: url })
        }
        toast('Producto creado', 'success')
      } else {
        let imagen_url = form.imagen_url || ''
        if (fotoProductoFile) {
          const url = await uploadFotoProducto(selected.id, fotoProductoFile)
          if (url) imagen_url = url
        }
        const actualizado = await updateProducto(selected.id, { ...data, imagen_url })
        if (!actualizado) throw new Error('No se pudo actualizar')
        toast('Producto actualizado', 'success')
      }
      setModal(null)
      await load()
      await loadCategorias()
    } catch (e) {
      console.error(e)
      toast('Error al guardar: ' + (e.message || 'intenta de nuevo'), 'error')
    }
    setSaving(false)
  }

  async function handleDeleteProducto() {
    if (!deleteModal) return
    setDeleting(true)
    try {
      await deleteProducto(deleteModal.id)
      toast('Producto eliminado', 'success')
      setDeleteModal(null)
      await load()
      await loadCategorias()
    } catch (e) {
      toast('Error al eliminar', 'error')
    }
    setDeleting(false)
  }

  async function exportarPDFCatalogo() {
    setPdfLoading(true)
    try {
      const data = await getProductos({ activo: true })
      await generarCatalogoPDF(data, { ocultarSinStock: false })
      toast('PDF generado ✓', 'success')
    } catch (e) {
      toast('Error al generar PDF: ' + e.message, 'error')
    }
    setPdfLoading(false)
  }

  // Mismo catálogo pero sin el banner "SIN STOCK" en los productos sin stock
  async function exportarPDFCatalogoSinMarcas() {
    setPdfLoadingSinMarcas(true)
    try {
      const data = await getProductos({ activo: true })
      await generarCatalogoPDF(data, { ocultarSinStock: true })
      toast('PDF generado ✓', 'success')
    } catch (e) {
      toast('Error al generar PDF: ' + e.message, 'error')
    }
    setPdfLoadingSinMarcas(false)
  }

  async function exportarExcel() {
    try {
      toast('Generando Excel...', 'default')
      const data = await getProductos({})
      const { utils, write } = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm')
      const wb = utils.book_new()
      const rows = data.map(p => ({
        codigo: p.codigo || '',
        descripcion: p.descripcion || '',
        categoria: p.categoria || '',
        rol: p.rol || '',
        precio_venta: Number(p.precio_venta) || 0,
        costo: Number(p.costo) || 0,
        margen: Number(p.margen) || 0.86,
        precio_ruta: Number(p.precio_ruta) || 0,
        ruta_desde_uds: Number(p.precio_ruta_minimo) || 0,
        precio_mayorista: Number(p.precio_mayorista) || 0,
        mayorista_desde_uds: Number(p.precio_mayorista_minimo) || 0,
        unidades_caja: Number(p.unidades_caja) || 12,
        activo: p.activo ? 'TRUE' : 'FALSE',
      }))
      const ws = utils.json_to_sheet(rows)
      // Anchos de columna
      ws['!cols'] = [12,40,22,18,14,12,12,14,14,14,14,12,10].map(w => ({ wch: w }))
      utils.book_append_sheet(wb, ws, 'Catálogo')
      const buf = write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `catalogo_dimace_${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      toast('Excel descargado ✓', 'success')
    } catch (e) {
      toast('Error al exportar: ' + e.message, 'error')
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      const { read, utils } = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm')
      const buffer = await file.arrayBuffer()
      const wb = read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = utils.sheet_to_json(ws, { defval: '' })
      setImportFile(file)
      setImportPreview(data.slice(0, 5))
      importRef.current._data = data
      toast(`${data.length} productos listos para importar`, 'success')
    } catch (e) {
      toast('Error al leer archivo', 'error')
    }
  }

  async function confirmarImport() {
    const data = importRef.current?._data
    if (!data?.length) return
    setImporting(true)
    let actualizados = 0, creados = 0, errores = 0
    for (const row of data) {
      try {
        const producto = {
          codigo: String(row.codigo || '').trim(),
          descripcion: String(row.descripcion || '').trim(),
          categoria: String(row.categoria || '').trim(),
          rol: String(row.rol || '').trim(),
          precio_venta: Number(row.precio_venta) || 0,
          costo: Number(row.costo) || 0,
          margen: Number(row.margen) || 0.86,
          precio_ruta: Number(row.precio_ruta) || 0,
          precio_ruta_minimo: Number(row.ruta_desde_uds || row.precio_ruta_minimo) || 0,
          precio_mayorista: Number(row.precio_mayorista) || 0,
          precio_mayorista_minimo: Number(row.mayorista_desde_uds || row.precio_mayorista_minimo) || 0,
          unidades_caja: Number(row.unidades_caja) || 12,
          activo: String(row.activo).toUpperCase() !== 'FALSE',
        }
        if (!producto.descripcion) { errores++; continue }
        const existentes = await getProductos({ codigo: producto.codigo })
        if (existentes?.length > 0 && producto.codigo) {
          await updateProducto(existentes[0].id, producto)
          actualizados++
        } else {
          await createProducto(producto)
          creados++
        }
      } catch (e) { errores++ }
    }
    setImporting(false)
    setImportModal(false)
    setImportPreview([])
    setImportFile(null)
    toast(`✓ ${actualizados} actualizados, ${creados} creados${errores > 0 ? `, ${errores} errores` : ''}`, 'success')
    await load()
    await loadCategorias()
  }

  async function toggleActivo(p) {
    const result = await updateProducto(p.id, { activo: !p.activo })
    if (result) {
      toast(`Producto ${p.activo ? 'desactivado' : 'activado'}`, 'success')
      await load()
    } else {
      toast('Error al cambiar estado', 'error')
    }
  }

  async function toggleSinStock(p) {
    const result = await updateProducto(p.id, { sin_stock: !p.sin_stock })
    if (result) {
      toast(p.sin_stock ? 'Producto disponible ✓' : 'Marcado sin stock', p.sin_stock ? 'success' : 'default')
      await load()
    } else {
      toast('Error al cambiar estado', 'error')
    }
  }

  const rolColor = { 'ANCLA DIARIA': 'badge-green', 'ALTO VALOR': 'badge-yellow', 'ALTA ROTACIÓN': 'badge-blue', 'COMPLEMENTO': 'badge-gray' }

  return (
    <Layout title="Catálogo">
      <div className="page-header">
        <h2>Catálogo <span className="badge badge-green" style={{ fontSize: '.75rem', marginLeft: 8 }}>{productos.length} productos</span></h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className={`btn btn-secondary btn-sm btn-icon ${view === 'table' ? 'btn-primary' : ''}`} onClick={() => setView('table')}><List size={16} /></button>
          <button className={`btn btn-secondary btn-sm btn-icon ${view === 'grid' ? 'btn-primary' : ''}`} onClick={() => setView('grid')}><LayoutGrid size={16} /></button>
          <button className="btn btn-secondary" onClick={exportarPDFCatalogo} disabled={pdfLoading}>
            {pdfLoading ? <><span className="spinner" style={{borderColor:'rgba(0,0,0,.2)',borderTopColor:'var(--green)',width:14,height:14,borderWidth:2}} /> Generando...</> : <><FileText size={15} /> PDF Catálogo</>}
          </button>
          <button className="btn btn-secondary" onClick={exportarPDFCatalogoSinMarcas} disabled={pdfLoadingSinMarcas} title="Catálogo con todos los productos, sin la marca 'Sin Stock'">
            {pdfLoadingSinMarcas ? <><span className="spinner" style={{borderColor:'rgba(0,0,0,.2)',borderTopColor:'var(--green)',width:14,height:14,borderWidth:2}} /> Generando...</> : <><FileText size={15} /> PDF sin marca stock</>}
          </button>
          {isAdmin && <>
            <button className="btn btn-secondary" onClick={exportarExcel}><Download size={15} /> Exportar Excel</button>
            <button className="btn btn-secondary" onClick={() => setImportModal(true)}><Upload size={15} /> Importar Excel</button>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Nuevo</button>
          </>}
        </div>
      </div>

      {/* Filtros */}
      <div className="filters-bar">
        <div className="form-group">
          <label>Buscar</label>
          <input className="form-control" placeholder="Nombre del producto..." value={filters.nombre}
            onChange={e => setFilters(f => ({ ...f, nombre: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Código</label>
          <input className="form-control" placeholder="Código..." value={filters.codigo}
            onChange={e => setFilters(f => ({ ...f, codigo: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Categoría</label>
          <select className="form-control" value={filters.categoria} onChange={e => setFilters(f => ({ ...f, categoria: e.target.value }))}>
            <option value="">Todas ({categorias.length})</option>
            {categorias.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Rol</label>
          <select className="form-control" value={filters.rol} onChange={e => setFilters(f => ({ ...f, rol: e.target.value }))}>
            <option value="">Todos</option>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        {isAdmin && (
          <div className="form-group">
            <label>Estado</label>
            <select className="form-control" value={filters.activo} onChange={e => setFilters(f => ({ ...f, activo: e.target.value }))}>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
              <option value="">Todos</option>
            </select>
          </div>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ nombre: '', codigo: '', categoria: '', rol: '', activo: 'true' })}>
          <X size={14} /> Limpiar
        </button>
      </div>

      {/* Vista Tabla */}
      {view === 'table' && (
        <div className="table-wrap mobile-cards">
          {loading ? <div className="empty-state"><p>Cargando...</p></div> :
            productos.length === 0 ? <div className="empty-state"><Package size={40} /><p>Sin productos</p></div> : (
              <table>
                <thead>
                  <tr>
                    <th>Foto</th>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th>Categoría</th>
                    <th>Rol</th>
                    <th>Precios</th>
                    {isAdmin && <th>Costo</th>}
                    {isAdmin && <th>Margen</th>}
                    <th>Uds/Caja</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.id} style={!p.activo ? { opacity: .5 } : {}}>
                      <td data-label="Foto">
                        {p.imagen_url ? (
                          <img src={p.imagen_url} alt={p.descripcion} loading="lazy"
                            style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', border: '1px solid var(--border)' }}
                            onClick={() => window.open(p.imagen_url, '_blank')} />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📦</div>
                        )}
                      </td>
                      <td data-label="Código" className="text-mono">{p.codigo}</td>
                      <td data-label="Descripción">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ cursor: 'pointer', fontWeight: 500 }} onClick={() => setDetalle(p)}>
                            {p.descripcion}
                          </span>
                          {p.sin_stock && (
                            <span style={{ background: '#e53e3e', color: '#fff', fontSize: '.65rem', fontWeight: 800, padding: '1px 7px', borderRadius: 20, letterSpacing: .5 }}>
                              SIN STOCK
                            </span>
                          )}
                        </div>
                        {p.precio_volumen > 0 && (
                          <div className="text-xs" style={{ color: 'var(--accent)' }}>
                            Vol +{p.volumen_minimo}: {fmt(p.precio_volumen)}
                          </div>
                        )}
                      </td>
                      <td data-label="Categoría"><span className="badge badge-gray">{p.categoria}</span></td>
                      <td data-label="Rol"><span className={`badge ${rolColor[p.rol] || 'badge-gray'}`}>{p.rol}</span></td>
                      <td data-label="Precios">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: '.72rem', color: 'var(--text-secondary)', minWidth: 40 }}>Ruta</span>
                            <span style={{ fontWeight: 700, color: 'var(--green)' }}>{fmt(p.precio_venta)}</span>
                            {p.unidades_caja > 1 && <span style={{ fontSize: '.7rem', color: 'var(--text-secondary)' }}>{fmt(Math.round(p.precio_venta/p.unidades_caja))}/ud</span>}
                          </div>
                          {p.precio_ruta > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: '.72rem', color: '#2850b3', minWidth: 40 }}>Vol +{p.precio_ruta_minimo}</span>
                              <span style={{ fontWeight: 600, color: '#2850b3', fontSize: '.88rem' }}>{fmt(p.precio_ruta)}</span>
                              {p.unidades_caja > 1 && <span style={{ fontSize: '.7rem', color: '#2850b3' }}>{fmt(Math.round(p.precio_ruta/p.unidades_caja))}/ud</span>}
                            </div>
                          )}
                          {p.precio_mayorista > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: '.72rem', color: '#b07a00', minWidth: 40 }}>May +{p.precio_mayorista_minimo}</span>
                              <span style={{ fontWeight: 600, color: '#b07a00', fontSize: '.88rem' }}>{fmt(p.precio_mayorista)}</span>
                              {p.unidades_caja > 1 && <span style={{ fontSize: '.7rem', color: '#b07a00' }}>{fmt(Math.round(p.precio_mayorista/p.unidades_caja))}/ud</span>}
                            </div>
                          )}
                        </div>
                      </td>
                      {isAdmin && <td data-label="Costo" className="text-mono">{fmt(p.costo)}</td>}
                      {isAdmin && <td data-label="Margen" style={{ color: 'var(--green)' }}>{Math.round((1 - p.costo / p.precio_venta) * 100)}%</td>}
                      <td data-label="Uds/Caja">{p.unidades_caja}</td>
                      <td data-label="Acciones">
                        <div style={{ display: 'flex', gap: 6 }}>
                          {isAdmin && <button className="btn btn-secondary btn-sm btn-icon" title="Editar" onClick={() => openEdit(p)}><Edit2 size={14} /></button>}
                          {isAdmin && (
                            <button className={`btn btn-sm ${p.activo ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggleActivo(p)}>
                              {p.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              className={`btn btn-sm ${p.sin_stock ? 'btn-danger' : 'btn-secondary'}`}
                              title={p.sin_stock ? 'Marcar con stock' : 'Marcar sin stock'}
                              onClick={() => toggleSinStock(p)}
                              style={{ fontSize: '.72rem', padding: '4px 8px' }}
                            >
                              {p.sin_stock ? '✓ Stock' : 'Sin stock'}
                            </button>
                          )}
                          {isAdmin && (
                            <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => setDeleteModal(p)}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* Vista Grid */}
      {view === 'grid' && (
        loading ? <div className="empty-state"><p>Cargando...</p></div> : (
          <div className="products-grid">
            {productos.map(p => (
              <div key={p.id} className="product-card" onClick={() => setDetalle(p)} style={!p.activo ? { opacity: .5 } : {}}>
                {p.imagen_url ? (
                <img src={p.imagen_url} alt={p.descripcion} loading="lazy"
                  style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
              ) : (
                <div style={{ width: '100%', height: 80, background: 'var(--bg)', borderRadius: 8, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>📦</div>
              )}
              <div className="code">{p.codigo}</div>
                <h4>{p.descripcion}</h4>
                <span className={`badge ${rolColor[p.rol] || 'badge-gray'}`} style={{ marginBottom: 8 }}>{p.rol}</span>
                {p.sin_stock && (
                  <div style={{ background: '#e53e3e', color: '#fff', fontSize: '.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4, marginBottom: 4, textAlign: 'center', letterSpacing: .5 }}>
                    SIN STOCK
                  </div>
                )}
                <div className="price" style={{ opacity: p.sin_stock ? 0.5 : 1 }}>
                  {fmt(p.precio_venta)}
                  {p.unidades_caja > 1 && <span style={{ fontSize: '.7rem', color: 'var(--text-secondary)', marginLeft: 4 }}>({fmt(Math.round(p.precio_venta/p.unidades_caja))}/ud)</span>}
                </div>
                {p.precio_ruta > 0 && <div className="text-xs" style={{ color: '#2850b3' }}>
                  Vol: {fmt(p.precio_ruta)} {p.unidades_caja > 1 && `(${fmt(Math.round(p.precio_ruta/p.unidades_caja))}/ud)`}
                </div>}
                {p.precio_mayorista > 0 && <div className="text-xs" style={{ color: '#b07a00' }}>
                  May: {fmt(p.precio_mayorista)} {p.unidades_caja > 1 && `(${fmt(Math.round(p.precio_mayorista/p.unidades_caja))}/ud)`}
                </div>}
              </div>
            ))}
          </div>
        )
      )}

      {/* Modal detalle */}
      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>{detalle.descripcion}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setDetalle(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {detalle.imagen_url && (
                <img src={detalle.imagen_url} alt={detalle.descripcion}
                  style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 10, marginBottom: 14, cursor: 'pointer' }}
                  onClick={() => window.open(detalle.imagen_url, '_blank')} />
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <span className="badge badge-gray">{detalle.codigo}</span>
                <span className={`badge ${rolColor[detalle.rol]}`}>{detalle.rol}</span>
                <span className="badge badge-gray">{detalle.categoria}</span>
                {detalle.sin_stock && (
                  <span style={{ background: '#e53e3e', color: '#fff', fontSize: '.73rem', fontWeight: 800, padding: '2px 10px', borderRadius: 20, letterSpacing: .5 }}>
                    ⚠️ SIN STOCK
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {/* Precio Volumen - siempre visible */}
                <div style={{ background: 'var(--green-light)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--green)' }}>{fmt(detalle.precio_venta)}</div>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>Ruta</div>
                  <div className="text-xs text-muted">desde 1 ud</div>
                </div>
                {/* Precio Volumen */}
                <div style={{ background: detalle.precio_ruta > 0 ? '#e8f0ff' : 'var(--bg)', borderRadius: 8, padding: 12, textAlign: 'center', opacity: detalle.precio_ruta > 0 ? 1 : 0.4 }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2850b3' }}>
                    {detalle.precio_ruta > 0 ? fmt(detalle.precio_ruta) : '—'}
                  </div>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#2850b3', marginTop: 2 }}>Precio Volumen</div>
                  <div className="text-xs text-muted">
                    {detalle.precio_ruta > 0 ? `desde ${detalle.precio_ruta_minimo} uds` : 'No configurado'}
                  </div>
                </div>
                {/* Precio Mayorista */}
                <div style={{ background: detalle.precio_mayorista > 0 ? 'var(--accent-light)' : 'var(--bg)', borderRadius: 8, padding: 12, textAlign: 'center', opacity: detalle.precio_mayorista > 0 ? 1 : 0.4 }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#b07a00' }}>
                    {detalle.precio_mayorista > 0 ? fmt(detalle.precio_mayorista) : '—'}
                  </div>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#b07a00', marginTop: 2 }}>Mayorista</div>
                  <div className="text-xs text-muted">
                    {detalle.precio_mayorista > 0 ? `desde ${detalle.precio_mayorista_minimo} uds` : 'No configurado'}
                  </div>
                </div>
              </div>
              <div className="divider" />
              <div className="grid-2">
                <div><span className="text-xs text-muted">Unidades/Caja</span><div style={{ fontWeight: 700 }}>{detalle.unidades_caja}</div></div>
                {isAdmin && <div><span className="text-xs text-muted">Costo</span><div style={{ fontWeight: 700 }}>{fmt(detalle.costo)}</div></div>}
                {isAdmin && <div><span className="text-xs text-muted">Margen</span><div style={{ fontWeight: 700, color: 'var(--green)' }}>{Math.round((1 - detalle.costo / detalle.precio_venta) * 100)}%</div></div>}
              </div>
              {detalle.descripcion_detallada && (
                <><div className="divider" /><p className="text-sm">{detalle.descripcion_detallada}</p></>
              )}
            </div>
            {isAdmin && (
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setDetalle(null); openEdit(detalle) }}>
                  <Edit2 size={14} /> Editar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Eliminar Producto — SOLO ADMIN */}
      {deleteModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteModal(null)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={20} color="var(--danger)" />
                Eliminar Producto
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setDeleteModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--danger-light)', border: '1px solid #fca5a5', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <p style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>
                  ⚠️ ¿Estás seguro que deseas eliminar este producto?
                </p>
                <p style={{ fontSize: '.88rem', color: 'var(--danger)' }}>
                  Esta acción <strong>no se puede deshacer</strong>.
                </p>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{deleteModal.descripcion}</div>
                <div className="text-xs text-muted">Código: {deleteModal.codigo} · {deleteModal.categoria}</div>
              </div>
              <p style={{ fontSize: '.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong>Consecuencias de eliminar:</strong><br/>
                • El producto desaparecerá del catálogo permanentemente<br/>
                • Las ventas anteriores que incluyan este producto <strong>perderán la referencia</strong><br/>
                • No podrás recuperarlo — tendrías que crearlo desde cero<br/>
                <br/>
                💡 <strong>Alternativa recomendada:</strong> usa <em>"Desactivar"</em> para ocultarlo del catálogo sin perder el historial.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteModal(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleDeleteProducto} disabled={deleting}>
                {deleting ? <span className="spinner" /> : <><Trash2 size={14} /> Sí, eliminar definitivamente</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar — SOLO ADMIN */}
      {importModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setImportModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>Importar Catálogo desde Excel</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setImportModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--green-light)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: '.85rem' }}>
                💡 Exporta primero el catálogo, edita los valores en Excel y vuelve a importarlo aquí. El sistema actualizará los productos por código.
              </div>
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: '2px dashed var(--border)', borderRadius: 10, padding: '24px 20px',
                cursor: 'pointer', background: 'var(--bg)', marginBottom: 16
              }}>
                <Upload size={28} color="var(--green)" style={{ marginBottom: 8 }} />
                <span style={{ fontWeight: 600 }}>{importFile ? importFile.name : 'Seleccionar archivo Excel'}</span>
                <span className="text-xs text-muted">.xlsx o .csv</span>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv"
                  onChange={handleImportFile} style={{ display: 'none' }} />
              </label>

              {importPreview.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 8 }}>
                    Vista previa — {importRef.current?._data?.length} productos a importar:
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--green)', color: '#fff' }}>
                          {['Código','Descripción','Categoría','Precio','Costo'].map(h => (
                            <th key={h} style={{ padding: '5px 8px', textAlign: 'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((p, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i%2 ? 'var(--bg)' : '#fff' }}>
                            <td style={{ padding: '4px 8px' }}>{p.codigo}</td>
                            <td style={{ padding: '4px 8px' }}>{p.descripcion}</td>
                            <td style={{ padding: '4px 8px' }}>{p.categoria}</td>
                            <td style={{ padding: '4px 8px' }}>${Number(p.precio_venta||0).toLocaleString('es-CL')}</td>
                            <td style={{ padding: '4px 8px' }}>${Number(p.costo||0).toLocaleString('es-CL')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setImportModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarImport}
                disabled={importing || !importPreview.length}>
                {importing ? <><span className="spinner" /> Importando...</> : <><Upload size={14} /> Confirmar Importación</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear/Editar */}
      {modal === 'form' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h3>{selected ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="grid-2">
                <div className="form-group">
                  <label>Código</label>
                  <input className="form-control" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Categoría</label>
                  <input
                    className="form-control"
                    list="cats-list"
                    value={form.categoria}
                    onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    placeholder="Selecciona o escribe una categoría"
                  />
                  <datalist id="cats-list">
                    {categorias.map(c => <option key={c} value={c} />)}
                  </datalist>
                  <div className="text-xs text-muted" style={{ marginTop: 3 }}>
                    Puedes escribir una nueva categoría o elegir una existente
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>Descripción *</label>
                <input className="form-control" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>

              {/* Foto del producto - solo admin */}
              <div className="form-group">
                <label>Foto del Producto</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    onClick={() => fotoProductoRef.current.click()}
                    style={{
                      width: 90, height: 90, borderRadius: 10,
                      border: '2px dashed var(--border)', cursor: 'pointer',
                      overflow: 'hidden', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', background: 'var(--bg)', flexShrink: 0,
                      transition: 'border-color .18s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--green)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    {fotoProductoPreview ? (
                      <img src={fotoProductoPreview} alt="preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem' }}>📦</div>
                        <div className="text-xs text-muted">Agregar foto</div>
                      </div>
                    )}
                  </div>
                  <div>
                    <button type="button" className="btn btn-secondary btn-sm"
                      onClick={() => fotoProductoRef.current.click()} style={{ marginBottom: 6 }}>
                      📷 {fotoProductoPreview ? 'Cambiar foto' : 'Subir foto'}
                    </button>
                    <div className="text-xs text-muted">JPG o PNG. Se guarda en Supabase.</div>
                    {fotoProductoPreview && (
                      <button type="button" className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)', marginTop: 4 }}
                        onClick={() => { setFotoProductoPreview(null); setFotoProductoFile(null); setForm(f => ({ ...f, imagen_url: '' })) }}>
                        Eliminar foto
                      </button>
                    )}
                  </div>
                  <input ref={fotoProductoRef} type="file" accept="image/*"
                    onChange={e => {
                      const file = e.target.files[0]
                      if (!file) return
                      setFotoProductoFile(file)
                      setFotoProductoPreview(URL.createObjectURL(file))
                    }}
                    style={{ display: 'none' }} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Rol</label>
                  <select className="form-control" value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                    {ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Unidades/Caja</label>
                  <input className="form-control" type="number" value={form.unidades_caja} onChange={e => setForm(f => ({ ...f, unidades_caja: e.target.value }))} />
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label>Precio Volumen</label>
                  <input className="form-control" type="number" value={form.precio_venta} onChange={e => {
                    const precio = Number(e.target.value)
                    const costo = Number(form.costo)
                    const margen = precio > 0 && costo > 0 ? Math.round(((precio - costo) / precio) * 100) / 100 : form.margen
                    setForm(f => ({ ...f, precio_venta: e.target.value, margen }))
                  }} />
                  <div className="text-xs text-muted" style={{ marginTop: 3 }}>Precio unitario base</div>
                </div>
                <div className="form-group">
                  <label>Costo</label>
                  <input className="form-control" type="number" value={form.costo} onChange={e => {
                    const costo = Number(e.target.value)
                    const precio = Number(form.precio_venta)
                    const margen = precio > 0 && costo > 0 ? Math.round(((precio - costo) / precio) * 100) / 100 : form.margen
                    setForm(f => ({ ...f, costo: e.target.value, margen }))
                  }} />
                </div>
                <div className="form-group">
                  <label>Margen (auto)</label>
                  <input className="form-control" type="number" step="0.01" value={form.margen}
                    readOnly
                    style={{ background: 'var(--green-light)', color: 'var(--green)', fontWeight: 700, cursor: 'not-allowed' }}
                  />
                  <div className="text-xs text-muted" style={{ marginTop: 3 }}>
                    {form.precio_venta > 0 && form.costo > 0 ? `${Math.round(form.margen * 100)}% de margen` : 'Ingresa precio y costo'}
                  </div>
                </div>
              </div>

              {/* Precio Volumen */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '.85rem', color: '#2850b3', marginBottom: 8 }}>
                  📦 Precio Volumen (2° nivel)
                </div>
                <div className="grid-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Precio Volumen</label>
                    <input className="form-control" type="number" value={form.precio_ruta || ''} placeholder="0"
                      onChange={e => setForm(f => ({ ...f, precio_ruta: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Desde (cantidad uds)</label>
                    <input className="form-control" type="number" value={form.precio_ruta_minimo || ''} placeholder="ej: 6"
                      onChange={e => setForm(f => ({ ...f, precio_ruta_minimo: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Precio Mayorista */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--accent)', marginBottom: 8 }}>
                  🏭 Precio Mayorista (3° nivel)
                </div>
                <div className="grid-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Precio Mayorista</label>
                    <input className="form-control" type="number" value={form.precio_mayorista || ''} placeholder="0"
                      onChange={e => setForm(f => ({ ...f, precio_mayorista: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Desde (uds mínimas)</label>
                    <input className="form-control" type="number" value={form.precio_mayorista_minimo || ''} placeholder="ej: 24"
                      onChange={e => setForm(f => ({ ...f, precio_mayorista_minimo: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>Descripción Detallada</label>
                <textarea className="form-control" value={form.descripcion_detallada} onChange={e => setForm(f => ({ ...f, descripcion_detallada: e.target.value }))} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.9rem' }}>
                <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                Producto activo
              </label>
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
    </Layout>
  )
}
