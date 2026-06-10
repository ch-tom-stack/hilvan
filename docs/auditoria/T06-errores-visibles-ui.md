# T06 — Errores visibles en la UI

**Prioridad:** P2 · **Modelo:** Sonnet 4.6 · **Riesgo:** bajo

## Problema

En varias pantallas, si una server action o un fetch falla, el usuario no recibe ningún feedback ("le di guardar y no pasó nada"). Hallazgos:

1. **`components/cotizaciones/ConstructorCotizacion.tsx`** (~líneas 176–283): `agregarDepartamento`, `actualizarDepartamento`, `agregarItem`, etc. se llaman sin try-catch; si fallan, promesa rechazada sin manejo.
2. **`app/(dashboard)/rodaje/[id]/page.tsx`** (~289 y similares): `actualizarEstadoRodaje` y otras sin try-catch ni toast.
3. **Fetch sin validar `res.ok` antes de `res.json()`**: `components/financiero/FormularioInversion.tsx` (~92), `components/rendiciones/FormularioGasto.tsx` (~98), `components/rendiciones/RendicionMensualView.tsx` (~99), `components/rendiciones/AdminRendiciones.tsx` (~235), `components/rendiciones/ExportSantander.tsx` (~109).

## Patrón a aplicar

La app usa `sonner` con helpers en `lib/toast.ts`. Patrón estándar:

```typescript
try {
  const data = await accionServidor(...)
  // actualizar estado
} catch (e) {
  toastError(e instanceof Error ? e.message : 'Error al guardar')
}
```

Para fetch:

```typescript
const res = await fetch('/api/upload', { method: 'POST', body: fd })
if (!res.ok) { toastError('Error al subir el archivo'); return }
const json = await res.json()
```

## Qué hacer

1. Aplicar el patrón en los puntos listados arriba.
2. Hacer una pasada por el resto de componentes cliente que invocan actions de mutación (grep de imports desde `@/app/actions/`) y cubrir las que no tengan manejo de error. Priorizar mutaciones; las lecturas en server components no aplican.
3. Usar SIEMPRE los helpers de `lib/toast.ts` (`toastOk`/`toastError`), no `toast` de sonner directo, para unificar el patrón. Reemplazar usos directos existentes al pasar por esos archivos (sin hacer una migración global aparte).
4. Mensajes en español, breves, sin jerga técnica.

## Criterios de aceptación

- Simular un fallo (desconectar red o forzar throw) en crear departamento de cotización → aparece toast de error y la UI no queda en estado falso.
- Ningún `res.json()` sin check previo de `res.ok` en los archivos listados.
- `npx tsc --noEmit` pasa.
