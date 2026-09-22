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

### `'use server'` — todo export debe ser una función async
En un archivo con `'use server'` (ej. `app/actions/*.ts`) **no se puede exportar
una constante**: invalida el módulo entero y el build falla con *"the module has
no exports at all"*, señalando archivos que no tienen nada que ver. Las
constantes van a un `lib/*.ts` normal. Los `export interface`/`type` sí se
permiten (se borran al compilar).

**`npx tsc --noEmit` NO detecta esto — solo `npm run build`.** Antes de decir
que algo está listo, correr el build: pasó de largo un `export const` y los
deploys de Vercel fallaron durante varios commits.

### Archivos del repo que se leen en runtime
Si un route handler lee un archivo del repo (ej. `docs/crm/*.md` en
`/api/agent/crm/reglas`), hay que declararlo en `outputFileTracingIncludes` de
`next.config.ts`. Sin eso el archivo no viaja al bundle serverless: **funciona
en local y falla en Vercel**. Se verifica en
`.next/server/<ruta>/route.js.nft.json` tras el build.

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
| 8 | Calendario | ✓ Activo | `/calendario` |
| 9 | Rental | ✓ Activo | `/rental` |
| 11 | Cronos | ✓ Activo | `/cronos` — cronograma de proyecto en una página |
| — | Perfil | ✓ Activo | `/perfil` |
| — | Usuarios | ✓ Activo | `/usuarios` — solo admin |

---

## Sidebar — navItems actuales

```typescript
{ label: 'Dashboard',     href: '/dashboard',     disponible: true,  rolesPermitidos: null,              ocultarPara: null }
{ label: 'Cotizaciones',  href: '/cotizaciones',  disponible: true,  rolesPermitidos: null,              ocultarPara: null }
{ label: 'Rodajes',       href: '/rodaje',         disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] }
{ label: 'Cronos',        href: '/cronos',         disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] }
{ label: 'Rendiciones',   href: '/rendiciones',   disponible: true,  rolesPermitidos: null,              ocultarPara: null }
{ label: 'Financiero',    href: '/financiero',    disponible: false, rolesPermitidos: ['admin', 'contabilidad'], ocultarPara: null }
{ label: 'Equipos',       href: '/equipos',       disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] }
{ label: 'Colaboradores', href: '/colaboradores', disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] }
{ label: 'Clientes',      href: '/clientes',      disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] }
{ label: 'Usuarios',      href: '/usuarios',      disponible: false, rolesPermitidos: ['admin'],         ocultarPara: null }
{ label: 'Calendario',    href: '/calendario',    disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] }
{ label: 'Rental',        href: '/rental',        disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] }
```

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
NEXT_PUBLIC_APP_URL
CRON_SECRET                    ← en Vercel; localmente usar cualquier string en .env.local
GMAIL_USER                     ← natalia@casahiedra.com (emisor de correos transaccionales)
GMAIL_APP_PASSWORD             ← contraseña de aplicación Gmail (nodemailer SMTP)
GOOGLE_SERVICE_ACCOUNT_EMAIL   ← hilvan-calendar@hilvan-casahiedra.iam.gserviceaccount.com
GOOGLE_CALENDAR_ID             ← estudiocasahiedra@gmail.com
GOOGLE_SERVICE_ACCOUNT_KEY     ← JSON completo de la service account
APIGATEWAY_API_TOKEN           ← token de API Gateway (apigateway.cl) para traer RCV+BHE del SII
SII_RUT                        ← RUT del contribuyente (77151117-1, marca Casa Hiedra) para consultar el SII
SII_CLAVE                      ← clave tributaria del contribuyente (pendiente: evaluar certificado vía API Gateway para no usar la clave admin)
APIGATEWAY_API_URL             ← opcional, default https://app.apigateway.cl/api/v2
WHATSAPP_VERIFY_TOKEN          ← saludo de verificación del webhook de Meta (GET hub.challenge)
WHATSAPP_APP_SECRET            ← App Secret de Meta: valida X-Hub-Signature-256 (alta directa)
WHATSAPP_WEBHOOK_KEY           ← llave propia (header x-webhook-key o ?key=) si el alta es vía intermediario
```

> **Email:** se usa Gmail SMTP vía nodemailer (reemplazó a Resend). No hay `RESEND_API_KEY`.

> **SII (API Gateway):** `hilvan_sii_sync` (endpoint `/api/agent/sii-sync`, SOLO LECTURA) trae facturas compradas/recibidas (RCV) + boletas de honorarios recibidas de un período y las normaliza al shape de gasto; la carga la hace `hilvan_crear_gastos_bulk`. Auth en dos capas: header `Authorization: Token <APIGATEWAY_API_TOKEN>` + body `{auth:{pass:{rut,clave}}}`. El mapeo de campos de la respuesta SII vive en `lib/agent-sii.ts` y se afina tras la primera corrida real (usar `incluir_crudo=true`). La **cartola bancaria NO pasa por el SII** — se importa/concilia aparte.

---

## Tablas Supabase

### CH-0 Base
- `profiles` — RLS activado
- Roles: `admin`, `productor`, `contabilidad` (acceso a cotizaciones, rendiciones y financiero; oculto en rodajes/equipos/colaboradores/clientes/rental/calendario)

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
- Campos en `rendicion_gastos`: incluye `rut_emisor`, `razon_social_emisor`, `factura_casa_hiedra`
- `/rendiciones/mensual` — gastos operacionales mensuales (no asociados a proyecto)
- `rendicion_mensual_gastos`: mismos campos extra que `rendicion_gastos`
- `CATEGORIAS_RENDICION_MENSUAL` (types/index.ts): Transporte, Alimentación, Artículos de oficina, Insumos de rodaje, Suscripciones, Otros
- `cargado_por` es NOT NULL en `rendicion_mensual_gastos` — siempre incluirlo en inserts directos
- **Parser de facturas SII**: `POST /api/parse-factura` — recibe PDF, devuelve `{rut_emisor, razon_social, folio, fecha, monto}`. Usa `pdf-parse` con import dinámico (no importar a nivel de módulo o rompe el build). Cubre dos familias de DTE chileno.
- **Export Santander**: `GET /api/rendiciones/santander-export` — genera `.xlsx` con template real (13 columnas). Librería `exceljs` instalada.
- Storage: comprobantes de gastos

### CH-6 Financiero — solo admin/contabilidad
- `gastos_fijos`, `gastos_fijos_cuotas`
- `flujo_caja_manual`, `inversiones`
- `configuracion_financiero` — key/value store. Claves activas: `ppm_tasa`, `previred_mensual`, `iusc_mensual`, `nomina_personas` (JSON)
- **RLS**: `configuracion_financiero` no tiene SELECT policy → usar siempre `createAdminClient()` en getters y setters
- **Estado de Resultados**: base devengada (facturado, no cobrado). Incluye PPM, Previred, IUSC (todos editables), sección Nómina con personas configurables, Inversiones en columna separada
- `getNomina()` / `setNomina()` en `app/actions/financiero.ts` — default: Tomás M. $550k, Natalia $550k, Simón $250k BH, Josué $250k BH
- **Créditos vigentes** en `gastos_fijos`: BancoEstado Emprende Plus ($3.107.000, 48 cuotas ~$84k, vence ago 2028) + Forum/CORFO ($2.031.064, 36 cuotas ~$56-254k, vence jun 2028)
- Vistas: `/financiero`, `/financiero/cobrar`, `/financiero/flujo`, `/financiero/inversiones`, `/financiero/creditos`

### CH-8 Calendario
- `eventos_calendario` — eventos importados de GCal (clasificacion: sin_clasificar | rodaje | reunion | ignorar)
- Google Calendar: proyecto `hilvan-casahiedra`, service account `hilvan-calendar@hilvan-casahiedra.iam.gserviceaccount.com`
- Sync cron: `0 8 * * *` en Vercel → `/api/cron/sync-gcal` (rango: -30 días a +90 días)
- Clasificación manual desde InboxGCal (solo admin/productor)
- FullCalendar v6.1.20 con dynamic import (`ssr: false`) — CSS bundleado con JS, no importar por separado
- Tema `.fc-hilvan` definido en `globals.css`

### CH-9 Rental
- `rental_reservas` — una reserva = un equipo OR una maleta, no múltiples
- `rental_cotizaciones`, `rental_cotizacion_items` — cotizaciones de arriendo
- Módulo completo: catálogo, reservas y cotizaciones
- Equipos marcados como rentables desde `/equipos` (toggle inline)

---

### WhatsApp → CRM (sep-2026)
- El número de empresa se conecta a la Cloud API de Meta en **coexistencia** (la app del celular sigue igual). Hilván solo ESCUCHA: nunca envía por WhatsApp.
- `POST /api/whatsapp/webhook` recibe `messages` (nos escriben), `smb_message_echoes` (lo que mandamos desde el celular) y `history` (180 días previos, una vez, dentro de las 24 h del alta). Basta UNA de `WHATSAPP_APP_SECRET` / `WHATSAPP_WEBHOOK_KEY`; sin ninguna responde 503.
- Tablas (`sql/whatsapp.sql`, solo service role): `whatsapp_mensajes` guarda contenido SOLO de números que calzan con `prospectos.telefono` o `crm_contactos.telefono`; `whatsapp_desconocidos` es la cuarentena (número, nombre de perfil, fechas — nunca texto). Los teléfonos de `colaboradores` se descartan en silencio.
- Cron `/api/cron/whatsapp-purga` (diario): cuarentena pendiente >30 días y texto de mensajes procesados >90 días.
- Lógica pura y testeada en `lib/whatsapp.ts` (formatos de Meta, `normalizarTelefono`, firma, agrupar por día de Chile); la base en `lib/whatsapp-io.ts`.
- Agente: `hilvan_whatsapp_pendientes`, `hilvan_whatsapp_registrar` (una conversación = prospecto + día → toque enviado y/o respuesta recibida, con RESUMEN, nunca transcripción), `hilvan_whatsapp_desconocidos`. Regla del operador: `docs/crm/reglas-whatsapp.md` (sexta de `hilvan_reglas_crm`). Deshacer: `whatsapp-registrar` y `whatsapp-desconocido` trabajan desde el payload.
- Personas: `components/crm/WhatsappSinVincular.tsx` arriba del tablero `/crm` (vincular un número a un prospecto o marcarlo "no es venta").

### CRM — lo que pasa fuera del correo (sep-2026)
- **"¿En qué quedó?"** (`sql/crm-preguntas.sql`, tabla `crm_preguntas`): el digest matinal le pregunta a cada responsable por sus prospectos con reunión hace 2+ días sin nada después, o en conversación con 10+ días sin registro (máx. 5 por persona). Cada botón del correo abre `/q/<token>` (pública, token de un solo uso, vence a los 7 días). **Abrir el link NO modifica nada** — los clientes de correo prefetchean links; solo el botón Guardar escribe. Lógica pura en `lib/crm-preguntas.ts`, base en `lib/crm-preguntas-io.ts`. Agente: `hilvan_preguntas_equipo` (solo lectura).
- **Aviso de lead nuevo** (`lib/crm-aviso-lead.ts`): cada lead del sitio dispara un correo inmediato a natalia@ y tomas@ (override: `CRM_AVISO_LEAD_EMAILS`, separados por coma). Todo lo que viene del formulario se escapa.
- **Etapas inconsistentes** (`lib/crm-consistencia.ts`): `hilvan_datos_dudosos` las calcula al leer (en conversación sin respuesta, confirmado sin historial, rechazo sin mover). No marca ni mueve nada.
- **Cruce origen × tamaño** (`lib/crm-cruce.ts`): en `hilvan_metricas_crm`, con `desde` para medir cambios del sitio. Línea base en `docs/crm/linea-base-leads-2026-09-19.md`.
- `temperaturaDe`: `landing` y `brief` (lo que manda el sitio) son ENTRANTES.

### Rental — las maletas reservan su contenido (sep-2026)
- Reservar una maleta ocupa cada equipo de `maleta_items` (y la maleta misma, código sintético `MALETA:<id>`). Una sola regla en `lib/rental-ocupacion.ts` (`contextoOcupacion`) + `codigosDeReserva`/`conflictosDeNueva` en `lib/rental-kits.ts`, usada por el formulario interno, la aprobación (`verificarSobrecupoReserva`) y el catálogo público (`/api/arriendo/disponibilidad`).

### Deshacer / rehacer y copiar / pegar en toda la app (sep-2026)
- **Historial** (`sql/historial.sql`, tabla `acciones_ui`, solo service role): cada server action que muta registra sus operaciones (`insert` = filas creadas, `update` = antes/después por fila, `delete` = árbol de filas borradas, padre primero) vía `registrar()` de `lib/historial.ts`. Deshacer aplica las ops al revés; rehacer, en orden; un update solo se deshace si la fila sigue como la dejó la acción (`coincide`). Ruta = `/cotizaciones/<id>`, `/rodaje/<id>`… (prefijo: cubre sub-rutas). Por usuario, últimas 48 h.
- `components/ui/AtajosGlobales.tsx` (en el layout del dashboard): Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z (o Ctrl+Y) llaman `deshacer`/`rehacer` de `app/actions/historial.ts`, muestran un aviso con el botón inverso, hacen `router.refresh()` y disparan `EVENTO_HISTORIAL`. Dentro de un campo de texto no intervienen. Las pantallas con estado propio se alinean: el constructor de cotizaciones con `useEffect(() => setCot(initial), [initial])`; el plan de rodaje recarga en `EVENTO_HISTORIAL` y además conserva su deshacer LOCAL en memoria (ediciones antes del autoguardado), que toma el atajo solo cuando tiene algo y si no lo deja pasar al global.
- **Cobertura al 22-sep-2026**: cotizaciones (ítems, grupos, sub-grupos, orden, campos de la cotización) y rodaje (bloques, plan en tandas, equipo, departamentos, escenas, locaciones, ficha, estado). **Pendiente**: CRM, cronos, equipos, colaboradores, clientes, rental, calendario, centro de costos, financiero (estos dos últimos con cuidado: lo rendido/conciliado). Patrón para agregar cobertura: capturar antes → mutar → capturar después → `historial(...)` con `opInsert/opUpdate/opDelete`.
- **Copiar / pegar**: portapapeles tipado en localStorage (`lib/portapapeles-cotizacion.ts`: `item`, `grupo`, `bloque`), funciona entre pestañas y entre documentos. Selección con clic (fila marcada con borde verde) + Ctrl+C / Ctrl+V en cotizaciones (ítem/grupo) y en el plan de rodaje (bloque, se pega después del seleccionado). También botones ⧉ / "pegar" en cotizaciones.

### CH-11 Cronos — el cronograma de proyecto (sep-2026)
- Tablas: `cronos` (ficha + 8 columnas `<etapa>_desde/_hasta`), `crono_hitos` (tipo, fecha, fecha_fin, etapa, monto CLP, notas = detalle, responsable, hecho, rodaje_id), `crono_compuertas` (checks por `destino` pre|produccion|post|cierre; con `hito_id` = automático) y `feriados` (Chile, editable, precargada 2026–2027). Schema: `sql/cronos.sql` + `sql/cronos_v2.sql`.
- **Reglas de diseño (Tomás):** TODO cabe en una página; minimalismo. La pantalla (`components/cronos/EditorCrono.tsx`) son dos mundos: **LA HOJA** (izquierda, blanca, paleta Casa Hiedra — negro, blanco, tintes lila con motivo de líneas diagonales por etapa; NO tokens ch-*) que es lo que se imprime, y **EL PANEL** (derecha, chrome Hilván) que informa y no se imprime. Sin íconos: cada hito es una etiqueta con título, detalle y responsable, siempre texto completo. Calendario semanal continuo (lun→dom), semanas sin hitos delgadas, fin de semana y feriados angostos y tramados, el mes va en el primer día donde aparece. Vistas puras en `components/cronos/CronoVistas.tsx`.
- Panel: **Lectura** (días corridos/hábiles/peso por etapa descontando feriados; post disponible hasta cada entrega; próximo hito clave; **avisos** como "hito clave cae en feriado" con botón para moverlo al hábil anterior), **Compuertas** (checks para pasar de etapa; automáticos cuando tienen `hito_id` — se marcan solos con el hito hecho o el rodaje confirmado en Hilván; manuales con responsable), esta semana y la próxima, pagos, feriados en el rango.
- Tipos de hito: `devolucion`, `pre_equipo`, `rodaje`, `off`, `entrega`, `emision` son clave; `pago` (con `monto`), `reunion`, `otro`. `destacado` (v3, `sql/cronos_v3.sql`) resalta entrega/OFF/emisión como el rodaje; tipos OFF/emisión en `sql/cronos_v4.sql`. La etapa se deduce de la fecha. Proyecto opcional. "Importar rodajes del proyecto" crea hitos `rodaje` vinculados por `rodaje_id`.
- Lógica pura: `lib/crono.ts` (+ `tests/crono.test.ts`): fechas sin `Date` local, etapas, semanas, hábiles, lectura, avisos, compuertas (`evaluarCompuertas`, `compuertasPorDefecto`).
- Capa en `/calendario`: hitos con fecha de cronos no cerrados (`tipo: 'crono'` en `EventoFC`).
- Agente: `hilvan_listar_cronos`, `hilvan_crono` (con lectura, avisos y compuertas), `hilvan_crear_crono` (siembra compuertas enganchadas a los hitos), `hilvan_crono_editar`, `hilvan_crono_hitos`, `hilvan_crono_compuertas` → `/api/agent/*` (`lib/agent-crono.ts`). Deshacer: crear borra en cascada; editar restaura `previo`; hitos y compuertas restauran el conjunto completo.
- **Variantes** (v5, `sql/cronos_v5.sql`): un crono hermano con `variante_de` (id del original) y `variante` (nombre corto). `duplicarComoVariante` copia ficha+etapas+hitos+compuertas (re-enganchando checks); `hacerVigente` deja la elegida en `vigente` y las hermanas en `borrador`. La lista agrupa variantes bajo el original; `cronosVisibles` (lib/crono.ts) decide cuál se pinta afuera (Calendario general): la vigente, o el original si ninguna lo es, nunca cerrados. Tool `hilvan_crono_variante`; `hilvan_crono_editar(estado='vigente')` también baja a las hermanas (reversible).
- **Export PDF** (`/api/cronos/[id]/pdf`, `components/cronos/HojaCronoPDF.tsx`, react-pdf como el resto de la casa): LA HOJA en una A4 horizontal, siempre una página — el motivo de líneas se dibuja línea a línea en Svg (react-pdf no tiene patrones CSS); si el crono es largo las filas y letras se achican, si sobra hoja las filas crecen. Solo con sesión (botón "Exportar PDF" del editor; exige guardar antes). Pendiente: link por token para el cliente.

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
ch-border:      #383836   bordes
ch-muted:       #9a9a92   texto secundario
ch-subtle:      #8c8c86   texto terciario
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
docs/auditoria/            ← auditoría jun 2026: plan de correcciones T01-T15
sql/grants.sql             ← todos los GRANTs documentados
types/index.ts             ← tipos canónicos (solo tipos/constantes + reexports desde lib/ tras T12)
lib/cotizaciones-calc.ts   ← cálculos cotización/rental + formatCLP (T12)
lib/rendiciones-calc.ts    ← calcularRetencion (T12)
lib/rodaje-helpers.ts      ← helpers de rodaje/citaciones (T12)
lib/fechas.ts              ← helpers centralizados de fechas (T10)
proxy.ts                   ← middleware + rutas públicas
```

> **T12:** `types/index.ts` reexporta la lógica de negocio desde `lib/` para no romper los ~100 imports existentes. Código nuevo: importar cálculos/helpers directamente desde los módulos `lib/*` correspondientes.

---

## Convenciones

- Idioma: español en toda la UI
- Fechas: formato local `es-CL`
- Moneda: CLP — usar `formatCLP()` de `types/index.ts`
- Commits: `feat: descripción` / `fix: descripción`

---

## Reglas de la auditoría (jun 2026) — obligatorias para código nuevo

Hallazgos sistemáticos de la auditoría completa (plan de corrección en `docs/auditoria/`). Todo código nuevo debe cumplirlas:

### Seguridad
- **Toda server action que muta datos verifica sesión** (`supabase.auth.getUser()`), y rol si el módulo es restringido. Patrón de referencia: `app/actions/usuarios.ts:32-42`. `createAdminClient()` NUNCA exime del check — se valida ANTES de usarlo.
- **Todo API route handler se defiende solo**: no asumir que `proxy.ts` ya autenticó. Validar sesión y propiedad del recurso (ej: que el `contrato_id` pertenezca al `colaborador_id` recibido).
- **Endpoints que reciben archivos**: lista blanca de extensiones + límite de tamaño (15 MB general, 5 MB para parse-factura) + sanitizar nombres de carpeta (`[a-z0-9_-]+`).
- **Links públicos nuevos siempre con token (crypto.randomUUID)** — nunca solo el ID del recurso. Con `expires_at` si son de un solo uso (onboarding, rendiciones). EXCEPCIÓN decidida por el dueño: los links de cotización para clientes son PERMANENTES — no agregarles expiración.

### Robustez en actions
- `JSON.parse` siempre en try-catch.
- Dinero con `parseFloat` + `Number.isFinite` — nunca `parseInt` para precios (trunca decimales).
- En operaciones multi-paso (delete + insert): parsear/validar TODO antes de la primera escritura y verificar `error` de cada paso. Para flujos críticos, RPC de Postgres.
- Fallos de email no abortan la operación, pero SE REGISTRAN (no `catch {}` vacío).

### Frontend
- Toda mutación invocada desde un componente cliente lleva try-catch + `toastError` de `lib/toast.ts` (no `toast` de sonner directo).
- Todo `fetch` valida `res.ok` antes de `res.json()`.
- Fechas planas `YYYY-MM-DD`: nunca `new Date(str)` directo (se corre un día por UTC). Usar el helper central (`lib/fechas.ts` cuando exista T10; mientras tanto, el patrón `+ 'T12:00:00'`).
- Montos siempre con `formatCLP()` — nunca `.toLocaleString('es-CL')` a mano.
- **Sidebar móvil**: el drawer debe renderizar los ítems no disponibles igual que desktop (`text-ch-subtle`, NO `/40` — quedan invisibles sobre fondo negro). Ver T15.

---

## Pendientes anotados

- **Export Santander**: pendiente validar con rendiciones aprobadas reales (template en `public/templates/santander_masivo.xlsx`, API route en `/api/rendiciones/santander-export`)
- **OTT\* NT AT HOME**: gasto recurrente en tarjeta (~$10.100/mes) — servicio sin identificar, pendiente agregar a suscripciones en rendición mensual
