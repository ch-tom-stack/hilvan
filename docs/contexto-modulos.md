# Hilván — Contexto completo para desarrollo de módulos

*Última actualización: junio 2026. Este documento es la fuente canónica para arrancar un módulo nuevo.*

---

## 1. Qué es Hilván

Sistema operativo interno de **Casa Hiedra**, productora audiovisual en Santiago de Chile. No es un SaaS público — es una herramienta interna usada por el equipo y colaboradores externos (freelancers, modelos, proveedores, clientes). En producción en `app.casahiedra.com`. Repositorio: `github.com/ch-tom-stack/hilvan`, rama `main`.

El nombre "Hilván" es una puntada provisional en costura: une las piezas antes de coserlas en definitivo. Metáfora de un sistema que conecta producción, finanzas y personas.

---

## 2. Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js **16.2.4** (App Router, Turbopack) |
| Lenguaje | TypeScript estricto |
| Estilos | Tailwind CSS **v4** |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Deploy | Vercel (auto desde `main`) |
| Email | Nodemailer via Gmail SMTP |

### Variables de entorno
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=https://app.casahiedra.com
GMAIL_USER=natalia@casahiedra.com
GMAIL_APP_PASSWORD=...
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_CALENDAR_ID
GOOGLE_SERVICE_ACCOUNT_KEY
CRON_SECRET
```

---

## 3. Reglas críticas — leer antes de escribir código

### Middleware
El middleware se llama **`proxy.ts`** (no `middleware.ts`). Exporta `export function proxy` + `export const config`. Crear `middleware.ts` tumba el servidor con Turbopack — no hacerlo nunca. Las rutas públicas se declaran ahí con `pathname.startsWith(...)`.

### Tailwind v4
Sin `tailwind.config.ts`. Todo en `globals.css`:
```css
@import "tailwindcss";
@theme { /* tokens ch-* */ }
```
Nunca usar clases `zinc-*`, `gray-*` en componentes nuevos — solo tokens `ch-*`.

### TypeScript
Estricto. Usar `|| undefined` en vez de `null` donde se espera `string`. El archivo canónico de tipos es **`types/index.ts`** — leerlo completo antes de editar. Nunca sobreescribirlo parcialmente.

### Supabase — dos clientes, regla clara
```typescript
// Rutas PÚBLICAS (sin sesión de usuario):
import { createAdminClient } from '@/lib/supabase/admin'
const admin = createAdminClient()  // bypasa RLS

// Rutas PROTEGIDAS (con sesión):
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()  // respeta RLS
```
**`createAdminClient()` nunca exime de verificar la sesión.** Siempre validar con `supabase.auth.getUser()` ANTES de cualquier escritura, incluso cuando después se use el admin client.

### Campos con check constraint
`tipo_cuenta`, `banco`, `tipo_documento` en colaboradores: convertir `''` → `null` antes de escribir a DB.

### Fechas planas
Nunca `new Date('2026-06-17')` directo — se corre un día por UTC. Usar `'2026-06-17T12:00:00'` o los helpers de `lib/fechas.ts`.

### Dinero
Siempre `parseFloat` + `Number.isFinite`, nunca `parseInt` para precios (trunca centavos). Formatear con `formatCLP()` de `types/index.ts`.

---

## 4. Arquitectura de archivos

```
app/
  (dashboard)/           ← rutas autenticadas, layout con Sidebar
    [modulo]/
      page.tsx           ← server component: fetch datos, render layout
      [id]/page.tsx      ← detalle
      [id]/editar/page.tsx
      nuevo/page.tsx
      ComponenteCliente.tsx  ← 'use client', interactividad
  [ruta-publica]/        ← sin autenticación, fuera del grupo (dashboard)
  api/
    [modulo]/
      [endpoint]/route.ts
  actions/
    [modulo].ts          ← server actions ('use server')
components/
  [modulo]/              ← componentes reutilizables del módulo
  ui/                    ← componentes genéricos (EstadoVacio, etc.)
  layout/
    Sidebar.tsx
lib/
  supabase/
    server.ts            ← createClient()
    admin.ts             ← createAdminClient()
  email.ts               ← sendEmail() via nodemailer
  toast.ts               ← toastError(), toastSuccess()
  fechas.ts              ← helpers de fechas
  cotizaciones-calc.ts   ← cálculos cotización/rental
  rendiciones-calc.ts    ← calcularRetencion()
types/
  index.ts               ← TODOS los tipos TypeScript + constantes
sql/
  grants.sql             ← registro de todos los GRANTs
  [nombre].sql           ← una migration por feature
docs/                    ← este archivo y otros contextos
proxy.ts                 ← middleware + rutas públicas
```

---

## 5. Patrones de implementación

### Server component (page.tsx)
```typescript
// app/(dashboard)/modulo/page.tsx
import { createClient } from '@/lib/supabase/server'
import ComponenteCliente from './ComponenteCliente'

export default async function ModuloPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('tabla').select('*').order('created_at', { ascending: false })
  return <ComponenteCliente items={data ?? []} />
}
```
Para rutas públicas, usar `createAdminClient()` en vez de `createClient()`.

### Client component
```typescript
'use client'
import { useState, useTransition } from 'react'
import { miAccion } from '@/app/actions/modulo'
import { toastError } from '@/lib/toast'

export default function ComponenteCliente({ items }) {
  const [pending, startTransition] = useTransition()

  const handleAccion = () => {
    startTransition(async () => {
      try {
        const res = await miAccion(datos)
        if (res.error) toastError(res.error)
      } catch {
        toastError('Error inesperado')
      }
    })
  }
  // ...
}
```

### Server action
```typescript
// app/actions/modulo.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function crearCosa(formData: FormData) {
  const supabase = await createClient()

  // 1. Verificar sesión (siempre primero)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // 2. Verificar rol si el módulo es restringido
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return { error: 'Sin permisos' }

  // 3. Lógica
  const { error } = await supabase.from('tabla').insert({ ... })
  if (error) return { error: error.message }

  revalidatePath('/modulo')
  return { success: true }
}
```

### API route pública
```typescript
// app/api/modulo/endpoint/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.campo) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    // lógica
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
```
Declarar en `proxy.ts`: `pathname.startsWith('/api/modulo/')`.

### SQL migration
```sql
-- sql/modulo_nombre.sql
ALTER TABLE tabla ADD COLUMN IF NOT EXISTS campo text;

CREATE TABLE IF NOT EXISTS nueva_tabla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campo text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Siempre agregar grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nueva_tabla TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nueva_tabla TO service_role;
```

### Confirmación inline (sin window.confirm)
`window.confirm()` bloquea el browser en algunos contextos. Patrón alternativo:
```typescript
const [confirmando, setConfirmando] = useState(false)

if (confirmando) {
  return (
    <div className="border border-red-400/30 p-3 space-y-2">
      <p className="font-body text-[10px] text-ch-cream">¿Confirmar acción?</p>
      <div className="flex gap-2">
        <button onClick={() => setConfirmando(false)} className="...">Cancelar</button>
        <button onClick={handleAccion} className="...">Confirmar</button>
      </div>
    </div>
  )
}
return <button onClick={() => setConfirmando(true)}>Eliminar</button>
```

---

## 6. Email transaccional
```typescript
import { sendEmail } from '@/lib/email'

await sendEmail({
  to: 'destino@ejemplo.com',
  subject: 'Asunto',
  html: `<div style="background:#111110;...">contenido</div>`,
  contexto: 'modulo:tipo_email',  // para logs internos
})
```
- Emisor: `natalia@casahiedra.com` via Gmail SMTP
- Los fallos de email **no abortan** la operación principal — pero se registran (no `catch {}` vacío)
- Emails con inline CSS, paleta ch- reproducida en hex

---

## 7. Módulos activos — estado actual (junio 2026)

| CH | Módulo | Ruta | Roles |
|----|--------|------|-------|
| 1 | Equipos | `/equipos` | todos |
| 2 | Cotizaciones | `/cotizaciones` | todos |
| 3 | Rodajes | `/rodaje` | todos (oculto para contabilidad) |
| 4 | Colaboradores | `/colaboradores` | todos (oculto para contabilidad) |
| 5 | Rendiciones | `/rendiciones` | todos |
| 6 | Financiero | `/financiero` | solo admin + contabilidad |
| 7 | Clientes | `/clientes` | todos (oculto para contabilidad) |
| 8 | Calendario | `/calendario` | todos (oculto para contabilidad) |
| 9 | Rental | `/rental` (interno) + `rental.casahiedra.com` (público) | todos |
| — | Usuarios | `/usuarios` | solo admin |
| — | Perfil | `/perfil` | todos |

### Roles
```typescript
type Rol = 'admin' | 'productor' | 'contabilidad'
```
- `admin`: acceso total
- `productor`: todo excepto Financiero y Usuarios
- `contabilidad`: solo Cotizaciones, Rendiciones, Financiero

---

## 8. Rutas públicas (sin autenticación)

Declaradas en `proxy.ts`. Diseño minimalista, sin Sidebar.

| Ruta | Descripción |
|------|-------------|
| `/login` | Login |
| `/arriendo` + `rental.casahiedra.com` | Catálogo rental público |
| `/cotizacion/[token]` | Vista cliente de cotización |
| `/preview/[id]` | Vista previa interna de cotización |
| `/rodaje/[id]/ver` | Viewer en vivo con Realtime |
| `/citacion/[token]` | Confirmación de citación de rodaje |
| `/col/[token]` | Portal onboarding colaborador |
| `/r/[token]` | Portal externo de rendición |
| `/m/[codigo]` | Ficha pública de maleta (QR) |
| `/api/cotizaciones/[id]/pdf` | PDF cotización |
| `/api/rodaje/[id]/pdf` | PDF hoja de llamados |
| `/api/arriendo/cotizar` | Envío de cotización rental |
| `/api/cron/*` | Cron jobs (con CRON_SECRET) |
| `/api/agent/*` | API para agente Cowork |

---

## 9. Sistema de diseño

### Colores — tokens `ch-*`

```
ch-black:       #111110   fondo base
ch-dark:        #1c1c1a   fondo body / backgrounds secundarios
ch-surface:     #242422   cards, inputs, tablas
ch-border:      #383836   bordes
ch-muted:       #9a9a92   texto secundario, placeholders
ch-subtle:      #8c8c86   texto terciario, íconos inactivos
ch-cream:       #f5f0e8   texto principal
ch-green:       #7a9e7e   acento principal, CTA, estados activos
ch-green-light: #9dbfa1   hover del verde
ch-gold:        #c9a84c   advertencia, pendiente, atención
ch-gold-light:  #dfc078   hover del dorado
```

### Tipografía

| Uso | Clases Tailwind |
|-----|----------------|
| Título de módulo/página | `font-display italic text-4xl lg:text-5xl text-ch-cream leading-none` |
| Título de card o sección grande | `font-display italic text-2xl text-ch-cream` |
| Microlabel de sección | `font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted` |
| Cuerpo de texto | `font-body text-sm text-ch-cream` |
| Texto secundario | `font-body text-xs text-ch-muted` |
| Código / RUT / códigos internos | `font-mono text-xs` |
| Botón CTA label | `font-body text-[10px] tracking-[0.35em] uppercase` |

### Reglas inmutables
- **Sin `border-radius`** — máximo `rounded-[2px]` en casos excepcionales
- **Sin `box-shadow`** — la profundidad se crea con color de fondo y borde
- **Sin fuentes adicionales** — solo Cormorant Garamond (display) + DM Sans (body)
- **Sin clases `zinc-*` o `gray-*`** en componentes nuevos
- Los títulos display son **siempre itálicos**, nunca bold

### Componentes UI recurrentes

**Input estándar:**
```html
<input class="w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-subtle focus:outline-none focus:border-ch-green transition-colors" />
```

**Botón CTA (verde):**
```html
<button class="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors">
  Guardar
</button>
```

**Botón secundario (borde):**
```html
<button class="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
  Cancelar
</button>
```

**Header de página:**
```html
<div class="flex items-end justify-between mb-10">
  <div>
    <p class="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">Módulo CH-N</p>
    <h1 class="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Nombre</h1>
  </div>
  <button class="bg-ch-green ...">+ Nuevo</button>
</div>
```

**Tabla de datos:**
```html
<div class="border border-ch-border overflow-x-auto">
  <table class="w-full">
    <thead>
      <tr class="border-b border-ch-border bg-ch-surface/50">
        <th class="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Col</th>
      </tr>
    </thead>
    <tbody>
      <tr class="border-b border-ch-border/50 hover:bg-ch-surface/30 transition-colors">
        <td class="px-5 py-4 font-body text-sm text-ch-cream">valor</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Card:**
```html
<div class="border border-ch-border bg-ch-surface/30 p-6">
  <p class="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-4">Sección</p>
  <!-- contenido -->
</div>
```

**Estado vacío:**
```html
<div class="border border-dashed border-ch-border p-20 text-center">
  <p class="font-body text-sm text-ch-muted">No hay elementos registrados aún.</p>
</div>
```

**Tag de estado:**
```html
<!-- verde -->
<span class="border border-ch-green/40 text-ch-green font-body text-[9px] tracking-[0.2em] uppercase px-2.5 py-1">Activo</span>
<!-- dorado -->
<span class="border border-ch-gold/40 text-ch-gold font-body text-[9px] tracking-[0.2em] uppercase px-2.5 py-1">Pendiente</span>
<!-- muted -->
<span class="border border-ch-border text-ch-muted font-body text-[9px] tracking-[0.2em] uppercase px-2.5 py-1">Inactivo</span>
```

---

## 10. Módulo Rental — referencia de implementación de módulo público

El rental es un subdominio público (`rental.casahiedra.com`) sin autenticación que muestra un catálogo de equipos con carrito y formulario de cotización.

### Subdomain routing en `proxy.ts`
```typescript
if (hostname === 'rental.casahiedra.com') {
  const url = request.nextUrl.clone()
  url.pathname = '/arriendo' + (pathname === '/' ? '' : pathname)
  return NextResponse.rewrite(url)
}
```

### Estructura de archivos
```
app/arriendo/
  page.tsx              ← server component, createAdminClient()
  CatalogoCliente.tsx   ← 'use client': carrito, filtros, buscador, formulario
  VideoPromoPopup.tsx   ← popup MP4 (una vez por sesión via sessionStorage)
  BundleCamionBtn.tsx   ← botón flotante + modal descripción bundle
app/api/arriendo/
  cotizar/route.ts      ← POST: envía emails al equipo + al cliente
```

### Patrones del catálogo público

**Fetch en server component con admin client:**
```typescript
const admin = createAdminClient()
const [{ data: categorias }, { data: equipos }] = await Promise.all([
  admin.from('categorias_equipo').select('*').eq('activa', true).order('orden'),
  admin.from('equipos').select('*, categoria:categorias_equipo(*)').eq('rentable', true),
])
```

**Layout con carrito condicional:**
```typescript
<div className={carritoActivo
  ? 'lg:grid lg:grid-cols-[1fr_300px] lg:gap-10 lg:items-start'
  : 'max-w-6xl mx-auto'
}>
```

**Filtro de búsqueda client-side:**
```typescript
const equiposFiltrados = useMemo(() => {
  let lista = categoriaActiva ? equipos.filter(e => e.categoria_codigo === categoriaActiva) : equipos
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase()
    lista = lista.filter(e =>
      e.nombre.toLowerCase().includes(q) ||
      e.marca?.toLowerCase().includes(q)
    )
  }
  return lista
}, [equipos, categoriaActiva, busqueda])
```

**Popup de video una vez por sesión:**
```typescript
useEffect(() => {
  if (!VIDEO_URL) return
  if (!sessionStorage.getItem('ch_rental_promo_visto')) setVisible(true)
}, [])
```

---

## 11. Tablas Supabase relevantes

### Equipos (`equipos`)
```sql
id                uuid PK
codigo            text UNIQUE  -- ej: CH-CAM-001
nombre            text
categoria_codigo  text FK → categorias_equipo.codigo
subcategoria      text         -- Focos, Lentes, SD, etc.
marca             text
modelo            text
numero_serie      text
descripcion       text
notas             text
estado            text         -- disponible | en_uso | en_mantenimiento | pendiente_compra
cantidad          integer DEFAULT 1
rentable          boolean DEFAULT false
precio_jornada    integer
fotos             text[]
created_at        timestamptz
```

### Categorías de equipos (`categorias_equipo`)
| Código | Nombre | Subcategorías |
|--------|--------|---------------|
| CAM | Cámaras | — |
| OPT | Óptica | Lentes, Filtros |
| RIG | Rig y accesorios | — |
| MON | Monitores y transmisión | — |
| SON | Sonido | — |
| MOV | Estabilización y movimiento | — |
| ILU | Iluminación | Focos, Modificadores, Tubos y paneles |
| MOD | Modificadores | — |
| FON | Fondos | Fondo papel, Fondo tela/muslin, Fondo vinilo, Chroma key, Portafondos |
| GRI | Grip y soportes | — |
| ENE | Energía y cables | — |
| PRO | Producción | — |
| VFX | Efectos especiales | — |
| ALM | Almacenamiento | SD, SSD, CFExpress A, CFExpress B |
| DRO | Drones | — |
| OTR | Otros | — |

### Auth (`profiles`)
```sql
id      uuid PK (= auth.users.id)
email   text
nombre  text
rol     text  -- admin | productor | contabilidad
```

---

## 12. Convenciones generales

- **Idioma**: español en toda la UI
- **Moneda**: `formatCLP()` de `types/index.ts` — nunca `.toLocaleString('es-CL')` directamente
- **Toasts**: `toastError()` / `toastSuccess()` de `lib/toast.ts` — nunca `toast` de sonner directo
- **Fetch en cliente**: siempre `if (!res.ok) throw new Error()` antes de `res.json()`
- **JSON.parse**: siempre en try-catch
- **Links públicos con token**: `crypto.randomUUID()` — nunca solo el ID del recurso
- **Commits**: `feat: descripción` / `fix: descripción`
- **SQL files**: una migration por feature en `sql/nombre.sql`, con `IF NOT EXISTS`

---

## 13. Gotchas conocidos

- **`propuestas/mcp-mejoras`**: hay una rama de propuestas. Siempre confirmar que se está en `main` antes de commitar.
- **`Uint8Array` vs Buffer**: si se pasa un Buffer de Node a `NextResponse`, convertir a `Uint8Array`.
- **`pdf-parse`**: importar con dynamic import o rompe el build de Next.js.
- **`FullCalendar`**: importar con `dynamic(..., { ssr: false })`, el CSS va bundleado en el JS.
- **`rodaje_bloques`**: tiene `REPLICA IDENTITY FULL` y políticas anon para Realtime.
- **Vercel cold starts**: las mutaciones a veces dan 503 pero sí se ejecutan en Supabase — verificar antes de reintentar.
- **`window.confirm()`**: bloquea en entornos CDP/automatización — usar confirmación inline con estado.
