# Informe ensayo sii → Hilván

> Ensayo del 16-oct-2026 con `@albertomarturelo/sii-cli` 0.10.0. Solo lectura: no se escribió nada en el SII ni en Hilván.
> RUTs y razones sociales de terceros anonimizados.

## Entorno
- SO / Node / versión de sii-cli: macOS (arm64) · Node 24.15.0 · sii-cli / sii-mcp 0.10.0 (instalados en `~/sii-ensayo`, no global: `/usr/local` daba EACCES) · Playwright 1.64.1 + Chromium 1248.
- Backend de Hilván: Next.js 16.2.4 (TypeScript), route handlers `runtime = 'nodejs'`, **serverless en Vercel**.
- Dónde se llamaba al API Gateway:
  - `app/api/agent/sii-sync/route.ts` (RCV compras + NC + BHE recibidas)
  - `app/api/agent/sii-sync-ventas/route.ts` (RCV ventas + match a cotizaciones)
  - `lib/agent-sii.ts` (normalización pura, dedup, `normalizarRut`)
  - Env: `APIGATEWAY_API_TOKEN`, `SII_RUT`, `SII_CLAVE` (la clave de la empresa vive hoy en Vercel).

## Fase A: Funcionalidad
- Login: **ok** al primer intento (`sii auth login`, navegador) · fricción: solo la instalación (EACCES en `npm -g` y bajar Chromium ~285 MB).
- Operando como: **empresa** (77151117-1, la cuenta tributaria propia de Casa Hiedra) · no hizo falta `operate` ni `--rut`. Es obligatorio entrar como la empresa: BHE es *session-keyed* y no llega a los datos de una empresa representada.
- Mes probado: **2026-06** (ya sincronizado con el gateway, 40 filas en `sii_documentos`).
- Tiempos: resumen 1–3 s, `rcv all` compras 4 s, `rcv all --venta` 3 s, `bte list --recibidas` 1 s.
- RCV compras: **32 filas** (24 DTE 33 + 7 DTE 34 + 1 DTE 61) · coincide con el resumen del SII: sí · con `sii_documentos`: **sí, fila a fila** (folio, total, neto, IVA, fecha).
- RCV ventas: **3 filas** (DTE 33) · coinciden con `sii_documentos`: sí. Ojo: `incomplete: true` por un falso rechazo (ver "Hallazgos").
- NC recibidas: **sí aparecen** (DTE 61) · traen referencia en `raw.detTipoDocRef` / `raw.detFolioDocRef` (en el caso visto: tipo 39, folio 66991, igual a lo guardado por el gateway). NC emitidas: **no verificado**, no hubo en junio.
- BHE recibidas: **5 filas** (= `totalBoletas` del SII) · campos completos: folio, fecha, RUT y nombre del emisor, bruto (`totalHonorarios`), retención (`retencionReceptor`), líquido (`honorariosLiquidos`), estado. Coinciden con `sii_documentos`.
- Comparación total con `sii_documentos` 202606: **40 de 40 documentos idénticos**, ninguno de más ni de menos.
- Montos: enteros (`number`). **Las NC vienen con montos POSITIVOS** (el signo lo pone el tipo 61), igual que con el gateway.

### Campos por tipo de fila (nombres reales)
**RCV (compra y venta, mismo shape)**: `folio` (number), `rutEmisor` (canónico `12345678-9`; en ventas es el RECEPTOR = cliente), `razonSocial`, `fechaEmision` (ISO `YYYY-MM-DD`), `fechaRecepcion` (`YYYY-MM-DD HH:MM:SS`), `montoExento`, `montoNeto`, `montoIva`, `montoTotal`, `eventoReceptor`, `eventoReceptorLeyenda`, `codigoTipoDoc` (string: `"33"`, `"34"`, `"61"`) y `raw` con las ~65 columnas `det*` del SII (`detNroDoc`, `detTipoDocRef`, `detFolioDocRef`, `detAnulado`, `detIVAUsoComun`, …). Son **los mismos endpoints y columnas que usaba el gateway** en su formato `rcv`.

**BHE recibidas**: `folio` (number), `fecha` (**`DD/MM/YYYY`**, no ISO), `contraparteRut`, `contraparteNombre`, `totalHonorarios`, `honorariosLiquidos`, `retencionEmisor` (null en recibidas), `retencionReceptor`, `estado` (`VIG`/`ANUL`), `fechaAnulacion`, `socProfesional`. **Sin `raw`** (decisión de la librería por PII). Totales del mes en `totales`.

### Mapeo a Hilván
| Concepto Hilván | Campo en salida de `sii` | Notas |
|---|---|---|
| RUT emisor / receptor | RCV `rutEmisor` · BHE `contraparteRut` | Ya canónico; en ventas es el receptor |
| Razón social | RCV `razonSocial` · BHE `contraparteNombre` | |
| Tipo DTE | RCV `codigoTipoDoc` (string) · BHE → 0 | Convertir a `int` |
| Folio | RCV `folio` · BHE `folio` | `number` → `String()` para `claveDedup` |
| Fecha emisión | RCV `fechaEmision` (ISO) · BHE `fecha` (DD/MM/YYYY) | `fechaISO()` ya acepta ambos |
| Neto / exento / IVA / total | `montoNeto` / `montoExento` / `montoIva` / `montoTotal` | Enteros; NC positiva |
| Referencia de la NC | `raw.detTipoDocRef` / `raw.detFolioDocRef` | Viene en la misma consulta (el gateway pedía otra llamada) |
| BHE bruto / retención / líquido | `totalHonorarios` / `retencionReceptor` / `honorariosLiquidos` | Descartar `estado = 'ANUL'` |
| Período | `YYYY-MM` | Acepta también `YYYYMM` como entrada |

## Fase B: Fallas
- Duración de sesión observada: **pendiente**. Login 16-oct 17:35 (Chile); todas las cookies de sesión del SII son de navegador (sin fecha), así que la duración real la decide el servidor. La librería asume 60 min. Hay que probar un comando unas horas después.
- Error al expirar la sesión: **pendiente de observar**. Según el código: `SessionExpiredError` → "La sesión expiró. Ejecuta `sii auth login`." (exit 2, sin reintento).
- SII lento o caído: **no ocurrió**. Según el código: cada consulta corta a los 30 s (Playwright), sin reintentos, y un rechazo del SII es un error tipificado con el mensaje textual. Observado: el login pasa por la **sala de espera Queue-it** del SII (cookies `salaespera.sii.cl`): en días de alta carga es un modo de falla probable.
- Vía MCP: **no probado** (no se conectó `sii-mcp`). Según el código: un error vuelve como `isError: true` con el mensaje en español, sin reintento interno; que el modelo insista o no depende del agente. Además `sii-mcp` expone herramientas que **escriben en el SII** (`bte_emit`, borradores de DTE): conectarlo exige restringir herramientas.

## Fase C: Integración
- **Opción recomendada: C (lectura local + importación en Hilván), variante "runner local"**:
  - B no es viable: Hilván corre serverless en Vercel (sin Chromium/Playwright razonable) y el login necesita un humano cada vez que muere la sesión.
  - A pierde la lógica de Hilván y pasa ~80 KB de JSON por mes y lado por el modelo (justo el gasto de tokens que se quiere evitar).
  - C con un **comando local** (no el modelo) que corre `sii` en el Mac y manda el JSON crudo a Hilván: la clave nunca sale del computador, cero JSON por tokens y las herramientas actuales siguen funcionando.
- Cambios necesarios en Hilván:
  1. `POST /api/agent/sii-importar` (llave de agente): recibe las salidas tal cual de `rcv all` (compra y venta) y `bte list --recibidas`, normaliza con mapeadores nuevos en `lib/agent-sii.ts` y hace upsert en `sii_documentos` (el check de `fuente` ya admite `rcv_venta`, ver `sql/sii_ventas.sql`). Registra el estado de la importación por período (completo / incompleto + errores).
  2. `hilvan_sii_sync` y `hilvan_sii_sync_ventas` dejan de llamar al gateway y leen `sii_documentos` del período, manteniendo `ya_cargado`, `notas_credito` y `cotizacion_sugerida`. **Si el período no se importó o quedó incompleto, responden ERROR, nunca listas vacías** (corrige el defecto 2.3).
  3. Runner local (ej. `npm run sii:importar -- 2026-09`): corre los tres comandos, aborta ante cualquier error de sesión y envía. Tratar como incompleto todo `rejectedTypes` salvo los tipos con `totalDocumentos = 0` en el resumen (ver hallazgo).
  4. Quitar `APIGATEWAY_API_TOKEN` y **`SII_CLAVE`** de Vercel.
- Riesgos:
  - Requiere el Mac encendido y un login humano por sesión (proceso mensual de ~2 min).
  - Librería no oficial (scraping): un cambio del SII la rompe. Mitigación: falla con error explícito y fijamos la versión.
  - Sala de espera del SII en días de alta carga (no observado aún).
  - BHE sin `raw`: `sii_documentos.raw` de las boletas guardaría solo los campos ya ordenados.

## Hallazgos que podrían justificar contribuir
- **`rcv all --venta` marca `incomplete: true` por un tipo sin documentos.** Pasos: período 2026-06, cuenta empresa. `rcv summary --venta` devuelve la fila `codigoTipoDoc: "48"` ("Total mes Comprobantes Pago Electrónico") con `totalDocumentos: 0`; `rcv all --venta` pide su detalle y el SII lo rechaza → `incomplete: true, rejectedTypes: ["48"]`. Mensaje del SII, textual (`rcv list --tipo 48 --venta`): *"No es posible realizar esta consulta, no hay documentos o debe ser de forma diferida"*. Efecto: un período completo se ve incompleto, y un consumidor que trate `incomplete` como error no puede distinguirlo de un rechazo real. Sugerencia: saltar en el fan-out los tipos con `totalDocumentos === 0` (o los que el resumen marca sin detalle, `rsmnLink`). Candidato a issue según la sección 8.

## Respuestas a las preguntas abiertas (sección 7)
1. **Sí**, `rcv all` funciona en vivo hoy en compras y ventas (16-oct-2026), con el falso `incomplete` descrito arriba.
2. **Sí** para las NC recibidas: la referencia viene en `raw.detTipoDocRef` / `raw.detFolioDocRef`. Las NC emitidas no se verificaron (no hubo en el mes).
3. Pendiente: se mide en el próximo uso. La librería asume ~60 min.
4. La clave es **de Casa Hiedra** (la empresa tiene su propia clave tributaria). No hace falta `operate` ni `--rut`, y **tiene que ser así** para leer BHE.
5. No se observó. Por código: timeout de 30 s y error claro, sin reintentos. La sala de espera Queue-it es el riesgo a mirar.
6. No se probó vía MCP. La recomendación evita el MCP en el flujo, así que deja de importar.
7. Next.js 16 / Node en Vercel serverless. B no es viable.
8. **C con runner local**: cero tokens en mover datos, la clave fuera del servidor y se reutiliza toda la lógica de Hilván.
