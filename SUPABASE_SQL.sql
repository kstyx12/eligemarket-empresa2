-- ═══════════════════════════════════════════════════════════
-- EligeMarket — SQL para Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
-- Este script es IDEMPOTENTE: se puede volver a ejecutar sobre una
-- base existente sin perder datos (usa "if not exists" / "add column
-- if not exists"). Refleja el esquema REAL que usa la app.
-- ═══════════════════════════════════════════════════════════

-- 1. USUARIOS
create table if not exists usuarios (
  id serial primary key,
  username text unique not null,
  password text not null,
  nombre text not null,
  role text not null default 'vendedor' check (role in ('admin','vendedor')),
  created_at timestamptz default now()
);

-- 2. CLIENTES
create table if not exists clientes (
  id serial primary key,
  tipo text default 'empresa' check (tipo in ('empresa','persona')),
  nombre text not null,
  rut text,
  contacto text,
  email text,
  telefono text,
  direccion text,
  comuna text,
  ciudad text,
  observaciones text,
  vendedor_id integer references usuarios(id),
  created_at timestamptz default now()
);

-- Columnas añadidas después del diseño original (foto, GPS, portal cliente)
alter table clientes add column if not exists imagen_url text;
alter table clientes add column if not exists latitud numeric;
alter table clientes add column if not exists longitud numeric;
alter table clientes add column if not exists username text;   -- credenciales portal cliente
alter table clientes add column if not exists password text;   -- credenciales portal cliente
alter table clientes add column if not exists canal text default 'Ruta';

-- 3. RUTAS
create table if not exists rutas (
  id serial primary key,
  nombre text not null,
  descripcion text,
  vendedor_id integer references usuarios(id),
  created_at timestamptz default now()
);

-- 4. RUTA_CLIENTES
create table if not exists ruta_clientes (
  ruta_id integer references rutas(id) on delete cascade,
  cliente_id integer references clientes(id) on delete cascade,
  primary key (ruta_id, cliente_id)
);

-- 5. PRODUCTOS
create table if not exists productos (
  id serial primary key,
  codigo text unique,
  descripcion text not null,
  categoria text,
  rol text,
  precio_venta numeric default 0,
  costo numeric default 0,
  margen numeric default 0.86,
  precio_volumen numeric default 0,
  volumen_minimo integer default 6,
  unidades_caja integer default 12,
  descripcion_detallada text,
  activo boolean default true,
  created_at timestamptz default now()
);

-- Precios escalonados añadidos después (ruta / mayorista) usados por el portal cliente
alter table productos add column if not exists precio_ruta numeric default 0;
alter table productos add column if not exists precio_ruta_minimo integer default 6;
alter table productos add column if not exists precio_mayorista numeric default 0;
alter table productos add column if not exists precio_mayorista_minimo integer default 12;
alter table productos add column if not exists imagen_url text;

-- 6. VENTAS
create table if not exists ventas (
  id serial primary key,
  cliente_id integer references clientes(id),
  cliente_nombre text,
  vendedor_id integer references usuarios(id),
  vendedor_nombre text,
  subtotal numeric default 0,
  descuento_global numeric default 0,
  total numeric default 0,
  created_at timestamptz default now()
);

-- 7. VENTA_ITEMS
create table if not exists venta_items (
  id serial primary key,
  venta_id integer references ventas(id) on delete cascade,
  producto_id integer references productos(id),
  codigo text,
  descripcion text,
  cantidad integer default 1,
  precio_unitario numeric default 0,
  descuento_item numeric default 0,
  subtotal numeric default 0
);

-- 8. PEDIDOS_CLIENTE (pedidos entrantes desde el portal del cliente)
create table if not exists pedidos_cliente (
  id serial primary key,
  cliente_id integer references clientes(id),
  cliente_nombre text,
  vendedor_id integer references usuarios(id),
  items text,                    -- JSON stringificado con los ítems del pedido
  subtotal numeric default 0,
  total numeric default 0,
  plazo_despacho text,
  notas_cliente text,
  estado text default 'pendiente',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 9. VISITAS (registro de visitas del vendedor a clientes)
create table if not exists visitas (
  id serial primary key,
  cliente_id integer references clientes(id),
  cliente_nombre text,
  vendedor_id integer references usuarios(id),
  vendedor_nombre text,
  tipo text default 'visita',
  notas text,
  imagen_url text,
  latitud numeric,
  longitud numeric,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════
-- DATOS INICIALES
-- ═══════════════════════════════════════════════════════════

-- Usuarios por defecto
insert into usuarios (username, password, nombre, role) values
  ('admin', 'admin123', 'Administrador', 'admin'),
  ('sergio', 'sergio123', 'Sergio', 'vendedor')
on conflict (username) do nothing;

-- ═══════════════════════════════════════════════════════════
-- STORAGE
-- La app sube fotos a dos buckets (crear en Dashboard → Storage,
-- marcarlos como "public"):
--   • fotos-clientes   (fotos de clientes y de visitas)
--   • Fotos-productos   (fotos de productos — ojo: F mayúscula)
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- RLS (Row Level Security)
-- Políticas permisivas: la app usa auth propia (no Supabase Auth),
-- así que la anon/publishable key necesita acceso vía anon.
-- ⚠️ Esto da acceso total de lectura/escritura con la clave pública.
-- ═══════════════════════════════════════════════════════════
alter table usuarios enable row level security;
alter table clientes enable row level security;
alter table rutas enable row level security;
alter table ruta_clientes enable row level security;
alter table productos enable row level security;
alter table ventas enable row level security;
alter table venta_items enable row level security;
alter table pedidos_cliente enable row level security;
alter table visitas enable row level security;

-- Políticas permisivas para anon key (acceso público autenticado por app)
drop policy if exists "allow_all_usuarios" on usuarios;
drop policy if exists "allow_all_clientes" on clientes;
drop policy if exists "allow_all_rutas" on rutas;
drop policy if exists "allow_all_ruta_clientes" on ruta_clientes;
drop policy if exists "allow_all_productos" on productos;
drop policy if exists "allow_all_ventas" on ventas;
drop policy if exists "allow_all_venta_items" on venta_items;
drop policy if exists "allow_all_pedidos_cliente" on pedidos_cliente;
drop policy if exists "allow_all_visitas" on visitas;

create policy "allow_all_usuarios" on usuarios for all using (true) with check (true);
create policy "allow_all_clientes" on clientes for all using (true) with check (true);
create policy "allow_all_rutas" on rutas for all using (true) with check (true);
create policy "allow_all_ruta_clientes" on ruta_clientes for all using (true) with check (true);
create policy "allow_all_productos" on productos for all using (true) with check (true);
create policy "allow_all_ventas" on ventas for all using (true) with check (true);
create policy "allow_all_venta_items" on venta_items for all using (true) with check (true);
create policy "allow_all_pedidos_cliente" on pedidos_cliente for all using (true) with check (true);
create policy "allow_all_visitas" on visitas for all using (true) with check (true);
