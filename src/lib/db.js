// src/lib/db.js
// Capa de abstracción: Supabase primero, localStorage como fallback
import { getSupabase, SUPABASE_URL } from './supabase.js'

function isSupabaseConfigured() {
  return !SUPABASE_URL.includes('TU_PROYECTO')
}

// ── HELPERS LOCALSTORAGE ──────────────────────────────────────────────────────
function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
function lsSet(key, data) {
  localStorage.setItem(key, JSON.stringify(data))
}
function nextId(arr) {
  return arr.length ? Math.max(...arr.map(x => x.id || 0)) + 1 : 1
}

// ── CLIENTES ──────────────────────────────────────────────────────────────────
export async function getClientes(filters = {}) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      let q = sb.from('clientes').select('id,tipo,nombre,rut,contacto,email,telefono,direccion,comuna,ciudad,observaciones,vendedor_id,imagen_url,latitud,longitud,username,canal,created_at').order('nombre')
      if (filters.vendedor_id) q = q.eq('vendedor_id', filters.vendedor_id)
      if (filters.nombre) q = q.ilike('nombre', `%${filters.nombre}%`)
      if (filters.rut) q = q.ilike('rut', `%${filters.rut}%`)
      if (filters.comuna) q = q.ilike('comuna', `%${filters.comuna}%`)
      if (filters.tipo) q = q.eq('tipo', filters.tipo)
      const { data, error } = await q
      if (error) console.error('getClientes error:', error)
      if (data) return data
    } catch (e) { console.error('getClientes catch:', e) }
  }
  let data = lsGet('em_clientes')
  if (filters.vendedor_id) data = data.filter(c => c.vendedor_id === filters.vendedor_id)
  if (filters.nombre) data = data.filter(c => c.nombre?.toLowerCase().includes(filters.nombre.toLowerCase()))
  if (filters.rut) data = data.filter(c => c.rut?.toLowerCase().includes(filters.rut.toLowerCase()))
  if (filters.comuna) data = data.filter(c => c.comuna?.toLowerCase().includes(filters.comuna.toLowerCase()))
  if (filters.tipo) data = data.filter(c => c.tipo === filters.tipo)
  return data
}

export async function createCliente(cliente) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('clientes').insert(cliente).select().single()
      if (data) return data
    } catch (e) { console.error('createCliente error:', e) }
  }
  const arr = lsGet('em_clientes')
  const nuevo = { ...cliente, id: nextId(arr), created_at: new Date().toISOString() }
  lsSet('em_clientes', [...arr, nuevo])
  return nuevo
}

export async function updateCliente(id, changes) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('clientes').update(changes).eq('id', id).select().single()
      if (data) return data
    } catch (e) { console.error('updateCliente error:', e) }
  }
  const arr = lsGet('em_clientes').map(c => c.id === id ? { ...c, ...changes } : c)
  lsSet('em_clientes', arr)
  return arr.find(c => c.id === id)
}

export async function deleteCliente(id) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      await sb.from('clientes').delete().eq('id', id)
      return true
    } catch (e) { console.error('deleteCliente error:', e) }
  }
  lsSet('em_clientes', lsGet('em_clientes').filter(c => c.id !== id))
  return true
}

// ── RUTAS ─────────────────────────────────────────────────────────────────────
export async function getRutas(vendedor_id = null) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      let q = sb.from('rutas').select('*, ruta_clientes(cliente_id, clientes(*))')
      if (vendedor_id) q = q.eq('vendedor_id', vendedor_id)
      const { data } = await q
      if (data) return data
    } catch (e) { console.error('getRutas error:', e) }
  }
  const rutas = lsGet('em_rutas')
  const rcs = lsGet('em_ruta_clientes')
  const clientes = lsGet('em_clientes')
  return rutas
    .filter(r => !vendedor_id || r.vendedor_id === vendedor_id)
    .map(r => ({
      ...r,
      ruta_clientes: rcs.filter(rc => rc.ruta_id === r.id).map(rc => ({
        cliente_id: rc.cliente_id,
        clientes: clientes.find(c => c.id === rc.cliente_id)
      }))
    }))
}

export async function createRuta(ruta) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('rutas').insert(ruta).select().single()
      if (data) return data
    } catch (e) { console.error('createRuta error:', e) }
  }
  const arr = lsGet('em_rutas')
  const nuevo = { ...ruta, id: nextId(arr), created_at: new Date().toISOString() }
  lsSet('em_rutas', [...arr, nuevo])
  return nuevo
}

export async function updateRuta(id, changes) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('rutas').update(changes).eq('id', id).select().single()
      if (data) return data
    } catch (e) { console.error('updateRuta error:', e) }
  }
  const arr = lsGet('em_rutas').map(r => r.id === id ? { ...r, ...changes } : r)
  lsSet('em_rutas', arr)
  return arr.find(r => r.id === id)
}

export async function deleteRuta(id) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      await sb.from('rutas').delete().eq('id', id)
      return true
    } catch (e) { console.error('deleteRuta error:', e) }
  }
  lsSet('em_rutas', lsGet('em_rutas').filter(r => r.id !== id))
  lsSet('em_ruta_clientes', lsGet('em_ruta_clientes').filter(rc => rc.ruta_id !== id))
  return true
}

export async function setRutaClientes(ruta_id, cliente_ids) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      await sb.from('ruta_clientes').delete().eq('ruta_id', ruta_id)
      if (cliente_ids.length) {
        await sb.from('ruta_clientes').insert(cliente_ids.map(cid => ({ ruta_id, cliente_id: cid })))
      }
      return true
    } catch (e) { console.error('setRutaClientes error:', e) }
  }
  const others = lsGet('em_ruta_clientes').filter(rc => rc.ruta_id !== ruta_id)
  lsSet('em_ruta_clientes', [...others, ...cliente_ids.map(cid => ({ ruta_id, cliente_id: cid }))])
  return true
}

// ── PRODUCTOS ─────────────────────────────────────────────────────────────────
export async function getProductos(filters = {}) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      let q = sb.from('productos').select('*').order('categoria').order('descripcion')
      if (filters.activo !== undefined) q = q.eq('activo', filters.activo)
      if (filters.nombre) q = q.ilike('descripcion', `%${filters.nombre}%`)
      if (filters.codigo) q = q.ilike('codigo', `%${filters.codigo}%`)
      if (filters.categoria) q = q.eq('categoria', filters.categoria)
      if (filters.rol) q = q.eq('rol', filters.rol)
      const { data } = await q
      if (data) return data
    } catch (e) { console.error('getProductos error:', e) }
  }
  let data = lsGet('em_productos')
  if (!data.length) data = getProductosSeed()
  if (filters.activo !== undefined) data = data.filter(p => p.activo === filters.activo)
  if (filters.nombre) data = data.filter(p => p.descripcion?.toLowerCase().includes(filters.nombre.toLowerCase()))
  if (filters.codigo) data = data.filter(p => p.codigo?.toLowerCase().includes(filters.codigo.toLowerCase()))
  if (filters.categoria) data = data.filter(p => p.categoria === filters.categoria)
  if (filters.rol) data = data.filter(p => p.rol === filters.rol)
  return data
}

export async function createProducto(producto) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('productos').insert(producto).select().single()
      if (data) return data
    } catch (e) { console.error('createProducto error:', e) }
  }
  let arr = lsGet('em_productos')
  if (!arr.length) arr = getProductosSeed()
  const nuevo = { ...producto, id: nextId(arr) }
  lsSet('em_productos', [...arr, nuevo])
  return nuevo
}

export async function updateProducto(id, changes) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data, error } = await sb.from('productos').update(changes).eq('id', id).select().single()
      if (error) throw error
      if (data) {
        // Actualizar también cache local
        let arr = lsGet('em_productos')
        if (arr.length) {
          lsSet('em_productos', arr.map(p => p.id === id ? { ...p, ...data } : p))
        }
        return data
      }
    } catch (e) {
      console.error('updateProducto error:', e)
    }
  }
  let arr = lsGet('em_productos')
  if (!arr.length) arr = getProductosSeed()
  const updated = arr.map(p => p.id === id ? { ...p, ...changes } : p)
  lsSet('em_productos', updated)
  return updated.find(p => p.id === id)
}

export async function deleteProducto(id) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { error } = await sb.from('productos').delete().eq('id', id)
      if (error) throw error
    } catch (e) {
      console.error('deleteProducto error:', e)
    }
  }
  let arr = lsGet('em_productos')
  lsSet('em_productos', arr.filter(p => p.id !== id))
  return true
}

// ── VENTAS ────────────────────────────────────────────────────────────────────
export async function getVentas(filters = {}) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      let q = sb.from('ventas').select('*, venta_items(*), clientes(nombre, rut)').order('created_at', { ascending: false })
      if (filters.vendedor_id) q = q.eq('vendedor_id', filters.vendedor_id)
      const { data } = await q
      if (data) return data
    } catch (e) { console.error('getVentas error:', e) }
  }
  const ventas = lsGet('em_ventas')
  const items = lsGet('em_venta_items')
  const clientes = lsGet('em_clientes')
  return ventas
    .filter(v => !filters.vendedor_id || v.vendedor_id === filters.vendedor_id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(v => ({
      ...v,
      venta_items: items.filter(i => i.venta_id === v.id),
      clientes: clientes.find(c => c.id === v.cliente_id)
    }))
}

export async function createVenta(venta, items) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data: ventaData } = await sb.from('ventas').insert(venta).select().single()
      if (ventaData) {
        const itemsToInsert = items.map(i => ({ ...i, venta_id: ventaData.id }))
        await sb.from('venta_items').insert(itemsToInsert)
        return ventaData
      }
    } catch (e) { console.error('createVenta error:', e) }
  }
  const arr = lsGet('em_ventas')
  const nuevo = { ...venta, id: nextId(arr), created_at: new Date().toISOString() }
  lsSet('em_ventas', [...arr, nuevo])
  const itemsArr = lsGet('em_venta_items')
  const newItems = items.map((i, idx) => ({ ...i, id: nextId(itemsArr) + idx, venta_id: nuevo.id }))
  lsSet('em_venta_items', [...itemsArr, ...newItems])
  return nuevo
}

export async function updateVenta(id, changes) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('ventas').update(changes).eq('id', id).select().single()
      if (data) return data
    } catch (e) { console.error('updateVenta error:', e) }
  }
  const arr = lsGet('em_ventas').map(v => v.id === id ? { ...v, ...changes } : v)
  lsSet('em_ventas', arr)
  return arr.find(v => v.id === id)
}

export async function deleteVenta(id) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      await sb.from('venta_items').delete().eq('venta_id', id)
      await sb.from('ventas').delete().eq('id', id)
      return true
    } catch (e) { console.error('deleteVenta error:', e) }
  }
  lsSet('em_ventas', lsGet('em_ventas').filter(v => v.id !== id))
  lsSet('em_venta_items', lsGet('em_venta_items').filter(i => i.venta_id !== id))
  return true
}

// ── USUARIOS ──────────────────────────────────────────────────────────────────
export async function getUsuarios() {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('usuarios').select('id, username, role, nombre')
      if (data) return data
    } catch (e) { console.error('getUsuarios error:', e) }
  }
  const users = JSON.parse(localStorage.getItem('em_users') || '[]')
  return users.map(u => ({ id: u.id, username: u.username, role: u.role, nombre: u.nombre }))
}

export async function createUsuario(usuario) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('usuarios').insert(usuario).select().single()
      if (data) return data
    } catch (e) { console.error('createUsuario error:', e) }
  }
  const users = JSON.parse(localStorage.getItem('em_users') || '[]')
  const nuevo = { ...usuario, id: nextId(users) }
  localStorage.setItem('em_users', JSON.stringify([...users, nuevo]))
  return nuevo
}

export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured()) return false
  try {
    const sb = await getSupabase()
    const { error } = await sb.from('usuarios').select('count').limit(1)
    return !error
  } catch { return false }
}

// ── SEED PRODUCTOS ─────────────────────────────────────────────────────────────
function getProductosSeed() {
  const categorias = [
    { cat: 'Score Energy', rol: 'ANCLA DIARIA', productos: [
      { codigo: 'SE001', descripcion: 'Score Energy Original 500ml', precio: 1200, costo: 700, unidades_caja: 24 },
      { codigo: 'SE002', descripcion: 'Score Energy Tropical 500ml', precio: 1200, costo: 700, unidades_caja: 24 },
      { codigo: 'SE003', descripcion: 'Score Energy Sandía 500ml', precio: 1200, costo: 700, unidades_caja: 24 },
      { codigo: 'SE004', descripcion: 'Score Energy Zero 500ml', precio: 1250, costo: 720, unidades_caja: 24 },
      { codigo: 'SE005', descripcion: 'Score Energy Maracuyá 500ml', precio: 1200, costo: 700, unidades_caja: 24 },
      { codigo: 'SE006', descripcion: 'Score Energy Pack x6', precio: 6900, costo: 3900, unidades_caja: 4 },
      { codigo: 'SE007', descripcion: 'Score Energy Pack x12', precio: 13500, costo: 7800, unidades_caja: 2 },
      { codigo: 'SE008', descripcion: 'Score Energy Caja x24', precio: 26400, costo: 15600, unidades_caja: 1 },
    ]},
    { cat: 'Coca-Cola', rol: 'ALTO VALOR', productos: [
      { codigo: 'CC001', descripcion: 'Coca-Cola 1.5L', precio: 1800, costo: 1100, unidades_caja: 8 },
      { codigo: 'CC002', descripcion: 'Coca-Cola 500ml', precio: 900, costo: 520, unidades_caja: 24 },
      { codigo: 'CC003', descripcion: 'Coca-Cola Light 1.5L', precio: 1800, costo: 1100, unidades_caja: 8 },
      { codigo: 'CC004', descripcion: 'Coca-Cola Zero 500ml', precio: 900, costo: 520, unidades_caja: 24 },
      { codigo: 'CC005', descripcion: 'Coca-Cola 350ml lata', precio: 800, costo: 450, unidades_caja: 24 },
      { codigo: 'CC006', descripcion: 'Coca-Cola 3L', precio: 2800, costo: 1700, unidades_caja: 6 },
    ]},
    { cat: 'Sprite/Fanta/7UP', rol: 'ALTA ROTACIÓN', productos: [
      { codigo: 'SF001', descripcion: 'Sprite 1.5L', precio: 1700, costo: 980, unidades_caja: 8 },
      { codigo: 'SF002', descripcion: 'Sprite 500ml', precio: 850, costo: 490, unidades_caja: 24 },
      { codigo: 'SF003', descripcion: 'Fanta Naranja 1.5L', precio: 1700, costo: 980, unidades_caja: 8 },
      { codigo: 'SF004', descripcion: 'Fanta Naranja 500ml', precio: 850, costo: 490, unidades_caja: 24 },
      { codigo: 'SF005', descripcion: '7UP 1.5L', precio: 1700, costo: 980, unidades_caja: 8 },
      { codigo: 'SF006', descripcion: '7UP 500ml', precio: 850, costo: 490, unidades_caja: 24 },
      { codigo: 'SF007', descripcion: 'Fanta Limón 1.5L', precio: 1700, costo: 980, unidades_caja: 8 },
    ]},
    { cat: 'CCU/Pepsi/Bilz', rol: 'ALTA ROTACIÓN', productos: [
      { codigo: 'CP001', descripcion: 'Pepsi 1.5L', precio: 1600, costo: 900, unidades_caja: 8 },
      { codigo: 'CP002', descripcion: 'Pepsi 500ml', precio: 800, costo: 450, unidades_caja: 24 },
      { codigo: 'CP003', descripcion: 'Bilz 1.5L', precio: 1500, costo: 850, unidades_caja: 8 },
      { codigo: 'CP004', descripcion: 'Bilz 500ml', precio: 750, costo: 420, unidades_caja: 24 },
      { codigo: 'CP005', descripcion: 'Pap 1.5L', precio: 1500, costo: 850, unidades_caja: 8 },
      { codigo: 'CP006', descripcion: 'Pap 500ml', precio: 750, costo: 420, unidades_caja: 24 },
      { codigo: 'CP007', descripcion: 'Quatro 1.5L', precio: 1600, costo: 900, unidades_caja: 8 },
    ]},
    { cat: 'Energéticas', rol: 'ALTO VALOR', productos: [
      { codigo: 'EN001', descripcion: 'Red Bull 250ml', precio: 1800, costo: 1100, unidades_caja: 24 },
      { codigo: 'EN002', descripcion: 'Monster Energy 473ml', precio: 2200, costo: 1400, unidades_caja: 24 },
      { codigo: 'EN003', descripcion: 'Burn 500ml', precio: 1600, costo: 950, unidades_caja: 24 },
      { codigo: 'EN004', descripcion: 'Volt Energy 500ml', precio: 1400, costo: 800, unidades_caja: 24 },
      { codigo: 'EN005', descripcion: 'Tiger Energy 250ml', precio: 1500, costo: 880, unidades_caja: 24 },
      { codigo: 'EN006', descripcion: 'Rockstar 500ml', precio: 1900, costo: 1150, unidades_caja: 24 },
    ]},
    { cat: 'Jugos Watts', rol: 'ALTA ROTACIÓN', productos: [
      { codigo: 'JW001', descripcion: 'Watts Naranja 1L', precio: 1400, costo: 800, unidades_caja: 12 },
      { codigo: 'JW002', descripcion: 'Watts Durazno 1L', precio: 1400, costo: 800, unidades_caja: 12 },
      { codigo: 'JW003', descripcion: 'Watts Manzana 1L', precio: 1400, costo: 800, unidades_caja: 12 },
      { codigo: 'JW004', descripcion: 'Watts Mix Frutas 1L', precio: 1400, costo: 800, unidades_caja: 12 },
      { codigo: 'JW005', descripcion: 'Watts Néctar Piña 1L', precio: 1400, costo: 800, unidades_caja: 12 },
      { codigo: 'JW006', descripcion: 'Watts Light Naranja 1L', precio: 1500, costo: 850, unidades_caja: 12 },
      { codigo: 'JW007', descripcion: 'Watts Exprime 250ml x6', precio: 2800, costo: 1600, unidades_caja: 6 },
    ]},
    { cat: 'Jugos Del Valle', rol: 'ALTA ROTACIÓN', productos: [
      { codigo: 'DV001', descripcion: 'Del Valle Naranja 1L', precio: 1500, costo: 850, unidades_caja: 12 },
      { codigo: 'DV002', descripcion: 'Del Valle Mango 1L', precio: 1500, costo: 850, unidades_caja: 12 },
      { codigo: 'DV003', descripcion: 'Del Valle Durazno 1L', precio: 1500, costo: 850, unidades_caja: 12 },
      { codigo: 'DV004', descripcion: 'Del Valle Uva 1L', precio: 1500, costo: 850, unidades_caja: 12 },
      { codigo: 'DV005', descripcion: 'Del Valle Fresh 500ml', precio: 900, costo: 500, unidades_caja: 24 },
      { codigo: 'DV006', descripcion: 'Del Valle Cero 1L', precio: 1500, costo: 850, unidades_caja: 12 },
    ]},
    { cat: 'Aguas y Naturales', rol: 'COMPLEMENTO', productos: [
      { codigo: 'AG001', descripcion: 'Cachantun 1.6L', precio: 800, costo: 400, unidades_caja: 12 },
      { codigo: 'AG002', descripcion: 'Cachantun 600ml', precio: 500, costo: 250, unidades_caja: 24 },
      { codigo: 'AG003', descripcion: 'Vital 1.6L', precio: 750, costo: 380, unidades_caja: 12 },
      { codigo: 'AG004', descripcion: 'Vital 600ml', precio: 480, costo: 240, unidades_caja: 24 },
      { codigo: 'AG005', descripcion: 'Benedictino 1.3L', precio: 900, costo: 480, unidades_caja: 12 },
      { codigo: 'AG006', descripcion: 'Benedictino 500ml', precio: 600, costo: 300, unidades_caja: 24 },
      { codigo: 'AG007', descripcion: 'Aqua 591ml', precio: 550, costo: 280, unidades_caja: 24 },
    ]},
    { cat: 'Otras Bebidas/Jugos', rol: 'COMPLEMENTO', productos: [
      { codigo: 'OB001', descripcion: 'Kem Limón 1.5L', precio: 1400, costo: 780, unidades_caja: 8 },
      { codigo: 'OB002', descripcion: 'Kem Naranja 1.5L', precio: 1400, costo: 780, unidades_caja: 8 },
      { codigo: 'OB003', descripcion: 'Gatorade Limón 500ml', precio: 1100, costo: 650, unidades_caja: 24 },
      { codigo: 'OB004', descripcion: 'Powerade Azul 500ml', precio: 1100, costo: 650, unidades_caja: 24 },
      { codigo: 'OB005', descripcion: 'Lipton Ice Tea Limón 1.5L', precio: 1600, costo: 950, unidades_caja: 8 },
      { codigo: 'OB006', descripcion: 'Néctar Andino 1L', precio: 1200, costo: 680, unidades_caja: 12 },
      { codigo: 'OB007', descripcion: 'Frugo Naranja 200ml x6', precio: 1800, costo: 1000, unidades_caja: 6 },
      { codigo: 'OB008', descripcion: 'Tampico 1L', precio: 1100, costo: 620, unidades_caja: 12 },
      { codigo: 'OB009', descripcion: 'Hi-C 500ml', precio: 900, costo: 500, unidades_caja: 24 },
    ]},
    { cat: 'Pastas y Fideos', rol: 'ANCLA DIARIA', productos: [
      { codigo: 'PF001', descripcion: 'Carozzi Espagueti 500g', precio: 1200, costo: 700, unidades_caja: 20 },
      { codigo: 'PF002', descripcion: 'Carozzi Tallarín 500g', precio: 1200, costo: 700, unidades_caja: 20 },
      { codigo: 'PF003', descripcion: 'Carozzi Codo 500g', precio: 1100, costo: 640, unidades_caja: 20 },
      { codigo: 'PF004', descripcion: 'Luchetti Espagueti 400g', precio: 1300, costo: 760, unidades_caja: 20 },
      { codigo: 'PF005', descripcion: 'Luchetti Penne 400g', precio: 1300, costo: 760, unidades_caja: 20 },
      { codigo: 'PF006', descripcion: 'Sopas Maggi Fideos 80g', precio: 450, costo: 240, unidades_caja: 30 },
      { codigo: 'PF007', descripcion: 'Sopas Knorr Costilla 60g', precio: 480, costo: 260, unidades_caja: 30 },
    ]},
    { cat: 'Lácteos', rol: 'ANCLA DIARIA', productos: [
      { codigo: 'LA001', descripcion: 'Leche Loncoleche 1L entera', precio: 1100, costo: 680, unidades_caja: 12 },
      { codigo: 'LA002', descripcion: 'Leche Loncoleche 1L semidescremada', precio: 1100, costo: 680, unidades_caja: 12 },
      { codigo: 'LA003', descripcion: 'Leche Soprole 1L', precio: 1150, costo: 700, unidades_caja: 12 },
      { codigo: 'LA004', descripcion: 'Yogurt Colún 1kg Natural', precio: 2200, costo: 1350, unidades_caja: 6 },
      { codigo: 'LA005', descripcion: 'Yogurt Soprole Frutado 165g', precio: 650, costo: 380, unidades_caja: 24 },
      { codigo: 'LA006', descripcion: 'Queso Fresco Quillayes 400g', precio: 2800, costo: 1750, unidades_caja: 8 },
      { codigo: 'LA007', descripcion: 'Mantequilla Colún 250g', precio: 2400, costo: 1500, unidades_caja: 12 },
      { codigo: 'LA008', descripcion: 'Crema Colún 200g', precio: 1200, costo: 720, unidades_caja: 12 },
    ]},
    { cat: 'Alimentos Básicos', rol: 'ANCLA DIARIA', productos: [
      { codigo: 'AB001', descripcion: 'Arroz Grano de Oro 1kg', precio: 1400, costo: 820, unidades_caja: 20 },
      { codigo: 'AB002', descripcion: 'Arroz Tucapel 1kg', precio: 1600, costo: 980, unidades_caja: 20 },
      { codigo: 'AB003', descripcion: 'Azúcar Iansa 1kg', precio: 1200, costo: 700, unidades_caja: 20 },
      { codigo: 'AB004', descripcion: 'Aceite Chef 1L', precio: 2200, costo: 1400, unidades_caja: 12 },
      { codigo: 'AB005', descripcion: 'Aceite Natura 1L', precio: 2400, costo: 1550, unidades_caja: 12 },
      { codigo: 'AB006', descripcion: 'Lentejas 500g genérico', precio: 1100, costo: 620, unidades_caja: 20 },
      { codigo: 'AB007', descripcion: 'Porotos 500g genérico', precio: 1000, costo: 560, unidades_caja: 20 },
      { codigo: 'AB008', descripcion: 'Harina Selecta 1kg', precio: 900, costo: 500, unidades_caja: 20 },
      { codigo: 'AB009', descripcion: 'Sal Lobos 1kg', precio: 600, costo: 320, unidades_caja: 24 },
    ]},
    { cat: 'Congelados y Carnes', rol: 'ALTO VALOR', productos: [
      { codigo: 'CC001C', descripcion: 'Pollo Entero Congelado 1.8kg', precio: 5500, costo: 3500, unidades_caja: 6 },
      { codigo: 'CC002C', descripcion: 'Pechuga Pollo Congelada 1kg', precio: 4200, costo: 2700, unidades_caja: 8 },
      { codigo: 'CC003C', descripcion: 'Hamburguesas Sadia x4 480g', precio: 3200, costo: 2000, unidades_caja: 10 },
      { codigo: 'CC004C', descripcion: 'Salchicha Vienesa 500g', precio: 2800, costo: 1750, unidades_caja: 12 },
      { codigo: 'CC005C', descripcion: 'Mortadela 500g', precio: 2400, costo: 1500, unidades_caja: 12 },
      { codigo: 'CC006C', descripcion: 'Longaniza 500g', precio: 3000, costo: 1900, unidades_caja: 12 },
    ]},
    { cat: 'Higiene Papel', rol: 'ALTA ROTACIÓN', productos: [
      { codigo: 'HP001', descripcion: 'Papel Higiénico Elite x4 doble hoja', precio: 2800, costo: 1700, unidades_caja: 12 },
      { codigo: 'HP002', descripcion: 'Papel Higiénico Confort x4', precio: 2400, costo: 1450, unidades_caja: 12 },
      { codigo: 'HP003', descripcion: 'Toalla Nova x2', precio: 2200, costo: 1300, unidades_caja: 12 },
      { codigo: 'HP004', descripcion: 'Servilletas Nova x60', precio: 900, costo: 500, unidades_caja: 20 },
      { codigo: 'HP005', descripcion: 'Pañuelos Kleenex x10', precio: 800, costo: 440, unidades_caja: 24 },
      { codigo: 'HP006', descripcion: 'Toalla Absorbente Elite x2', precio: 2600, costo: 1600, unidades_caja: 12 },
    ]},
    { cat: 'Aseo del Hogar', rol: 'COMPLEMENTO', productos: [
      { codigo: 'AH001', descripcion: 'Detergente Omo 1kg', precio: 3200, costo: 2000, unidades_caja: 12 },
      { codigo: 'AH002', descripcion: 'Detergente Bold 800g', precio: 2800, costo: 1750, unidades_caja: 12 },
      { codigo: 'AH003', descripcion: 'Cloro Clorox 1L', precio: 1400, costo: 800, unidades_caja: 12 },
      { codigo: 'AH004', descripcion: 'Desengrasante 500ml', precio: 1200, costo: 680, unidades_caja: 12 },
      { codigo: 'AH005', descripcion: 'Lavavajillas Quix 500ml', precio: 1600, costo: 950, unidades_caja: 12 },
      { codigo: 'AH006', descripcion: 'Esponja Scotch-Brite x2', precio: 1100, costo: 620, unidades_caja: 24 },
      { codigo: 'AH007', descripcion: 'Lavandina 1L', precio: 1000, costo: 560, unidades_caja: 12 },
      { codigo: 'AH008', descripcion: 'Suavizante Downy 1L', precio: 2400, costo: 1500, unidades_caja: 12 },
      { codigo: 'AH009', descripcion: 'Jabón Rinso 500g', precio: 1200, costo: 680, unidades_caja: 20 },
    ]},
  ]

  let id = 1
  const result = []
  for (const { cat, rol, productos } of categorias) {
    for (const p of productos) {
      result.push({
        id: id++,
        codigo: p.codigo,
        descripcion: p.descripcion,
        categoria: cat,
        rol,
        precio_venta: p.precio,
        costo: p.costo,
        margen: 0.86,
        precio_volumen: Math.round(p.precio * 0.9),
        volumen_minimo: 6,
        precio_ruta: Math.round(p.precio * 0.9),
        precio_ruta_minimo: 6,
        precio_mayorista: Math.round(p.precio * 0.8),
        precio_mayorista_minimo: p.unidades_caja,
        unidades_caja: p.unidades_caja,
        descripcion_detallada: '',
        activo: true
      })
    }
  }
  return result
}

// ── PEDIDOS CLIENTE ──────────────────────────────────────────────────────────
export async function getPedidosCliente(filters = {}) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      let q = sb.from('pedidos_cliente').select('*').order('created_at', { ascending: false })
      if (filters.vendedor_id) q = q.eq('vendedor_id', filters.vendedor_id)
      if (filters.cliente_id) q = q.eq('cliente_id', filters.cliente_id)
      if (filters.estado) q = q.eq('estado', filters.estado)
      const { data } = await q
      if (data) return data
    } catch (e) { console.error('getPedidosCliente error:', e) }
  }
  let data = lsGet('em_pedidos_cliente')
  if (filters.vendedor_id) data = data.filter(p => p.vendedor_id === filters.vendedor_id)
  if (filters.cliente_id) data = data.filter(p => p.cliente_id === filters.cliente_id)
  if (filters.estado) data = data.filter(p => p.estado === filters.estado)
  return data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function createPedidoCliente(pedido) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('pedidos_cliente').insert(pedido).select().single()
      if (data) return data
    } catch (e) { console.error('createPedidoCliente error:', e) }
  }
  const arr = lsGet('em_pedidos_cliente')
  const nuevo = { ...pedido, id: nextId(arr), created_at: new Date().toISOString() }
  lsSet('em_pedidos_cliente', [...arr, nuevo])
  return nuevo
}

export async function updatePedidoCliente(id, changes) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('pedidos_cliente').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (data) return data
    } catch (e) { console.error('updatePedidoCliente error:', e) }
  }
  const arr = lsGet('em_pedidos_cliente').map(p => p.id === id ? { ...p, ...changes } : p)
  lsSet('em_pedidos_cliente', arr)
  return arr.find(p => p.id === id)
}

export async function countPedidosPendientes(vendedor_id = null) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      let q = sb.from('pedidos_cliente').select('id', { count: 'exact' }).eq('estado', 'pendiente')
      if (vendedor_id) q = q.eq('vendedor_id', vendedor_id)
      const { count } = await q
      return count || 0
    } catch (e) { console.error('countPedidosPendientes error:', e) }
  }
  const data = lsGet('em_pedidos_cliente').filter(p => p.estado === 'pendiente' && (!vendedor_id || p.vendedor_id === vendedor_id))
  return data.length
}

// ── CONSULTAS LIGERAS PARA EL DASHBOARD ────────────────────────────────────────
// Solo cuentan/resumen, sin bajar filas completas ni datos anidados pesados.
export async function countClientes(filters = {}) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      let q = sb.from('clientes').select('id', { count: 'exact', head: true })
      if (filters.vendedor_id) q = q.eq('vendedor_id', filters.vendedor_id)
      const { count } = await q
      return count || 0
    } catch (e) { console.error('countClientes error:', e) }
  }
  return (await getClientes(filters)).length
}

export async function countRutas(vendedor_id = null) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      let q = sb.from('rutas').select('id', { count: 'exact', head: true })
      if (vendedor_id) q = q.eq('vendedor_id', vendedor_id)
      const { count } = await q
      return count || 0
    } catch (e) { console.error('countRutas error:', e) }
  }
  return (await getRutas(vendedor_id)).length
}

// Ventas sin los ítems (venta_items) — para el Dashboard basta total + datos básicos.
export async function getVentasResumen(filters = {}) {
  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabase()
      let q = sb.from('ventas').select('id,cliente_nombre,total,estado_entrega,monto_entregado,created_at,clientes(nombre)').order('created_at', { ascending: false })
      if (filters.vendedor_id) q = q.eq('vendedor_id', filters.vendedor_id)
      const { data } = await q
      if (data) return data
    } catch (e) { console.error('getVentasResumen error:', e) }
  }
  return getVentas(filters)
}

export { isSupabaseConfigured }
