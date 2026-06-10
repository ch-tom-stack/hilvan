# T01 — Validar rol admin en financiero.ts

**Prioridad:** P1 (seguridad) · **Modelo:** Sonnet 4.6 · **Riesgo:** bajo

## Problema

Las funciones de configuración financiera en `app/actions/financiero.ts` (líneas ~10–93: `getPPMTasa`, `setPPMTasa`, `getPreviredMensual`, `setPreviredMensual`, `getIUSCMensual`, `setIUSCMensual`, `getNomina`, `setNomina`) usan `createAdminClient()` (service role, bypassa RLS) **sin verificar sesión ni rol**. Cualquier usuario autenticado puede invocarlas como server action y leer/modificar nómina y tasas.

Nota: usan admin client porque `configuracion_financiero` no tiene SELECT policy (ver CLAUDE.md). Eso NO cambia — lo que falta es el check de autorización ANTES de usar el admin client.

## Patrón a seguir (ya existe en el repo)

`app/actions/usuarios.ts` líneas 32–42:

```typescript
const { data: { user } } = await supabase.auth.getUser()
const { data: self } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
if (self?.rol !== 'admin') return { error: 'Sin permisos' }
```

## Qué hacer

1. Crear un helper `requireRol(roles: string[])` en `app/actions/financiero.ts` (o en `lib/`, si prefieres reutilizarlo): obtiene el usuario con `await createClient()`, lee su `rol` de `profiles`, lanza `Error('Sin permisos')` si no está en `roles`.
2. Llamarlo al inicio de TODAS las funciones exportadas de `financiero.ts` que mutan datos, con `['admin', 'contabilidad']` (el módulo Financiero permite ambos roles según el sidebar). Para los setters de configuración (`setPPMTasa`, `setNomina`, etc.) usar solo `['admin']` salvo indicación contraria.
3. Revisar también `app/actions/inversiones.ts` y `app/actions/bundles.ts`: la auditoría detectó que tampoco validan sesión. Aplicar al menos el check de sesión (`user != null`) en toda función mutadora, y rol admin/contabilidad en inversiones.
4. No romper los componentes que llaman estas funciones: si hoy lanzan o devuelven datos, mantener la forma de retorno y lanzar `Error` con mensaje claro en caso de no autorización.

## Criterios de aceptación

- Ninguna función exportada de `financiero.ts` / `inversiones.ts` ejecuta queries antes de validar sesión+rol.
- `bundles.ts`: toda mutación exige sesión.
- `npx tsc --noEmit` pasa.
- Las vistas `/financiero/*` siguen funcionando para un admin (verificar manualmente o con preview).
