# T03 — Validar propiedad al subir contrato firmado

**Prioridad:** P1 (seguridad) · **Modelo:** Sonnet 4.6 · **Riesgo:** bajo

## Problema

`app/api/contratos/subir-firmado/route.ts` recibe `file`, `contrato_id` y `colaborador_id` y:

1. No verifica que haya sesión (el middleware `proxy.ts` la exige para rutas no listadas como públicas — confirmarlo — pero el handler debe defenderse solo).
2. No verifica que `contrato_id` pertenezca a `colaborador_id` — cualquier usuario logueado puede sobrescribir el contrato firmado de cualquier colaborador (el upload usa `upsert: true`).
3. No valida tipo ni tamaño de archivo.

## Qué hacer

1. Al inicio del handler: `const { data: { user } } = await supabase.auth.getUser(); if (!user) return 401`.
2. Consultar `contratos_generados` por `id = contratoId` y verificar que su `colaborador_id` coincide con el recibido; si no, 403. Usar el cliente con sesión (`createClient()`), no admin.
3. Validar archivo: extensión/MIME permitidos (`pdf`, `jpg`, `jpeg`, `png`) y tamaño máximo 15 MB → 400/413 si no cumple.
4. Revisar quién llama este endpoint (grep `subir-firmado`) — probablemente `FichaColaborador.tsx` — y verificar que sigue funcionando.

## Criterios de aceptación

- Sin sesión → 401. Contrato de otro colaborador → 403. Archivo .exe o >15 MB → rechazado.
- El flujo normal de subir contrato firmado desde la ficha del colaborador sigue funcionando.
- `npx tsc --noEmit` pasa.
