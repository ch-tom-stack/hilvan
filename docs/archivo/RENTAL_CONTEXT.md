# Contexto completo — Módulo Rental (Hilván)

> **Estado al 23-05-2026:** Módulo 100% funcional en producción.
> SQL ejecutado · código commiteado y pusheado · precios de rental cargados · testeado en browser.
> Este documento es el briefing autosuficiente para continuar. Lee todo antes de escribir código.

---

## 1. El proyecto base: Hilván

**Hilván** es el sistema de gestión interno de **Casa Hiedra**, productora audiovisual de Santiago de Chile.  
Stack: **Next.js 16.2.4 · React 19 · Supabase · Tailwind CSS v4 · TypeScript estricto**

```
Ruta raíz:
/Users/tomasmontealegre/Documents/Automatizaciones DaVinci/CH Hilván/v1/hilvan/
```

⚠️ **REGLA #1 — Antes de tocar Next.js:**
```
node_modules/next/dist/docs/
```
Esta versión tiene breaking changes respecto al training data (params como `Promise`, etc.).

---

## 2. Estado actual — qué está hecho y qué falta

### ✅ Implementado en código

Todo el módulo está escrito y funciona localmente contra Supabase en producción.

**Rutas:**
```
app/(rental)/
  layout.tsx                            ← auth + RentalSidebar + flag esAdmin
  rental/
    page.tsx                            ← catálogo de equipos (filtros por categoría)
    [id]/page.tsx                       ← ficha de equipo + botón solicitar
  rental/maletas/
    page.tsx                            ← catálogo de maletas
    [id]/page.tsx                       ← ficha de maleta
  rental/reservas/
    page.tsx                            ← mis solicitudes (usuario) + gestión (admin/productor)
    nueva/page.tsx                      ← formulario solicitud con verificación de disponibilidad
  rental/cotizaciones/                  ← solo admin/productor
    page.tsx                            ← lista de cotizaciones
    nueva/page.tsx                      ← crear cotización (vinculable a reserva o libre)
    [id]/page.tsx                       ← editor completo (secciones, ítems, totales, PDF)
```

**Componentes:**
```
components/rental/
  RentalSidebar.tsx          ← sidebar desktop + header mobile
  FormularioReserva.tsx      ← form solicitud con verificación de disponibilidad inline
  GestionReservas.tsx        ← tabla de gestión para admin (aprobar/denegar/entregar/devolver)
  NuevaCotizacionForm.tsx    ← form creación de cotización
  EditorCotizacion.tsx       ← editor inline: secciones, ítems, estado, totales, descuentos
  RentalCotizacionPDF.tsx    ← template PDF con @react-pdf/renderer
```

**API:**
```
app/api/rental/cotizaciones/[id]/pdf/route.ts   ← GET → descarga PDF autenticado
```

**Server Actions** (`app/actions/rental.ts`): completas — ver sección 5.

**Tipos** (`types/index.ts`): extendido con `RentalCotizacion`, `RentalCotizacionSeccion`,
`RentalCotizacionItem`, `EstadoRentalCotizacion`, `subtotalRentalItem`, `calcularTotalesRental`.

**Email (Resend):** implementado — al crear reserva notifica a todos los admin/productor,
al cambiar estado notifica al solicitante.

**Google Calendar:** implementado — al aprobar una reserva, crea evento en el calendario
`estudiocasahiedra@gmail.com` vía service account. Usa `crearEventoGCal` de `lib/google-calendar.ts`.

### ✅ Ejecutado y verificado (23-05-2026)

| Tarea | Estado |
|-------|--------|
| SQL migration completo (4 tablas + RLS + GRANTs) | ✅ Ejecutado |
| `created_by` en `rental_reservas` | ✅ Ejecutado |
| `UPDATE equipos SET rentable = true` (todos) | ✅ Ejecutado |
| Precios `precio_jornada` cargados (37 equipos) | ✅ SQL ejecutado con criterio: cámaras 1.7%, lentes 2%, equipos >$500k 3.5%, $100k–$500k 4.5%, <$100k 6.5%. Referencia competitiva: NDJ Rentals (ndjrentals.com), precios ~15% por debajo |
| Commit y push a git (`origin/main`) | ✅ Commit `20d6fb6` + `f941b26` |
| "Rental" en sidebar de Hilván | ✅ Visible para todos los usuarios |
| ToggleRentable inline en `/equipos` | ✅ Activa/desactiva rentable sin entrar al detalle |
| Test catálogo, filtros por categoría | ✅ |
| Test cotizaciones: crear, ítems, estado, PDF | ✅ PDF descargado (R-002.pdf 28KB) |
| Test reservas: nueva solicitud, disponibilidad, tabs | ✅ |
| Maleta de lentes NISI | ⏳ Pendiente — la agrega Simón. Precio: valor mercado maleta completa × 2% |

### ⏳ Pendiente de verificación en producción (Vercel)

| Integración | Estado | Qué verificar |
|------------|--------|---------------|
| Email Resend | Código listo, no verificado en prod | ¿Llega email al admin al crear reserva? ¿Llega al solicitante al cambiar estado? Requiere dominio `casahiedra.com` verificado en Resend |
| Google Calendar | Código listo, no verificado en prod | ¿Aparece evento en `estudiocasahiedra@gmail.com` al aprobar una reserva? Requiere `GOOGLE_SERVICE_ACCOUNT_KEY` activo en Vercel |

### 🔧 Pendientes funcionales (backlog)

| Función | Detalle |
|---------|---------|
| **Descuento por ítem** | La DB tiene `descuento` y `descuento_tipo` por ítem, pero `EditorCotizacion.tsx` no expone esos campos — se guardan siempre como 0 |
| **Reordenar ítems/secciones** | El campo `orden` existe en ambas tablas, sin drag-and-drop aún |
| **URL pública cotización** | Para compartir sin login requiere columna `token` en `rental_cotizaciones` + ruta pública en `proxy.ts` |
| **Maleta NISI** | Agregarla en `/equipos/nuevo` con `rentable=true` y `precio_jornada = valor_mercado × 2%` |

---

## 3. SQL migration completo

Ejecutar **en este orden** en Supabase → SQL Editor:

```sql
-- ─── 1. Agregar created_by a rental_reservas ─────────────────────
ALTER TABLE public.rental_reservas
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 2. Tabla rental_cotizaciones ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_cotizaciones (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero               TEXT NOT NULL UNIQUE,
  reserva_id           UUID REFERENCES public.rental_reservas(id) ON DELETE SET NULL,
  cliente_id           UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre_libre TEXT,
  cliente_email_libre  TEXT,
  estado               TEXT NOT NULL DEFAULT 'borrador'
                       CHECK (estado IN ('borrador','enviada','aprobada','rechazada','cerrada')),
  con_iva              BOOLEAN NOT NULL DEFAULT true,
  descuento_global     INTEGER NOT NULL DEFAULT 0,
  descuento_global_tipo TEXT NOT NULL DEFAULT 'porcentaje'
                       CHECK (descuento_global_tipo IN ('porcentaje','monto')),
  notas_internas       TEXT,
  notas_cliente        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE OR REPLACE TRIGGER update_rental_cotizaciones_updated_at
  BEFORE UPDATE ON public.rental_cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.rental_cotizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_cotizaciones_read"  ON public.rental_cotizaciones FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rental_cotizaciones_write" ON public.rental_cotizaciones FOR ALL    USING (auth.role() = 'authenticated');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_cotizaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_cotizaciones TO service_role;

-- ─── 3. Tabla rental_cotizacion_secciones ────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_cotizacion_secciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id UUID NOT NULL REFERENCES public.rental_cotizaciones(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  orden         INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rental_cotizacion_secciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_secciones_read"  ON public.rental_cotizacion_secciones FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rental_secciones_write" ON public.rental_cotizacion_secciones FOR ALL    USING (auth.role() = 'authenticated');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_cotizacion_secciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_cotizacion_secciones TO service_role;

-- ─── 4. Tabla rental_cotizacion_items ────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_cotizacion_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id   UUID NOT NULL REFERENCES public.rental_cotizaciones(id) ON DELETE CASCADE,
  seccion_id      UUID REFERENCES public.rental_cotizacion_secciones(id) ON DELETE SET NULL,
  equipo_id       UUID REFERENCES public.equipos(id) ON DELETE SET NULL,
  maleta_id       UUID REFERENCES public.maletas(id) ON DELETE SET NULL,
  descripcion     TEXT NOT NULL,
  cantidad        INTEGER NOT NULL DEFAULT 1,
  dias            INTEGER NOT NULL DEFAULT 1,
  precio_unitario INTEGER NOT NULL DEFAULT 0,
  descuento       INTEGER NOT NULL DEFAULT 0,
  descuento_tipo  TEXT NOT NULL DEFAULT 'porcentaje'
                  CHECK (descuento_tipo IN ('porcentaje','monto')),
  incluido        BOOLEAN NOT NULL DEFAULT false,
  orden           INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rental_cotizacion_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_items_read"  ON public.rental_cotizacion_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rental_items_write" ON public.rental_cotizacion_items FOR ALL    USING (auth.role() = 'authenticated');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_cotizacion_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_cotizacion_items TO service_role;
```

---

## 4. Tipos TypeScript — `types/index.ts`

Ya extendido. Tipos clave del módulo rental:

```typescript
// ─── Reservas ──────────────────────────────────────────────────────
export type EstadoRental =
  'pendiente' | 'aprobada' | 'denegada' | 'entregada' | 'devuelta'

export interface RentalReserva {
  id: string
  equipo_id: string | null
  maleta_id: string | null
  cliente_id: string | null
  fecha_inicio: string      // 'YYYY-MM-DD'
  fecha_fin: string
  estado: EstadoRental
  aprobada_por: string | null
  cotizacion_id: string | null
  notas: string | null
  created_by: string | null // ← nuevo (requiere SQL migration)
  created_at: string
  updated_at: string
}

// ─── Cotizaciones ──────────────────────────────────────────────────
export type EstadoRentalCotizacion =
  'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'cerrada'

export const ESTADO_RENTAL_COT_LABELS: Record<EstadoRentalCotizacion, string>
// { borrador: 'Borrador', enviada: 'Enviada', aprobada: 'Aprobada', ... }

export interface RentalCotizacion { /* ver types/index.ts */ }
export interface RentalCotizacionSeccion { /* ver types/index.ts */ }
export interface RentalCotizacionItem { /* ver types/index.ts */ }

// Helpers de cálculo (exportados)
export function subtotalRentalItem(item: RentalCotizacionItem): number
export function calcularTotalesRental(cotizacion): { neto, descuento_global_monto, neto_con_descuento, iva, total }
export function formatCLP(n: number): string  // '$1.000.000'
```

---

## 5. Server Actions — `app/actions/rental.ts` (634 líneas)

Patrón: todas devuelven `{ ok: true }` o `{ error: string }`.

### Catálogo

```typescript
listarEquiposRentables(categoriaFiltro?: string)
// → Equipo[] con categoria join — filtra rentable=true — usa createAdminClient

listarMaletasRental()
// → Maleta[] — usa createAdminClient

obtenerEquiposParaCotizacion()
// → Equipo[] rentables con categoria — para el selector del editor
```

### Reservas

```typescript
listarRentalReservas()
// → todas con joins equipo+maleta+cliente+solicitante(profiles)
// Fallback graceful si created_by aún no existe en la tabla

listarMisReservas()
// → solo las del usuario actual (created_by = user.id)

crearRentalReserva({ equipo_id?, maleta_id?, cliente_id?, fecha_inicio, fecha_fin, notas? })
// → { ok, id } | { error }
// Guarda created_by = user.id; fallback si la columna no existe aún
// Envía email a admin/productor via Resend

actualizarEstadoReserva(id, estado)
// → { ok } | { error } — requiere rol admin|productor
// Si estado === 'aprobada': guarda aprobada_por + crea evento en Google Calendar
// Envía email al solicitante (via profiles!rental_reservas_created_by_fkey)

eliminarReserva(id)
// → { ok } | { error } — requiere rol admin|productor

verificarDisponibilidad(equipoId, maletaId, fechaInicio, fechaFin, reservaIdExcluir?)
// → { disponible: boolean, conflictos: [{fecha_inicio,fecha_fin}][], stockTotal?, stockDisponible? }
// Verifica overlap con reservas en estado 'aprobada' o 'entregada'
// Para equipos con cantidad > 1: calcula stock disponible
```

### Cotizaciones (solo admin/productor)

```typescript
listarRentalCotizaciones()
// → RentalCotizacion[] con cliente+reserva joins — order by created_at DESC

obtenerRentalCotizacion(id)
// → cotización completa con secciones → ítems (join equipo+maleta)

crearRentalCotizacion({ reserva_id?, cliente_id?, cliente_nombre_libre?, con_iva, notas_internas?, notas_cliente? })
// → { ok, id }
// Genera número R-001/R-002/... auto
// Crea sección inicial "Equipos" (orden 1)

actualizarRentalCotizacion(id, campos)
// Campos editables: estado, con_iva, descuento_global, descuento_global_tipo,
//                  notas_internas, notas_cliente, cliente_id, cliente_nombre_libre, cliente_email_libre

agregarItemRentalCotizacion(cotizacionId, { seccion_id, equipo_id?, maleta_id?, descripcion, cantidad, dias, precio_unitario, incluido? })
// Asigna orden auto (MAX+1)

eliminarItemRentalCotizacion(itemId, cotizacionId)

agregarSeccionRentalCotizacion(cotizacionId, nombre)
// → { ok, id }
```

---

## 6. Integraciones — Email y Google Calendar

### Email (Resend)

```typescript
// Configurado en rental.ts:
const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Al crear reserva → email a todos los admin/productor
// Al actualizar estado → email al solicitante
// from: 'Hilván <noreply@casahiedra.com>'
// Requiere que casahiedra.com esté verificado en Resend (verificar en dashboard)
```

### Google Calendar

```typescript
// Importado en rental.ts:
import { crearEventoGCal } from '@/lib/google-calendar'

// Se llama al aprobar reserva:
await crearEventoGCal(
  `[RENTAL] ${itemLabel} · ${clienteLabel}`,
  new Date(`${fecha_inicio}T09:00:00-03:00`),
  new Date(`${fecha_fin}T20:00:00-03:00`),
  notas,
)
// Calendario: estudiocasahiedra@gmail.com
// Service account: hilvan-calendar@hilvan-casahiedra.iam.gserviceaccount.com
// Credencial: GOOGLE_SERVICE_ACCOUNT_KEY en .env.local y Vercel
```

---

## 7. PDF — `/api/rental/cotizaciones/[id]/pdf`

```typescript
// GET → descarga PDF (Content-Disposition: attachment; filename="R-001.pdf")
// Ruta protegida (requiere sesión)
// Renderizado con @react-pdf/renderer (renderToBuffer)
// Logo: /public/logos/logo-pdf.png → leído con fs.readFileSync → base64 (necesario para SSR)
// Template: components/rental/RentalCotizacionPDF.tsx
```

El PDF incluye: número, fecha, cliente, referencia a reserva, tabla de secciones+ítems
(con columnas Descripción / Cant. / Días / Precio/día / Subtotal), totales (subtotal, descuento, IVA, total), notas cliente, footer "Casa Hiedra · casahiedra.com".

---

## 8. Sistema de diseño

### Paleta (definida en `app/globals.css` con `@theme {}` — NO `tailwind.config.ts`)

| Token | Hex | Uso |
|-------|-----|-----|
| `ch-black` | `#111110` | Sidebar, fondos más oscuros |
| `ch-dark` | `#1c1c1a` | Fondo general de páginas |
| `ch-surface` | `#242422` | Cards, inputs, paneles |
| `ch-border` | `#383836` | Todos los bordes |
| `ch-subtle` | `#787872` | Texto terciario / decorativo |
| `ch-muted` | `#9a9a92` | Texto secundario (labels, metadatos) |
| `ch-cream` | `#f5f0e8` | Texto principal / alta jerarquía |
| `ch-green` | `#7a9e7e` | Acento principal, CTAs, positivo |
| `ch-green-light` | `#9dbfa1` | Hover de green |
| `ch-gold` | `#c9a84c` | Alertas, acento secundario |

**⚠️ NUNCA usar `text-ch-border`** — invisible sobre `ch-dark` (`#383836` sobre `#1c1c1a`).

### Tipografía

```
font-display  → Cormorant Garamond, italic — títulos de sección, nombres
font-body     → DM Sans — todo lo demás
```

Botones y labels: `uppercase tracking-[0.35em] text-[10px]` con `font-body`.

### Reglas de estilo invariables

- Máximo `rounded-[2px]` — sin `rounded-lg` ni `rounded-xl`
- Sin `box-shadow`
- Sin clases `zinc`/`gray`/`slate` en código nuevo
- Sin fuentes adicionales

### Patrones copy-paste

**Header de página:**
```tsx
<div className="flex items-end justify-between mb-10 flex-wrap gap-4">
  <div>
    <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
      Rental · Equipos
    </p>
    <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
      Catálogo
    </h1>
  </div>
  <div className="flex gap-3">{/* acciones */}</div>
</div>
```

**Botón CTA verde:**
```tsx
className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium
           text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors duration-200
           disabled:opacity-50"
```

**Botón secundario:**
```tsx
className="border border-ch-border text-ch-muted hover:text-ch-cream font-body
           text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors duration-200"
```

**Input / Select / Textarea:**
```tsx
className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
           px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]
           placeholder:text-ch-subtle"
```

**Label de campo:**
```tsx
<label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">
```

**Badge de estado de reserva:**
```typescript
const ESTADO_COLORS: Record<EstadoRental, string> = {
  pendiente: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
  aprobada:  'text-blue-400  border-blue-400/30  bg-blue-400/5',
  denegada:  'text-red-400   border-red-400/30   bg-red-400/5',
  entregada: 'text-ch-green  border-ch-green/30  bg-ch-green/5',
  devuelta:  'text-ch-muted  border-ch-border    bg-transparent',
}
// uso: <span className={`text-xs font-body px-2.5 py-0.5 rounded-[2px] border ${ESTADO_COLORS[estado]}`}>
```

**Estado vacío:**
```tsx
import EstadoVacio from '@/components/ui/EstadoVacio'
<EstadoVacio mensaje="No hay cotizaciones." submensaje="Crea la primera desde una reserva." />
// o inline:
<div className="border border-dashed border-ch-border rounded-[2px] p-10 text-center">
  <p className="text-ch-muted text-sm mb-1">Sin resultados.</p>
</div>
```

**Toast:**
```typescript
import { toastOk, toastError } from '@/lib/toast'
toastOk('Reserva creada')   // 3s, verde
toastError('Sin permisos')  // 4s, rojo
```

---

## 9. Auth, middleware y acceso

### Roles y permisos en el módulo

| Rol | Catálogo | Solicitar | Mis reservas | Gestión reservas | Cotizaciones |
|-----|----------|-----------|--------------|-----------------|--------------|
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `productor` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `colaborador` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `cliente` | ✅ | ✅ | ✅ | ❌ | ❌ |

`esAdmin = ['admin','productor'].includes(rol)` — calculado en `layout.tsx` y pasado al sidebar.

### Layout de autenticación

```typescript
// app/(rental)/layout.tsx
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')
const esAdmin = ['admin', 'productor'].includes(profile?.rol ?? '')
```

### Middleware (`proxy.ts`)

Las rutas `/rental/*` y `/api/rental/*` están protegidas por defecto.
Rutas públicas existentes: `/login`, `/m/`, `/r/`, `/cotizacion/`, `/citacion/`, `/col/`, `/api/cron/`, `/rodaje/*/ver`.

### Clientes Supabase

```typescript
// Server components y actions — respeta RLS, lee sesión del usuario
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()

// Bypasear RLS (inserts, queries con service_role)
import { createAdminClient } from '@/lib/supabase/admin'
const admin = createAdminClient()
// Lanza si SUPABASE_SERVICE_ROLE_KEY no está definida

// Client components ('use client')
import { createClient } from '@/lib/supabase/client'
```

---

## 10. Flujo completo — de solicitud a cotización

```
1. Usuario abre /rental → catálogo (equipos con rentable=true)
2. Ve ficha del equipo → botón "Solicitar reserva"
3. /rental/reservas/nueva → llena fechas + notas → verifica disponibilidad inline
4. Envía → crearRentalReserva() → rental_reservas (estado: pendiente)
        → email a admin/productor via Resend
5. Admin ve en /rental/reservas (tab "Todas") → aprueba
        → actualizarEstadoReserva() → estado: aprobada
        → evento en Google Calendar
        → email al solicitante
6. Admin crea cotización: /rental/cotizaciones/nueva → vincula a la reserva
        → crearRentalCotizacion() → numero R-001, sección "Equipos" creada
7. Admin edita en /rental/cotizaciones/[id]:
        → agrega ítems (equipo/maleta/libre)
        → ajusta IVA, descuentos globales
        → cambia estado a "enviada"
8. PDF: /api/rental/cotizaciones/[id]/pdf → descarga R-001.pdf
9. Admin entrega equipo → estado: entregada
10. Cliente devuelve → estado: devuelta → pasa a Historial
```

---

## 11. Referencia de archivos clave

```
proxy.ts                                         ← middleware (exporta 'proxy', NO 'middleware')
app/globals.css                                  ← tokens Tailwind v4 (@theme{})
types/index.ts                                   ← tipos canónicos (leer antes de editar)
app/actions/rental.ts                            ← TODAS las server actions (634 líneas)
app/layout.tsx                                   ← Sonner Toaster configurado
lib/toast.ts                                     ← toastOk / toastError / toastLoading
lib/google-calendar.ts                           ← crearEventoGCal
components/ui/EstadoVacio.tsx                    ← componente vacío reutilizable
components/equipos/TagEstado.tsx                 ← badge de estado de equipo
app/(rental)/layout.tsx                          ← layout con auth + esAdmin
app/(rental)/rental/page.tsx                     ← catálogo
app/(rental)/rental/reservas/page.tsx            ← gestión de reservas
app/(rental)/rental/cotizaciones/[id]/page.tsx   ← editor de cotización
components/rental/RentalSidebar.tsx              ← nav del módulo
components/rental/EditorCotizacion.tsx           ← editor client-side (secciones, ítems, totales)
components/rental/FormularioReserva.tsx          ← form solicitud con disponibilidad inline
components/rental/GestionReservas.tsx            ← tabla gestión para admin
components/rental/RentalCotizacionPDF.tsx        ← template PDF
app/api/rental/cotizaciones/[id]/pdf/route.ts    ← endpoint descarga PDF
sql/calendario.sql                               ← SQL original de rental_reservas (existía)
RENTAL_CONTEXT.md                                ← este archivo
```
