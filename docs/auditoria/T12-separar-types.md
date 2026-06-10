# T12 — Separar types/index.ts (tipos vs lógica de negocio)

**Prioridad:** P4 (después de T08-tests) · **Modelo:** Opus 4.8 · **Riesgo:** medio (archivo importado por toda la app)

## Problema

`types/index.ts` (~1084 líneas) mezcla ~67 tipos con ~30 funciones de negocio: cálculos de cotización (`calcularTotales`, `subtotalItem`, `calcularBruto`...), `formatCLP`, `calcularRetencion`, y helpers de rodaje (`calcularCascada`, `aplicarCambioTiempo`, `generarMensajeCitacion`, `generarLinkCalendar`, `generarLinkUber`...).

## Qué hacer

1. Crear:
   - `lib/cotizaciones-calc.ts` — cálculos de cotización + `formatCLP`.
   - `lib/rendiciones-calc.ts` — `calcularRetencion` y afines.
   - `lib/rodaje-helpers.ts` — helpers de rodaje/citaciones.
2. Mover las funciones SIN modificarlas (los tests de T08 deben seguir pasando sin cambios en asserts).
3. En `types/index.ts`, **reexportar** las funciones movidas (`export { formatCLP, calcularTotales } from '@/lib/cotizaciones-calc'` etc.) para no romper los ~100 imports existentes. Migrar los imports gradualmente queda fuera de alcance — la reexportación es suficiente.
4. `types/index.ts` queda solo con tipos, constantes (`CATEGORIAS_RENDICION_MENSUAL` puede quedarse) y reexports.
5. Actualizar CLAUDE.md: sección "Archivos de referencia" debe mencionar los nuevos archivos lib/.

## Advertencia

CLAUDE.md exige: **leer `types/index.ts` completo antes de editar, nunca sobreescribir parcialmente**. Respetarlo.

## Criterios de aceptación

- `npx tsc --noEmit` pasa sin tocar ningún otro archivo (gracias a los reexports).
- Tests de T08 pasan.
- `types/index.ts` < 700 líneas y sin cuerpos de función de negocio (solo tipos/constantes/reexports).
