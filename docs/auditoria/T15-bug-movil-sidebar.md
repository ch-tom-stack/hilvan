# T15 — Bug móvil: Financiero y Calendario no visibles en el menú

**Prioridad:** P1 (bug reportado por el dueño) · **Modelo:** Sonnet 4.6 · **Riesgo:** bajo

## Síntoma reportado

En el móvil, el menú no muestra "Financiero" ni "Calendario". En escritorio sí aparecen.

## Diagnóstico previo (verificado leyendo `components/layout/Sidebar.tsx`)

Desktop y móvil usan la MISMA lista `BASE_NAV_ITEMS`, así que no es una lista desactualizada. Las causas candidatas, en orden de probabilidad:

1. **Ítems "no disponibles" casi invisibles en el drawer móvil.** Cuando un ítem queda `disponible: false` (p. ej. Financiero si el `rol` de la sesión no es `admin`/`contabilidad`, o si el perfil no carga y `rol` llega `undefined`), el desktop lo pinta con `text-ch-subtle` (gris visible, línea ~85) pero el drawer móvil usa `text-ch-subtle/40` (línea ~200): #8c8c86 al 40% de opacidad sobre fondo #111110 — **prácticamente invisible** en una pantalla de teléfono. El ítem "está" pero no se ve.
2. **Ítems al final de la lista bajo el pliegue.** Calendario y Rental son los ítems 10 y 11. En el drawer (`px-3 py-3` por ítem + header de 56px), en un teléfono chico quedan debajo del borde visible; el contenedor tiene `overflow-y-auto` pero no hay indicador de scroll y el body está bloqueado (`overflow: hidden`), así que es fácil creer que no existen.
3. **Perfil sin rol en esa sesión**: `app/(dashboard)/layout.tsx` pasa `rol={profile?.rol}`; si la fila de `profiles` no existe o el select falla, `rol` es `undefined` → Financiero y Usuarios se degradan a "no disponibles" (y por la causa 1, invisibles en móvil).

## Qué hacer

1. **Reproducir** con preview: levantar dev server, `preview_resize` a 390×844, iniciar sesión, abrir el drawer. Probar con rol admin y con rol vacío (puede simularse pasando `rol` hardcodeado temporalmente).
2. **Arreglar la visibilidad**: en el drawer móvil, los ítems no disponibles deben verse igual que en desktop (`text-ch-subtle`, sin `/40`) — o mejor: decidir UNA política y aplicarla en ambos: o se muestran atenuados de forma legible, o no se renderizan. Mantener coherencia desktop/móvil.
3. **Asegurar el scroll**: confirmar que con 11 ítems el drawer permite scroll en viewport 390×667 (iPhone SE). Si el footer de usuario lo tapa, ajustar.
4. **Robustecer el rol**: en `app/(dashboard)/layout.tsx`, si `profile` viene null, loguear `console.error` con el user.id (hoy falla silencioso). No cambiar la lógica de permisos.
5. **Verificar con el dueño**: si tras el fix sigue sin ver Financiero, su perfil en `profiles` no tiene `rol = 'admin'` — eso se corrige en datos, no en código. Incluir en el reporte la query para chequearlo: `select id, nombre, rol from profiles;`

## Criterios de aceptación

- En 390×844 con rol admin: el drawer muestra los 11 ítems, Financiero y Calendario clicables y legibles (captura en el reporte).
- Con rol no-admin: los ítems restringidos se ven igual (atenuados u ocultos) en desktop y móvil.
- `npx tsc --noEmit` pasa.
