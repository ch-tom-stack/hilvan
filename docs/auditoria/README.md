# Auditoría Hilván — Junio 2026

Plan de correcciones derivado de la auditoría completa del 2026-06-10.
Cada archivo `Txx-*.md` es un encargo **autocontenido** para un agente: incluye contexto, archivos, cambios y criterios de aceptación. El agente NO tiene memoria de la auditoría — todo lo que necesita está en su archivo.

## Reglas para todos los agentes

1. Leer `CLAUDE.md` y `AGENTS.md` antes de tocar código.
2. Una tarea = una rama o worktree. Commits `fix:`/`feat:` en español.
3. No mezclar tareas: si encuentras un problema fuera de tu encargo, anótalo al final de tu reporte, no lo arregles.
4. Verificar con `npx next build` (o al menos `npx tsc --noEmit`) antes de dar por terminado.
5. No tocar `types/index.ts` sin leerlo completo primero.

## Índice de tareas

| # | Tarea | Prioridad | Modelo recomendado |
|---|-------|-----------|--------------------|
| T01 | Validar rol admin en financiero.ts | P1 | Sonnet 4.6 |
| T02 | Autorización en PDFs públicos (sin romper links existentes) | P1 | Opus 4.8 |
| T03 | Validar propiedad en subir contrato firmado | P1 | Sonnet 4.6 |
| T04 | Límites de tamaño/tipo en uploads y parse-factura | P2 | Haiku 4.5 |
| T05 | Transacciones y manejo de errores en actions multi-paso | P2 | Opus 4.8 |
| T06 | Errores visibles en la UI (try-catch + toast) | P2 | Sonnet 4.6 |
| T07 | Registro de fallos de email | P2 | Sonnet 4.6 |
| T08 | Tests de cálculos críticos + CI mínimo | P3 | Opus 4.8 |
| T09 | Limpieza de dependencias y archivos muertos | P3 | Haiku 4.5 |
| T10 | Centralizar manejo de fechas y moneda | P3 | Sonnet 4.6 |
| T11 | Refactor de componentes gigantes | P4 | Opus 4.8 |
| T12 | Separar types/index.ts (tipos vs lógica) | P4 | Opus 4.8 |
| T13 | Unificar lógica cotizaciones / rental | P4 | Fable 5 |
| T14 | Migrar clases zinc/gray a tokens ch-* | P4 | Sonnet 4.6 |
| T15 | Bug móvil: Financiero y Calendario no visibles en drawer | P1 | Sonnet 4.6 |

## Criterio de asignación de modelos

- **Haiku 4.5** — cambios mecánicos y acotados con instrucciones exactas (límites de archivo, borrar paquetes).
- **Sonnet 4.6** — tareas bien especificadas que requieren leer código y aplicar un patrón existente.
- **Opus 4.8** — tareas con juicio: decidir caso a caso, tocar muchos archivos, diseñar tests o refactors.
- **Fable 5** — refactors arquitectónicos con riesgo de regresión (unificación cotizaciones/rental).

## Orden sugerido de ejecución

P1 primero (T01, T02, T03, T15) — son seguridad y un bug visible. T04–T07 después. T08 (tests) antes de los refactors P4, para que los refactors tengan red de seguridad. T09–T10 en cualquier momento. T11–T14 al final y de a uno.

## Verificación post-fase (obligatoria)

Al completar cada fase (tanda de tareas), ANTES de integrar a `main` y después de integrar:

1. Verificación en navegador real con **Claude in Browser** (extensión de Chrome) sobre la app corriendo: recorrer los flujos tocados por la fase (login → módulo afectado → operación completa), confirmando que nada que funcionaba dejó de funcionar.
2. Smoke test mínimo de los flujos críticos siempre, independiente de la fase: crear/ver una cotización, abrir su link de cliente, ver una rendición, abrir el drawer móvil (viewport ~390px).
3. Registrar el resultado (qué se probó, capturas si hay hallazgos) en el reporte de la fase.
