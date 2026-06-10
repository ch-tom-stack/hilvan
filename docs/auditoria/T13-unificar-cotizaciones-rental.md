# T13 — Unificar lógica cotizaciones / rental

**Prioridad:** P4 (la última — requiere T08, T11, T12 hechas) · **Modelo:** Fable 5 · **Riesgo:** alto

## Problema

El módulo Rental (`app/actions/rental.ts`, ~632 líneas, y sus componentes `NuevaCotizacionForm`, `EditorCotizacion`, `RentalCotizacionPDF`) duplica ~80% de la lógica de cotizaciones (`app/actions/cotizaciones.ts`, ~802 líneas): cálculos de subtotales, generación de PDF, flujo de creación/edición. Cada bug se arregla dos veces.

Diferencias reales: rental no tiene departamentos anidados ni subgrupos; usa tablas propias (`rental_cotizaciones`, `rental_cotizacion_items`).

## Qué hacer

1. **Primero medir, después decidir.** Comparar archivo a archivo cuánto es realmente idéntico. Si la duplicación es de cálculos: extraer a `lib/cotizaciones-calc.ts` (creada en T12) funciones parametrizadas que ambos módulos consuman. Si es de UI: extraer componentes compartidos a `components/shared/`.
2. **NO fusionar tablas ni modelos de datos** — `rental_*` y `cotizacion_*` siguen separados. Esta tarea unifica código, no esquema.
3. Empezar por lo de mayor retorno y menor riesgo: (a) cálculos de totales, (b) componentes de PDF (estilos/layout compartidos), (c) formularios solo si la ganancia es clara.
4. Mantener el comportamiento de ambos módulos pixel a pixel en PDFs (compararlos antes/después con la misma cotización).
5. Si en algún punto la unificación cuesta más de lo que ahorra, detenerse y documentar dónde y por qué — resultado parcial es aceptable.

## Criterios de aceptación

- Cálculos de totales definidos UNA sola vez y usados por ambos módulos.
- PDFs de ambos módulos idénticos a los previos al refactor.
- Tests de T08 pasan; `npx tsc --noEmit` pasa.
- Reporte con el % de duplicación eliminado y lo que se decidió no unificar.
