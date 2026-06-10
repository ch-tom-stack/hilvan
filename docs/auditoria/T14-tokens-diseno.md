# T14 — Migrar clases zinc/gray a tokens ch-*

**Prioridad:** P4 · **Modelo:** Sonnet 4.6 · **Riesgo:** bajo (solo visual)

## Problema

110 ocurrencias de clases `zinc-*`/`gray-*` violan el sistema de diseño (tokens `ch-*` obligatorios). Concentradas en:

- `components/rodaje/LocacionesEditor.tsx` — 24 ocurrencias
- `components/rodaje/ImagenUploader.tsx` — 5
- `components/cotizaciones/VistaClienteCotizacion.tsx` — 3 `gray-*` + 3 `rounded-lg` (líneas ~181, 193, 207) — `rounded-lg` también está prohibido (máximo `rounded-[2px]`)
- Resto repartido en componentes de rental y formularios

## Mapa de equivalencias (de `globals.css` / CLAUDE.md)

| Uso | Token |
|---|---|
| Fondo base / oscuro | `ch-black` (#111110), `ch-dark` (#1c1c1a) |
| Cards, inputs | `ch-surface` (#242422) |
| Bordes | `ch-border` (#383836) |
| Texto secundario | `ch-muted` (#9a9a92) |
| Texto terciario | `ch-subtle` (#8c8c86) |
| Texto principal | `ch-cream` (#f5f0e8) |
| Acento / CTA | `ch-green`, hover `ch-green-light` |
| Advertencia / pendiente | `ch-gold`, hover `ch-gold-light` |

Mapeo orientativo: `zinc-900/800 → ch-surface o ch-dark`, `zinc-700/600 → ch-border`, `zinc-400/500 → ch-muted`, `zinc-300 → ch-subtle`, `gray-50/100/200` (fondos claros en vistas cliente) → revisar el contexto: las vistas públicas de cliente pueden tener fondo claro intencional — en ese caso usar `ch-cream` y derivados, no inventar tokens.

## Qué hacer

1. Migrar archivo por archivo (no sed global ciego — cada caso necesita ojo para elegir el token correcto por contraste).
2. `rounded-lg` → `rounded-[2px]`. Verificar también que no haya `shadow-*` (la auditoría encontró 0 — mantenerlo).
3. Verificación visual con preview de cada pantalla tocada (LocacionesEditor y ImagenUploader están en el editor de rodaje; VistaClienteCotizacion en `/cotizacion/[token]`).
4. Al final: `grep -rn "zinc-\|gray-\|slate-" components/ app/ --include="*.tsx"` debe dar 0 (excepto `bg-black/70` y similares que son negro puro permitido en backdrops).

## Criterios de aceptación

- Cero clases zinc/gray/slate y cero rounded > 2px (salvo `rounded-full` en avatares/badges, permitido).
- Las pantallas afectadas se ven coherentes con el resto de la app (capturas antes/después en el reporte).
