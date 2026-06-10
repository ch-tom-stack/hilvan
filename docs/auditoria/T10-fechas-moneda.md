# T10 — Centralizar manejo de fechas y moneda

**Prioridad:** P3 · **Modelo:** Sonnet 4.6 · **Riesgo:** bajo

## Problema

1. **Fechas**: 15 lugares usan el parche `new Date(fecha + 'T12:00:00')` para evitar que un `YYYY-MM-DD` se interprete como UTC y se corra un día en Chile. Funciona, pero está copiado a mano y algunos lugares NO lo aplican (`new Date(iso)` directo), con riesgo de desfase. Archivos detectados: `EditorCotizacion.tsx`, `GestionReservas.tsx`, `FormularioReserva.tsx`, `NuevaCotizacionForm.tsx` (rental), `HojaLlamadosPDF.tsx`, `TablaReservas.tsx`, `app/(dashboard)/rodaje/page.tsx`, `NotasMaleta.tsx`, `InboxGCal.tsx`, `RentalCotizacionPDF.tsx`, `PerfilPage`, `FichaColaborador.tsx`.
2. **Moneda**: existe `formatCLP()` en `types/index.ts`, pero `FichaColaborador.tsx` (~419, 461), `RentalCotizacionPDF.tsx` (~73) y `FormularioReserva.tsx` (~184) usan `.toLocaleString('es-CL')` a mano.

## Qué hacer

1. Crear `lib/fechas.ts` con helpers documentados:
   - `parseFechaLocal(yyyymmdd: string): Date` — parsea `YYYY-MM-DD` como fecha local de Chile (internamente puede seguir usando T12:00:00; el punto es que viva en UN lugar).
   - `formatFecha(d: string | Date, opts?)` — `toLocaleDateString('es-CL', ...)` con formato estándar de la app.
2. Reemplazar las 15 ocurrencias del parche y los `new Date(iso).toLocaleDateString` directos por los helpers. Distinguir: timestamps completos (`created_at` ISO con hora) NO necesitan el parche — usar `formatFecha` directo; solo las fechas planas `YYYY-MM-DD` usan `parseFechaLocal`.
3. Reemplazar los `.toLocaleString('es-CL')` de montos por `formatCLP()`.
4. Verificación visual: las fechas mostradas no cambian (mismo día), los montos se ven igual.

## Criterios de aceptación

- Cero ocurrencias de `'T12:00:00'` fuera de `lib/fechas.ts` (grep).
- Cero `.toLocaleString('es-CL')` para montos fuera de `formatCLP` (grep).
- `npx tsc --noEmit` pasa.
