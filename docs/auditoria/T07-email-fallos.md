# T07 — Registro de fallos de email

**Prioridad:** P2 · **Modelo:** Sonnet 4.6 · **Riesgo:** bajo

## Problema

Los correos se envían con `lib/email.ts` (nodemailer + Gmail SMTP). Varios call-sites tragan errores en silencio:

- `app/actions/rendiciones.ts` (~187–200, 219–225, 243–248): `catch { /* email no crítico */ }` — si Gmail falla, nadie se entera.
- `app/actions/rodaje.ts` (~560): recordatorios de citación — si falla el envío, solo `console.error`, y el colaborador no recibe nada sin que quede registro consultable.
- `lib/email.ts`: crea el transporter con `process.env.GMAIL_USER`/`GMAIL_APP_PASSWORD` sin validar que existan → error críptico en runtime.

## Qué hacer

1. **`lib/email.ts`**: en `sendEmail()`, validar al inicio que `GMAIL_USER` y `GMAIL_APP_PASSWORD` existen; si no, lanzar `Error('GMAIL_USER/GMAIL_APP_PASSWORD no configurados')`.
2. **Tabla de registro**: crear `email_log` (SQL en `sql/email_log.sql` + GRANTs según `sql/grants.sql`): `id, created_at, destinatario, asunto, contexto (text), estado ('enviado'|'fallido'), error (text)`. Solo lectura para admin.
3. En `sendEmail()` (o un wrapper `sendEmailLogged()`), registrar cada envío y cada fallo en `email_log` usando `createAdminClient()`. El log nunca debe romper el flujo (try-catch interno).
4. Mantener la semántica actual: los emails "no críticos" siguen sin abortar la operación, pero ahora el fallo queda registrado.
5. Opcional si es barato: vista simple en `/usuarios` o `/financiero` (solo admin) listando los últimos 50 registros de `email_log`. Si encarece la tarea, dejarlo anotado como pendiente.

## Criterios de aceptación

- Forzar un fallo (credencial inválida en `.env.local` local) → la operación principal (ej. aprobar gasto) se completa y aparece fila `fallido` en `email_log`.
- Envío exitoso → fila `enviado`.
- `npx tsc --noEmit` pasa.
