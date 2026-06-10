# T08 — Tests de cálculos críticos + CI mínimo

**Prioridad:** P3 (hacer ANTES de los refactors P4) · **Modelo:** Opus 4.8 · **Riesgo:** bajo

## Problema

Cero tests y cero CI. Los cálculos de dinero (totales de cotización, retención de boletas, IVA) viven en `types/index.ts` y `app/actions/financiero.ts` sin ninguna verificación automática. Cada deploy es un acto de fe.

## Qué hacer

1. **Instalar Vitest** (liviano, compatible con TS del proyecto): `npm i -D vitest` + script `"test": "vitest run"`.
2. **Tests unitarios de funciones puras** (no testear Supabase ni componentes en esta tarea):
   - `calcularTotales()`, `subtotalItem()`, `subtotalSubgrupo()`, `subtotalDepartamento()`, `calcularBruto()` de `types/index.ts` — casos: cotización vacía, items con descuento, items no incluidos, redondeos CLP.
   - `calcularRetencion()` — tasas vigentes por año, montos límite.
   - `formatCLP()` — montos con decimales, negativos, cero.
   - Helpers de rodaje: `calcularCascada()`, `aplicarCambioTiempo()`, `resolverHoraLlamado()` — casos de cascada de horarios.
   - `lib/periodos.ts`.
   - Lógica de parseo de `app/api/parse-factura/route.ts` si las funciones de extracción son exportables/extraíbles — si están inline, extraerlas a `lib/parse-factura.ts` para testearlas (sin cambiar comportamiento).
3. **Fijar el comportamiento ACTUAL**: si un test revela un resultado dudoso, documentarlo en el reporte, no "corregirlo" — el objetivo es red de seguridad para refactors.
4. **CI con GitHub Actions**: `.github/workflows/ci.yml` que en cada push/PR a `main` corra `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm test`. (El build completo de Next necesita env vars — omitirlo o usar `next build` solo si pasa sin secretos.)

## Criterios de aceptación

- `npm test` corre en local y pasa (~30+ asserts sobre las funciones listadas).
- El workflow corre en GitHub en el próximo push.
- Ningún cambio de comportamiento en código de producción (salvo extracción sin cambios de parse-factura, si aplica).
