# T04 — Límites de tamaño y tipo en uploads

**Prioridad:** P2 · **Modelo:** Haiku 4.5 · **Riesgo:** bajo

## Problema

Endpoints que reciben archivos sin validar tamaño ni tipo:

1. `app/api/upload/route.ts` — valida sesión pero acepta cualquier archivo de cualquier tamaño, y la `carpeta` viene del cliente sin sanitizar.
2. `app/api/parse-factura/route.ts` — sin límite de tamaño antes de parsear el PDF (tiene `maxDuration = 15`, pero un PDF gigante consume memoria).

## Qué hacer

1. En `/api/upload`:
   - Lista blanca de extensiones: `pdf, jpg, jpeg, png, webp, heic` → si no, 400.
   - Tamaño máximo 15 MB → 413.
   - Sanitizar `carpeta`: permitir solo `[a-z0-9_-]+` (rechazar `/`, `..`); si no cumple, usar `'uploads'`.
2. En `/api/parse-factura`:
   - Validar `file.type === 'application/pdf'` (o nombre `.pdf`) → 400.
   - Tamaño máximo 5 MB → 413.
3. Añadir `export const maxDuration = 30` a las rutas de PDF que no lo tienen: `app/api/cotizaciones/[id]/pdf/route.ts`, `app/api/rodaje/[id]/pdf/route.ts`, `app/api/rental/cotizaciones/[id]/pdf/route.ts`.
4. Verificar los componentes que llaman `/api/upload` (grep `'/api/upload'`: AdminRendiciones, FormularioInversion, RendicionMensualView, etc.) — los tipos que hoy suben (fotos, PDFs de comprobantes) deben seguir pasando.

## Criterios de aceptación

- Archivo de 20 MB → 413 con JSON `{ error }`. Archivo `.sh` → 400.
- Subidas normales de comprobantes y fotos siguen funcionando.
- `npx tsc --noEmit` pasa.
