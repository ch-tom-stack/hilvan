# T11 — Refactor de componentes gigantes

**Prioridad:** P4 (después de T08-tests) · **Modelo:** Opus 4.8 · **Riesgo:** alto (regresiones de UI)

## Problema

Cuatro monolitos concentran demasiada responsabilidad:

| Archivo | Líneas | Qué mezcla |
|---|---|---|
| `components/cotizaciones/ConstructorCotizacion.tsx` | ~1410 | editor completo + modal de items + panel de facturación + estado |
| `app/(dashboard)/rodaje/[id]/page.tsx` | ~1170 | tabs, bloques de tiempo, escenas, imágenes, modales |
| `components/rendiciones/AdminRendiciones.tsx` | ~1078 | tabla + filtros + 3 modales + aprobaciones |
| `app/actions/financiero.ts` | ~1099, 29 exports | config, gastos fijos, flujo de caja, estado de resultados |

## Qué hacer

**Regla de oro: extraer SIN cambiar comportamiento.** Un componente/archivo por PR o commit, en este orden:

1. `ConstructorCotizacion.tsx` → extraer a `components/cotizaciones/`: `ItemModal.tsx`, `PanelFacturacion.tsx`, y los bloques de departamento/subgrupo si son separables limpiamente. Props explícitas, sin context nuevo.
2. `AdminRendiciones.tsx` → extraer modales (`ModalRechazo`, `ModalLinksTemporales`, `ModalNuevaRendicion`) y la tabla.
3. `app/(dashboard)/rodaje/[id]/page.tsx` → extraer tabs a `components/rodaje/` (p. ej. `BloquesTab`, `EscenasTab`, `ImagenesTab`).
4. `app/actions/financiero.ts` → dividir en `financiero-config.ts`, `financiero-gastos-fijos.ts`, `financiero-flujo.ts`, `financiero-resultados.ts`; mantener `financiero.ts` reexportando todo para no romper imports existentes (o actualizar todos los imports, a elección, pero consistente).

## Restricciones

- No introducir librerías de estado ni patrones nuevos. Mismo estilo del código circundante.
- No "aprovechar de mejorar" lógica — eso va en otras tareas.
- Después de cada extracción: `npx tsc --noEmit` + smoke test visual de la pantalla afectada (preview).

## Criterios de aceptación

- Ningún archivo de los 4 supera ~500 líneas al final.
- Cero cambios de comportamiento visibles (mismos flujos, mismos textos).
- Los tests de T08 siguen pasando.
