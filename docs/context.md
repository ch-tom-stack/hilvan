# Hilván — Documento de Contexto Completo

*Sistema operativo interno de Casa Hiedra. Última actualización: mayo 2026.*

---

## 1. Qué es Hilván

Hilván es el **sistema operativo interno** de **Casa Hiedra**, productora audiovisual chilena. No es un SaaS público — es una herramienta usada exclusivamente por el equipo de Casa Hiedra y sus colaboradores externos (freelancers técnicos, modelos, proveedores, clientes).

El nombre "Hilván" es una puntada provisional en costura: une las piezas antes de coserlas en definitivo. Metáfora para un sistema que conecta producción, finanzas y personas.

**Producción en**: [app.casahiedra.com](https://app.casahiedra.com)  
**Repositorio**: `https://github.com/ch-tom-stack/hilvan`  
**Dev local**: `http://localhost:3000`

---

## 2. Stack técnico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 15 (App Router) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS v4 |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Deploy | Vercel |
| Email | Resend (`RESEND_API_KEY`) |

### Variables de entorno (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://eahqvylbezhddnwqyylq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...     ← nuevo formato Supabase
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...                ← JWT clásico, service_role
RESEND_API_KEY=re_...
NEXT_PUBLIC_APP_URL=https://app.casahiedra.com
```

### Clientes Supabase
- `lib/supabase/server.ts` → `createClient()` — cliente cookie-based para server components y actions. Respeta RLS.
- `lib/supabase/admin.ts` → `createAdminClient()` — usa `SUPABASE_SERVICE_ROLE_KEY`. Bypassa RLS. Usar solo en server actions con verificación de permisos previa.

> **Importante**: el `service_role` bypassa RLS pero necesita GRANTs explícitos en PostgreSQL. Ver `sql/grants.sql` para el registro de todos los GRANTs aplicados. Ejecutar en Supabase SQL Editor cada vez que se crea una tabla nueva que necesite acceso de service_role.

---

## 3. Estructura de archivos clave

```
app/
  (dashboard)/           ← rutas autenticadas con layout de sidebar
    dashboard/           ← página de inicio
    cotizaciones/        ← módulo cotizaciones
    rodaje/              ← módulo rodajes (label UI: "Rodajes")
    rendiciones/         ← módulo rendiciones
    financiero/          ← módulo financiero (solo admin)
    equipos/             ← módulo equipos
    colaboradores/       ← módulo colaboradores
    clientes/            ← módulo clientes
    proyectos/           ← módulo proyectos (ligado a cotizaciones/clientes)
    perfil/              ← perfil del usuario autenticado
    usuarios/            ← gestión de usuarios (solo admin)
    layout.tsx           ← layout con Sidebar
  (public)/              ← rutas sin autenticación
    citacion/[token]/    ← confirmación de citación de rodaje
    m/[codigo]/          ← maleta pública por QR
    r/[token]/           ← portal de rendición externo (colaborador)
    cotizacion/[token]/  ← vista cliente de cotización
  actions/               ← Server Actions
    auth.ts, clientes.ts, colaboradores.ts, cotizaciones.ts
    equipos.ts, financiero.ts, inversiones.ts, maletas.ts
    perfil.ts, rendiciones.ts, rendiciones_mensuales.ts
    rodaje.ts, rodaje-plan.ts, usuarios.ts
components/
  layout/
    Sidebar.tsx          ← navegación principal (desktop + mobile)
  usuarios/
    GestorUsuarios.tsx   ← lista y cambio de roles
    InvitarUsuario.tsx   ← formulario de invitación
  perfil/
    PerfilPage.tsx       ← perfil propio con edición de nombre y password
  cotizaciones/, rodaje/, colaboradores/, ...
lib/
  supabase/
    server.ts            ← createClient() cookie-based
    admin.ts             ← createAdminClient() service_role
sql/
  grants.sql             ← todos los GRANTs de PostgreSQL necesarios
  financiero_fase1.sql
  rendicion_factura_pago.sql
  rendicion_mensual.sql
  cotizacion_header.sql
  clientes.sql
types/
  index.ts               ← todos los tipos TypeScript del proyecto
docs/
  context.md             ← este archivo
  design-context.md      ← contexto de diseño (más detallado en UI/UX)
```

---

## 4. Módulos — estado actual

| Módulo | Ruta | Estado | Descripción |
|--------|------|--------|-------------|
| Dashboard | `/dashboard` | ✅ Activo | Bienvenida, módulos, mini calendario |
| Cotizaciones | `/cotizaciones` | ✅ Activo | Constructor de presupuestos, aprobaciones, PDF |
| Rodajes | `/rodaje` | ✅ Activo | Hoja de llamados, plan de rodaje, citaciones |
| Rendiciones | `/rendiciones` | ✅ Activo | Gastos por proyecto + rendición mensual |
| Financiero | `/financiero` | ✅ Activo | Flujo de caja, gastos fijos, inversiones (solo admin) |
| Equipos | `/equipos` | ✅ Activo | Inventario, QR, maletas |
| Colaboradores | `/colaboradores` | ✅ Activo | Directorio, contratos, tarifas, rendiciones |
| Clientes | `/clientes` | ✅ Activo | CRM básico, empresas, proyectos |
| Proyectos | `/proyectos` | ✅ Activo | Ligado a Cotizaciones y Clientes |
| Perfil | `/perfil` | ✅ Activo | Edición de nombre, contraseña, permisos |
| Usuarios | `/usuarios` | ✅ Activo | Gestión de roles, invitación (solo admin) |
| Calendario | — | 🔜 Próximo | Módulo futuro, placeholder en dashboard |

---

## 5. Sistema de autenticación y roles

### Roles
```typescript
type Rol = 'admin' | 'productor' | 'colaborador' | 'cliente'
```

| Rol | Acceso |
|-----|--------|
| `admin` | Todo — incluyendo Financiero y Usuarios |
| `productor` | Todo excepto Financiero y Usuarios |
| `colaborador` | Dashboard, Rodajes, Rendiciones |
| `cliente` | Dashboard, Cotizaciones |

### Tabla `profiles`
```sql
id          uuid (= auth.users.id)
email       text
nombre      text
rol         text  -- 'admin' | 'productor' | 'colaborador' | 'cliente'
created_at  timestamptz
```

### Flujo de autenticación
- Login: email + password via Supabase Auth
- Sesión: cookies manejadas por `@supabase/ssr`
- Middleware: protege rutas autenticadas, redirige a `/login` si no hay sesión
- Al invitar un usuario: `admin.auth.admin.inviteUserByEmail()` + insert inmediato en `profiles`

### Regla de permisos en server actions
```typescript
// Patrón estándar para verificar admin
const { data: { user } } = await supabase.auth.getUser()
if (!user) return { error: 'No autenticado' }
const { data: self } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
if (self?.rol !== 'admin') return { error: 'Sin permisos' }
// luego usar admin client para la operación privilegiada
const admin = createAdminClient()
```

---

## 6. Navegación (Sidebar)

Orden actual de la navegación:

```
Dashboard
Cotizaciones
Rodajes          ← label "Rodajes", href: /rodaje
Rendiciones
Financiero       ← solo admin (griseado para otros)
Equipos
Colaboradores
Clientes
Usuarios         ← solo admin (griseado para otros)
```

El sidebar desktop es fijo a la izquierda (w-52), en mobile es un header horizontal con scroll.
El usuario (nombre + rol) en el footer del sidebar es un link a `/perfil`.

---

## 7. Módulo Cotizaciones — detalle

### Jerarquía de datos
```
CotizacionGrupo          ← agrupa versiones de una misma cotización
  └── Cotizacion         ← versión/variante específica
        ├── estado: borrador | enviada | aprobada | rechazada | en_produccion | cerrada
        ├── CotizacionDepartamento[]
        │     ├── CotizacionSubgrupo[]
        │     │     └── CotizacionItem[]
        │     └── CotizacionItem[]  ← ítems sin subgrupo
        └── con_iva, descuento_global, formato_pdf, token
```

### Campos especiales de header
`cliente_final`, `medios`, `referencia`, `solicita` — aparecen en el PDF de cotización.

### Vista pública cliente
`/cotizacion/[token]` — muestra desglose, totales, y botón de aprobación del cliente.

### Cálculos (en `types/index.ts`)
- `subtotalItem()`, `subtotalSubgrupo()`, `subtotalDepartamento()`, `calcularTotales()`
- `formatCLP()` — formatea a pesos chilenos

---

## 8. Módulo Rodajes — detalle

### Estructura
```
Rodaje
  ├── RodajeDepartamento[]  ← departamentos con hora de llamado
  ├── RodajeEquipoTecnico[] ← personas citadas
  │     └── RodajeCitacion ← estado de confirmación
  ├── RodajeEscena[]        ← escenas del día
  ├── RodajeLocacion[]      ← locaciones
  └── RodajeBloque[]        ← bloques del plan de producción (timeline)
```

### Plan de producción (`RodajeBloque`)
Sistema de bloques con cascada de tiempos: `hora_inicio_fija`, `duracion_min`, `es_paralelo`, `es_anclado`.
Helpers: `calcularCascada()`, `horaAMinutos()`, `minutosAHora()`.

### Citaciones
- Cada miembro del equipo tiene un `token` único para su citación
- Ruta pública: `/citacion/[token]`
- El colaborador confirma / declina y puede agregar restricciones alimentarias
- Helpers: `generarMensajeCitacion()`, `generarLinkCalendar()`, `generarLinkUber()`

### Hoja de llamados
Genera PDF on-demand via react-pdf renderizado en servidor.

---

## 9. Módulo Rendiciones — detalle

### Rendición por proyecto
Asociada a una `Cotizacion`. Tiene `RendicionGasto[]` con documentos adjuntos (foto_url).
Estados: `borrador | enviada | aprobada | rechazada | pago_aprobado`.
Portal externo para colaboradores: `/r/[token]`.

### Rendición mensual (gastos generales)
No asociada a proyecto específico. Tabla `rendicion_mensual` + `rendicion_mensual_gastos`.
Categorías: Transporte, Alimentación, Artículos de oficina, Insumos de rodaje, Otros.

### Cálculo de retención boleta
```typescript
const RETENCION_BOLETA = 0.154
// calcularRetencion() en types/index.ts
```

---

## 10. Módulo Financiero — detalle (solo admin)

### Sub-módulos implementados
- **Gastos fijos** (`GastoFijo`, `GastoFijoCuota`): créditos bancarios, préstamos socio. Con cuotas mensuales y seguimiento de pagos.
- **Flujo de caja manual** (`FlujoCajaManual`): entradas y salidas manuales.
- **Inversiones** (`Inversion`): activos fijos y gastos directos, con comprobante.

---

## 11. Módulo Usuarios — detalle (solo admin)

### Funcionalidades
- **Listar usuarios**: `listarUsuarios()` — lee tabla `profiles`
- **Cambiar rol**: `actualizarRol(userId, nuevoRol)` — usa `createAdminClient()` para bypasear RLS
- **Invitar usuario**: `invitarUsuario(email, nombre, rol)`:
  1. Llama `admin.auth.admin.inviteUserByEmail(email, { data: { nombre, rol } })`
  2. Hace upsert inmediato en `profiles` con nombre y rol definidos
  3. Supabase envía email con link de acceso
- **Protección self**: el admin no puede cambiar su propio rol (UI oculta el botón "Cambiar" para el propio usuario)

---

## 12. Sistema de diseño

### Colores (variables Tailwind v4)
```css
--color-ch-black:       #111110   /* fondo base */
--color-ch-dark:        #1c1c1a   /* fondo body */
--color-ch-surface:     #242422   /* cards, inputs */
--color-ch-border:      #2e2e2b   /* bordes */
--color-ch-muted:       #6b6b65   /* texto secundario, labels */
--color-ch-cream:       #f5f0e8   /* texto principal */
--color-ch-white:       #faf9f7   /* texto más claro */
--color-ch-green:       #7a9e7e   /* acento: activo, CTA, confirmado */
--color-ch-green-light: #9dbfa1   /* hover del verde */
--color-ch-gold:        #c9a84c   /* advertencia, pendiente */
--color-ch-gold-light:  #dfc078   /* hover del dorado */
```

### Tipografía
```css
--font-display: 'Cormorant Garamond', Georgia, serif  ← títulos, siempre italic
--font-body:    'DM Sans', system-ui, sans-serif       ← cuerpo, labels
```

| Uso | Clases |
|-----|--------|
| Títulos de página/módulo | `font-display italic text-4xl lg:text-5xl text-ch-cream` |
| Label de sección | `font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted` |
| Datos / cuerpo | `font-body text-sm text-ch-cream` |
| Badge / tag | `font-body text-xs px-2.5 py-0.5 border rounded-[2px]` |

### Reglas de diseño (inmutables)
- **Sin border-radius** o máximo `rounded-[2px]`. Estética recta, editorial.
- **Sin sombras** (`box-shadow`). Profundidad solo con color de fondo y borde.
- **Sin bold en títulos**. Los display titles son siempre italic, nunca bold.
- **No mezclar más fuentes**. Solo Cormorant + DM Sans.
- **No usar grises genéricos** (gray-500). Solo tokens ch-.

### Patrones de componentes
```html
<!-- Input estándar -->
<input class="bg-ch-dark border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream placeholder:text-ch-border focus:outline-none focus:border-ch-green" />

<!-- Botón CTA principal -->
<button class="bg-ch-green text-ch-black text-xs px-4 py-1.5 rounded-[2px] hover:bg-ch-green-light transition-colors">
  Guardar
</button>

<!-- Botón secundario -->
<button class="border border-ch-border text-ch-muted text-xs px-4 py-1.5 rounded-[2px] hover:text-ch-cream transition-colors">
  Cancelar
</button>

<!-- Card de módulo -->
<div class="border border-ch-border bg-ch-surface/30 p-6 rounded-[2px]">
  <h2 class="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted mb-5">Sección</h2>
</div>
```

### Badges de rol (colores fijos)
```
admin:       bg-ch-green/10 text-ch-green border-ch-green/30
productor:   bg-blue-500/10 text-blue-400 border-blue-400/30
colaborador: bg-amber-500/10 text-amber-400 border-amber-400/30
cliente:     bg-purple-500/10 text-purple-400 border-purple-400/30
```

---

## 13. Páginas públicas (sin autenticación)

Rutas accesibles sin login — diseño minimalista diferenciado:

| Ruta | Descripción |
|------|-------------|
| `/citacion/[token]` | Confirmación de citación. Fondo negro puro, zinc-100 |
| `/m/[codigo]` | Maleta pública (QR). Usa ch-tokens |
| `/r/[token]` | Portal de rendición de gastos para colaborador externo |
| `/cotizacion/[token]` | Vista cliente de cotización con botón de aprobación |

---

## 14. Patrones técnicos importantes

### Server Actions
Todas las mutaciones son Server Actions (`'use server'`). Patrón estándar:
```typescript
export async function miAccion(...): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  // 1. Verificar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  // 2. Lógica
  const { error } = await supabase.from('tabla').update(...)
  if (error) return { error: error.message }
  // 3. Revalidar
  revalidatePath('/ruta')
  return { ok: true }
}
```

### useTransition en client components
```typescript
const [isPending, startTransition] = useTransition()
startTransition(async () => {
  const res = await miServerAction(datos)
  if (res.error) setMsg(res.error)
})
```

### GRANTs de Supabase
Supabase bypassa RLS con service_role pero necesita GRANTs de PostgreSQL. El archivo `sql/grants.sql` tiene el registro completo. Si se crea una tabla nueva que necesite acceso desde server actions con admin client, agregar:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nueva_tabla TO service_role;
```

### 503 en Vercel (cold start)
Las mutaciones en producción a veces devuelven 503 pero **sí se ejecutan en Supabase**. Verificar directamente en Supabase antes de reintentar.

---

## 15. Usuarios actuales del sistema

| Nombre | Email | Rol |
|--------|-------|-----|
| Tomás | tomasmontealegrem@gmail.com | admin |
| Simón | simonpedrofernandezsilva@gmail.com | productor |
| Natalia | nataliaalejandra.r@gmail.com | productor |
| Josué | josuedelafuenteruiz@gmail.com | productor |
| Diego | diegolopez.mov@gmail.com | productor |
| Ignacio Figueroa | ignaciofigueroas@gmail.com | cliente |

Ignacio Figueroa es el abogado asesor con background en finanzas y contabilidad — accede como cliente para revisar cotizaciones.

---

## 16. Pendiente / Próximo

### Funcionalidades definidas
- **Módulo Calendario** — vista de agenda con rodajes, citas, hitos de cotizaciones. Placeholder ya en dashboard.
- **Notificaciones** — placeholder en `/perfil`, sección "Próximamente". Alertas de cotizaciones, cambios de estado, avisos de equipo.
- **Template email invitación** — personalizar el email de Supabase Auth con branding Casa Hiedra.

### Mejoras de UX identificadas
- **Estado vacío en tablas**: cuando no hay datos, no hay empty state definido. Las tablas sin filas parecen errores.
- **Mobile**: funcional pero no pulido. El header mobile con tabs horizontales no escala bien con 9 módulos.
- **Feedback de acciones**: sistema de toast/notificación consistente. Hoy es solo texto inline temporal.
- **Formularios con tabs**: la ficha de colaborador (7 tabs) no indica qué tabs tienen datos vs. vacíos.
- **PDF de hoja de llamados**: funcional pero estilos básicos.
- **Página 404**: solo el default de Next.js.

### Deuda técnica
- El sidebar y la página `/citacion` usan clases `zinc-*` mientras el resto del dashboard usa tokens `ch-*`. Pendiente unificar.
- `README.md` es el default de create-next-app. Reemplazar.

---

## 17. Referencias visuales

El lenguaje visual está inspirado en:
- Interfaces de software editorial (Linear en versión oscura temprana, Notion oscuro)
- Publicaciones impresas de alto nivel (revistas de moda/arquitectura)
- Identidad existente de Casa Hiedra: dark, warm, editorial

La intención es que la herramienta se sienta como una extensión natural de la marca — no como un SaaS genérico.
