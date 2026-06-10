# T02 — Autorización en PDFs públicos (sin romper links existentes)

**Prioridad:** P1 (seguridad) · **Modelo:** Opus 4.8 · **Riesgo:** medio si se hace mal — por eso esta regla:

> **REGLA CERO DE ESTA TAREA: ningún link que hoy funciona puede dejar de funcionar.**
> La app está en producción y clientes/colaboradores usan links activos para decisiones de gestión.
> Los links de cotización (`/cotizacion/[token]`) son PERMANENTES y así se quedan. NO agregar expiración.

## Problema

`proxy.ts` deja públicas estas rutas por diseño (clientes descargan PDFs sin login):

- `/api/cotizaciones/[id]/pdf` — usa `getCotizacion(id)` sin validar nada
- `/api/rodaje/[id]/pdf` — ídem con el rodaje
- `/api/rental/cotizaciones/[id]/pdf` — `obtenerRentalCotizacion(id)` sin validar (verificar si proxy.ts la protege con sesión; si la protege, solo añadir defensa en el handler y documentar)

La vista del cliente (`/cotizacion/[token]`) sí exige el token secreto. Pero el PDF se descarga **solo con el ID interno** (UUID): es una puerta de atrás que no pide la llave. Si las políticas RLS de Supabase no bloquean lecturas anónimas, cualquiera con un ID descarga el documento con precios y márgenes.

## Qué hacer

1. **El PDF de cotización exige token O sesión**: el handler `/api/cotizaciones/[id]/pdf` acepta `?token=<token>` y valida que coincida con el de esa cotización. Si en cambio hay sesión válida (descarga interna desde el dashboard), permitir sin token. Sin ninguna de las dos → 401.
2. **Actualizar TODOS los lugares que construyen ese link** para que incluyan el token: botón de descarga en `VistaClienteCotizacion` (vista pública — ahí el token ya está disponible), emails en `app/actions/*`, botones del dashboard (estos van con sesión, no necesitan token). Buscar con grep `'/pdf'`. **Verificar cada call-site uno por uno** — un botón olvidado = funcionalidad rota para el cliente.
3. Aplicar el mismo criterio a `/api/rodaje/[id]/pdf`: el viewer público `/rodaje/[id]/ver` usa el ID, no un token. Si la hoja de llamados se comparte por ese viewer, el PDF puede validar contra el mismo ID del rodaje compartido — analizar cómo se comparte hoy ANTES de decidir; si no hay forma de token sin romper el flujo actual, dejar esa ruta como está y documentar el riesgo en el reporte.
4. **NO tocar** la tabla `cotizaciones` ni los tokens existentes. Cero migraciones que alteren datos.

## Expiración de tokens — DESCARTADA por decisión del dueño (jun 2026)

Los links de cotización son permanentes a propósito: clientes los consultan meses después. No implementar `token_expires_at`. Si algún día se quiere, sería opt-in por cotización y con decisión explícita de Tomás. Solo dejar esta nota.

## Verificación obligatoria antes de cerrar

- Tomar una cotización real ya enviada, abrir su `/cotizacion/[token]` y descargar el PDF desde el botón → debe funcionar igual que antes.
- `curl` anónimo a `/api/cotizaciones/<id>/pdf` SIN token → 401.
- Descarga desde el dashboard con sesión → funciona.
- Pedir a Tomás confirmar las políticas RLS reales en Supabase (no están en el repo); incluir en el reporte un `curl` de prueba contra producción solo de LECTURA.

## Criterios de aceptación

- Sin token y sin sesión → 401. Con token correcto → PDF. Con sesión → PDF.
- Todos los call-sites actualizados (lista en el reporte).
- Ningún link existente de cliente deja de funcionar.
