@AGENTS.md

# Hilván — Contexto para Claude Code

Eres el asistente de desarrollo de **Hilván**, la plataforma de gestión interna de **Casa Hiedra**, productora audiovisual en Santiago de Chile.

---

## Lo esencial

- **App en producción:** app.casahiedra.com
- **Stack:** Next.js 16.2.4 + Tailwind CSS v4 + Supabase + Vercel
- **Repo:** github.com/ch-tom-stack/hilvan (rama `main`)
- **Edita archivos directamente — no generes scripts de setup**

---

## Reglas críticas del stack

### Next.js 16.2.4
- El middleware se llama `proxy.ts` (NO `middleware.ts`) — exporta `export function proxy` + `export const config`
- **Nunca crear `middleware.ts`** — Next.js/Turbopack lo rechaza y tumba el servidor
- Buffers de Node → convertir a `Uint8Array` para `NextResponse`

### Tailwind CSS v4
- Sin `tailwind.config.ts` — todo en `globals.css` con `@import "tailwindcss"` y `@theme {}`
- Usar siempre tokens `ch-*` — nunca zinc/gray en componentes nuevos

### TypeScript
- Estricto — no usar `null` donde se espera `string`, usar `|| undefined`
- `types/index.ts` es el archivo canónico — leerlo completo antes de editar, nunca sobreescribir parcialmente
- `calcularRetencion()` en types fue corregida — referencia muerta a `'bet'` eliminada

### Supabase — reglas de acceso
- Rutas públicas (sin login): usar `createAdminClient()` (service role, bypassa RLS)
- Rutas protegidas (con sesión): usar `await createClient()` del server
- Toda tabla nueva necesita GRANTs explícitos — ver `sql/grants.sql`
- Campos con check constraint (`tipo_cuenta`, `banco`, `tipo_documento`): convertir `''` → `null` antes de escribir a DB

### Supabase Realtime
- `rodaje_bloques` tiene `REPLICA IDENTITY FULL` y políticas anon configuradas
- Viewer `/rodaje/[id]/ver` usa `postgres_changes` — cambios llegan en <1s

---

## Módulos y estado

| CH | Módulo | Estado | Ruta |
|---|---|---|---|
| 1 | Equipos | ✓ Activo | `/equipos` |
| 2 | Cotizaciones | ✓ Activo | `/cotizaciones` |
| 3 | Rodajes | ✓ Activo | `/rodaje` (label UI: "Rodajes") |
| 4 | Colaboradores | ✓ Activo | `/colaboradores` |
| 5 | Rendiciones | ✓ Activo | `/rendiciones` |
| 6 | Financiero | ✓ Activo | `/financiero` — solo admin |
| 7 | Clientes | ✓ Activo | `/clientes` |
| 8 | Calendario | 🔜 En construcción | `/calendario` |
| — | Perfil | ✓ Activo | `/perfil` |
| — | Usuarios | ✓ Activo | `/usuarios` — solo admin |

---

## Sidebar — navItems actuales

```typescript
{ label: 'Dashboard',     href: '/dashboard',    disponible: true  }
{ label: 'Cotizaciones',  href: '/cotizaciones', disponible: true  }
{ label: 'Rodajes',       href: '/rodaje',        disponible: true  }
{ label: 'Rendiciones',   href: '/rendiciones',  disponible: true  }
{ label: 'Financiero',    href: '/financiero',   disponible: false, soloAdmin: true }
{ label: 'Equipos',       href: '/equipos',      disponible: true  }
{ label: 'Colaboradores', href: '/colaboradores',disponible: true  }
{ label: 'Clientes',      href: '/clientes',     disponible: true  }
{ label: 'Usuarios',      href: '/usuarios',     disponible: false, soloAdmin: true }
```

> Calendario se agrega al terminar CH-8.

---

## Rutas públicas — definidas en proxy.ts

```
/login
/m/[codigo]                    ← ficha pública maleta (QR)
/cotizacion/[token]            ← vista cliente cotización
/preview/[id]                  ← vista previa cotización interna
/api/cotizaciones/[id]/pdf     ← descarga PDF cotización
/rodaje/[id]/ver               ← viewer en vivo con Realtime
/api/rodaje/[id]/pdf           ← descarga PDF rodaje
/citacion/[token]              ← citación individual de rodaje
/col/[token]                   ← portal onboarding colaborador
/r/[token]                     ← portal externo de rendición
```

---

## Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
NEXT_PUBLIC_APP_URL
CRON_SECRET
GOOGLE_SERVICE_ACCOUNT_EMAIL   ← hilvan-calendar@hilvan-casahiedra.iam.gserviceaccount.com
GOOGLE_CALENDAR_ID             ← estudiocasahiedra@gmail.com
GOOGLE_SERVICE_ACCOUNT_KEY     ← JSON completo de la service account
```

---

## Tablas Supabase

### CH-0 Base
- `profiles` — RLS activado

### CH-1 Equipos
- `categorias_equipo`, `equipos`, `bundles`, `bundle_items`
- `maletas`, `maleta_items`, `maleta_notas`
- Storage: `equipos`, `maletas`

### CH-2 Cotizaciones
- `clientes`, `proyectos`, `tarifas_base`
- `cotizacion_grupos`, `cotizaciones`, `cotizacion_departamentos`, `cotizacion_subgrupos`, `cotizacion_items`
- Vista: `cotizacion_items_totales`
- Función SQL: `siguiente_numero_grupo()`
- Campos nuevos en `cotizaciones`: `fecha_factura_emitida`, `fecha_pago_recibido`, `numero_factura`

### CH-3 Rodaje
- `rodajes`, `rodaje_bloques` (REPLICA IDENTITY FULL), `rodaje_departamentos`
- `rodaje_equipo_tecnico`, `rodaje_escenas`, `rodaje_citaciones`
- Storage: `rodajes`

### CH-4 Colaboradores
- `colaboradores` (incluye `restricciones_alimentarias`, `notas_internas`)
- `colaboradores_tarifas`, `contratos_generados`, `colaboradores_links_temporales`
- Contratos `.docx`: `marco_equipo`, `marco_modelo`, `marco_empresa`, `release`

### CH-5 Rendiciones
- `rendiciones`, `rendicion_gastos`, `rendiciones_links_temporales`
- Campos nuevos en `rendicion_gastos`: `rut_emisor`, `razon_social_emisor`, `factura_casa_hiedra`
- `/rendiciones/mensual` — gastos operacionales mensuales
- Export Santander: `.xlsx` real 13 columnas (librería `xlsx` instalada)
- Storage: comprobantes de gastos

### CH-6 Financiero — solo admin
- `gastos_fijos`, `gastos_fijos_cuotas`
- `flujo_caja_manual`, `inversiones`
- Vistas: `/financiero`, `/financiero/cobrar`, `/financiero/flujo`, `/financiero/inversiones`, `/financiero/creditos`

### CH-8 Calendario (en construcción)
- `rental_reservas` — una reserva = un equipo OR una maleta, no múltiples
- `eventos_calendario` — eventos importados de GCal
- Google Calendar: proyecto `hilvan-casahiedra`, service account `hilvan-calendar@hilvan-casahiedra.iam.gserviceaccount.com`
- Variables en Vercel y .env.local ✓
- `npm install googleapis` pendiente

---

## Logos

En `public/logos/`:
- `logo-horizontal-negro.png` — fondos oscuros
- `logo-horizontal-blanco.png` — fondos claros
- `logo-cuadrado-negro.png` — espacios reducidos
- `logo-pdf.png` — PDFs

---

## Sistema de diseño

### Colores
```
ch-black:       #111110   fondo base
ch-dark:        #1c1c1a   fondo body
ch-surface:     #242422   cards, inputs
ch-border:      #2e2e2b   bordes
ch-muted:       #6b6b65   texto secundario
ch-cream:       #f5f0e8   texto principal
ch-green:       #7a9e7e   acento principal, CTA
ch-green-light: #9dbfa1   hover verde
ch-gold:        #c9a84c   advertencia, pendiente
ch-gold-light:  #dfc078   hover dorado
```

### Tipografía
- Display: `font-display italic` (Cormorant Garamond) — títulos
- Body: `font-body` (DM Sans) — todo lo demás
- Labels: `font-body text-[9px] tracking-[0.5em] uppercase`

### Reglas inmutables
- Sin `border-radius` (máximo `rounded-[2px]`)
- Sin `box-shadow`
- Sin fuentes adicionales
- Sin clases zinc/gray en componentes nuevos

---

## Archivos de referencia

```
docs/context.md            ← contexto completo del proyecto
docs/design-context.md     ← sistema de diseño detallado
sql/grants.sql             ← todos los GRANTs documentados
types/index.ts             ← tipos canónicos
proxy.ts                   ← middleware + rutas públicas
```

---

## Convenciones

- Idioma: español en toda la UI
- Fechas: formato local `es-CL`
- Moneda: CLP — usar `formatCLP()` de `types/index.ts`
- Commits: `feat: descripción` / `fix: descripción`

---

## Pendientes anotados

- **CH-8 Calendario**: implementación en curso
- CH-6 Financiero: PPM pendiente de tasa confirmada por Tomás
- CH-6: PDF parsing facturas SII pendiente de decisión
- Citación `/citacion/[token]`: migrar zinc → ch-tokens
- Estados vacíos consistentes en todos los módulos
- Sistema de toast/feedback de acciones
- Página 404 personalizada
- UI de Bundles (tabla creada, interfaz pendiente)
- Código banco Santander: confirmar entero SBIF vs 5 dígitos con sufijo
