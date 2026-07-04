# EligeMarket — Gestión Comercial

Sistema de gestión para vendedores en ruta. React 18 + Vite + Supabase.

---

## 🚀 PASO A PASO: Publicar en GitHub Pages

### 1. Crear repositorio en GitHub
1. Ve a github.com → **New repository**
2. Nombre: `eligemarket` (o el que prefieras)
3. Público ✅
4. **No** inicialices con README
5. Clic en **Create repository**

### 2. Subir archivos (sin terminal)
1. En tu repositorio vacío, clic en **"uploading an existing file"**
2. Arrastra **todos los archivos y carpetas** del proyecto
3. Commit message: `Initial commit`
4. Clic **Commit changes**

> ⚠️ Importante: sube también la carpeta `.github/workflows/deploy.yml`

### 3. Activar GitHub Pages
1. Ve a tu repo → **Settings** → **Pages**
2. Source: **GitHub Actions**
3. Guarda

### 4. Esperar el deploy
1. Ve a **Actions** en tu repositorio
2. Verás el workflow corriendo (~2-3 minutos)
3. Cuando termine, tu app estará en: `https://TU_USUARIO.github.io/eligemarket/`

---

## 🗄️ Configurar Supabase (opcional pero recomendado)

Sin Supabase, la app funciona con **localStorage** (datos solo en ese dispositivo).
Con Supabase, todos los dispositivos comparten los mismos datos.

### 1. Crear proyecto Supabase
1. Ve a [supabase.com](https://supabase.com) → **New Project**
2. Nombre: `eligemarket`, elige región más cercana
3. Espera ~2 minutos a que se cree

### 2. Ejecutar el SQL
1. En Supabase → **SQL Editor** → **New Query**
2. Copia y pega el contenido de `SUPABASE_SQL.sql`
3. Clic **Run** ▶️

### 3. Obtener credenciales
1. Ve a **Settings** → **API**
2. Copia:
   - **Project URL** (ej: `https://abcdefgh.supabase.co`)
   - **anon public** key (cadena larga)

### 4. Pegar en el código
Edita `src/lib/supabase.js`:
```js
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co'  // ← tu URL
const SUPABASE_ANON_KEY = 'TU_ANON_KEY_AQUI'            // ← tu anon key
```

### 5. Volver a subir ese archivo
Sube `src/lib/supabase.js` actualizado a GitHub → el deploy se ejecuta automáticamente.

---

## 👤 Credenciales por defecto

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin | admin123 | Administrador |
| sergio | sergio123 | Vendedor |

> Cambia las contraseñas desde **Configuración** después de ingresar.

---

## 📦 Módulos incluidos

- **Dashboard** — Stats, pedidos recientes, accesos rápidos
- **Clientes** — CRUD completo, WhatsApp, Google Maps, filtros
- **Rutas** — CRUD, asignación de clientes
- **Catálogo** — 179 productos en 15 categorías, vista tabla/grid
- **Ventas** — Carrito, descuentos, generación PDF automática
- **Configuración** — Usuarios, contraseñas, exportación CSV, estado Supabase

---

## 🔑 Permisos por rol

| Función | Admin | Vendedor |
|---------|-------|----------|
| Ver todos los clientes | ✅ | ❌ (solo los suyos) |
| Ver todas las ventas | ✅ | ❌ (solo las suyas) |
| Ver costo/margen productos | ✅ | ❌ |
| Eliminar ventas | ✅ | ❌ |
| Gestionar usuarios | ✅ | ❌ |
| Exportar CSV | ✅ | ❌ |
