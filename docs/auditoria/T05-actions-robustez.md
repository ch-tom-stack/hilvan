# T05 — Transacciones y manejo de errores en server actions

**Prioridad:** P2 · **Modelo:** Opus 4.8 · **Riesgo:** medio (toca el núcleo de la app)

## Problema

Las server actions (`app/actions/*.ts`) tienen operaciones multi-paso sin atomicidad y parsing sin protección. Hallazgos verificados por la auditoría:

1. **`maletas.ts` (~57–72)**: al editar una maleta, borra TODOS los `maleta_items` y luego inserta los nuevos. Si el `JSON.parse(itemsRaw)` falla o el insert falla, la maleta queda vacía. Sin try-catch, sin verificar error del delete.
2. **`JSON.parse` sin try-catch**: `equipos.ts:~21` (fotos), `maletas.ts:~27` (items), `financiero.ts:~85` (getNomina).
3. **`equipos.ts:~18`**: `precio_jornada` se parsea con `parseInt` — trunca decimales. Usar `parseFloat`. Además el patrón `parseInt(x) || 1` convierte `NaN` en default silenciosamente — aceptable para cantidad, pero precios inválidos deben rechazarse, no convertirse en `null` silencioso.
4. **`bundles.ts` (~134)**: `eliminarBundle` borra `bundle_items` sin verificar error antes de borrar el bundle.
5. **`cotizaciones.ts` (~737)**: `reordenarItems` hace `Promise.all` de updates individuales — si uno falla, queda orden inconsistente. Usar `Promise.allSettled` + reporte, o un upsert masivo.
6. **`rental.ts` (~193–210)**: insert con fallback silencioso (reintenta sin `created_by` ante CUALQUIER error). Restringir el fallback al código de error de columna inexistente (`42703`) o eliminarlo si la columna ya existe en producción.
7. **`cotizaciones.ts` (~583) + `autoCrearProyectoDesdeAprobacion`**: posible doble creación de proyecto si el cliente responde dos veces. Proteger con check de existencia + constraint único en DB si es posible.

## Estrategia para atomicidad

Supabase JS no expone transacciones. Opciones, en orden de preferencia:

- **Función RPC en Postgres** (`sql/`) para las operaciones realmente críticas (editar items de maleta, reordenar items de cotización): un solo `supabase.rpc(...)` que haga delete+insert dentro de una transacción. Recordar GRANTs (ver `sql/grants.sql`).
- Donde no amerite RPC: validar/parsear TODO antes de la primera escritura (el JSON.parse va ANTES del delete), y verificar `error` de cada paso, abortando con mensaje claro.

## Qué hacer

1. Arreglar los 7 puntos de arriba.
2. Pasada general por los 17 archivos de `app/actions/`: todo `JSON.parse` en try-catch; todo `parseInt/parseFloat` de dinero con `parseFloat` + validación `Number.isFinite`; verificar `error` de cada operación de escritura encadenada.
3. NO unificar el patrón de retorno de errores en esta tarea (eso es refactor aparte) — mantener la forma de retorno actual de cada función.

## Criterios de aceptación

- Editar una maleta con items corruptos no la deja vacía (los items originales sobreviven).
- `npx tsc --noEmit` pasa y los flujos de equipos, maletas, bundles, cotizaciones y rental funcionan (smoke test manual o preview).
- Reporte final listando cada cambio y cualquier hallazgo nuevo no corregido.
