# Calendario (CH-8) — cómo funciona y cómo conectar la web para agendar reuniones

**Fecha:** 2026-07-02 · Casa Hiedra · Hilván

Este documento explica (1) cómo funciona hoy el módulo de Calendario y (2) qué se necesita para que desde la **página web pública** alguien pueda **agendar una reunión** con Casa Hiedra.

---

## 1. Resumen en una línea

Hoy el calendario es un **espejo de solo importación**: trae los eventos de Google Calendar a Hilván para verlos y clasificarlos (rodaje / reunión / ignorar). **Ya existe** la capacidad de **crear** eventos en Google Calendar (se usa al aprobar arriendos de Rental), así que el agendamiento desde la web es un paso incremental, no partir de cero.

---

## 2. Cómo funciona hoy

### 2.1 Conexión con Google Calendar — `lib/google-calendar.ts`

- **Autenticación:** una **service account** de Google (su JSON completo vive en la env `GOOGLE_SERVICE_ACCOUNT_KEY`). No usa la cuenta personal de nadie.
- **Scope:** `https://www.googleapis.com/auth/calendar` → **lectura *y* escritura** (ya tenemos permiso para crear eventos).
- **Calendario objetivo:** `GOOGLE_CALENDAR_ID` = `estudiocasahiedra@gmail.com`.
- **Funciones que expone:**
  - `getCalendarClient()` — cliente autenticado v3.
  - `listarEventosGCal(fechaMin, fechaMax)` — lista eventos de un rango (máx 500). *(Lectura.)*
  - `crearEventoGCal(titulo, inicio, fin, descripcion?)` — **inserta un evento** en el calendario, con zona horaria `America/Santiago`. *(Escritura — ya en uso.)*

### 2.2 El sync (importación) — `app/api/cron/sync-gcal/route.ts`

- **Dirección:** **una sola vía**, Google Calendar → Hilván. Hilván **no** modifica el calendario en este flujo (solo lee e importa).
- **Qué hace:** trae los eventos del rango **−30 días a +90 días** y los **upsertea** en la tabla `eventos_calendario`, deduplicando por `google_event_id` (si cambia el título/fecha, se actualiza).
- **Cuándo:** cron de Vercel **`0 8 * * *`** (8:00 AM diario). Protegido por `Authorization: Bearer ${CRON_SECRET}`.

### 2.3 La tabla `eventos_calendario` — `sql/calendario.sql`

| Columna | Notas |
|---|---|
| `id` | UUID PK |
| `google_event_id` | UNIQUE — clave de dedup |
| `titulo`, `descripcion` | del evento GCal |
| `fecha_inicio`, `fecha_fin` | timestamptz |
| `todo_el_dia` | bool |
| `clasificacion` | `sin_clasificar` \| `rodaje` \| `reunion` \| `ignorar` |
| `rodaje_id` | FK opcional a rodajes |
| `clasificado_por` | FK a profiles |

### 2.4 La UI — `app/(dashboard)/calendario/`

- **FullCalendar v6** (dynamic import, sin SSR) muestra rodajes + eventos de GCal (menos los "ignorar"), coloreados por clasificación.
- **InboxGCal**: bandeja para que **admin/productor** clasifiquen manualmente los `sin_clasificar`.
- **No se crean eventos desde esta pantalla** — solo se ven y clasifican los importados.

### 2.5 Escritura a Google Calendar — **ya existe**

`crearEventoGCal()` se invoca hoy al **aprobar una reserva de Rental** (`app/actions/rental.ts`): crea un evento `[RENTAL] Equipo · Cliente` en el rango de la reserva. **Esta es exactamente la pieza que reutiliza el agendamiento web.**

### 2.6 Variables de entorno

```
GOOGLE_SERVICE_ACCOUNT_EMAIL   hilvan-calendar@hilvan-casahiedra.iam.gserviceaccount.com
GOOGLE_CALENDAR_ID              estudiocasahiedra@gmail.com
GOOGLE_SERVICE_ACCOUNT_KEY      JSON completo de la service account
CRON_SECRET                     autoriza /api/cron/sync-gcal
```

---

## 3. El objetivo: agendar reuniones desde la web

**Meta:** que un visitante de la web de Casa Hiedra pida/agende una reunión, y que eso aparezca en el Google Calendar de estudio (y, por el sync, dentro de Hilván como `reunion`).

### 3.1 Buena noticia

- **Crear el evento en GCal ya está resuelto** (`crearEventoGCal`).
- **El bucle se cierra solo:** una reunión creada en `estudiocasahiedra@gmail.com` la importa el sync diario a Hilván como evento `sin_clasificar` → se clasifica `reunion`. (Se puede afinar para que entre ya clasificada.)

### 3.2 Arquitectura propuesta

La web ("Casa Hiedra - Web") es un **proyecto aparte**; las credenciales de Google viven en **Hilván**. Entonces:

```
Formulario en la web  →  endpoint público en Hilván  →  crearEventoGCal()  →  Google Calendar
                                                     →  email de confirmación (sendEmail)
                                                     →  (sync diario lo trae a Hilván)
```

Piezas a construir en Hilván:

1. **Endpoint público** `POST /api/agendar-reunion` (agregar a las rutas públicas de `proxy.ts`). Recibe: nombre, email, teléfono, motivo, y el slot elegido.
2. **Disponibilidad** — nueva función en `lib/google-calendar.ts` (ej. `slotsDisponibles(desde, hasta)`) que consulte los eventos existentes (o `freebusy`) y devuelva los huecos libres según reglas nuestras (días/horas hábiles, duración fija, buffer).
3. **Confirmación por email** — reusar `sendEmail()` (`lib/email.ts`) para avisar al visitante y a un responsable de Casa Hiedra.
4. **(Opcional) tabla `reuniones_web`** para trackear las solicitudes (estado, quién, contacto) independiente de GCal.

En la web solo va un **formulario/calendario** que llama a ese endpoint (no necesita credenciales de Google; las tiene Hilván).

### 3.3 Decisiones que hay que tomar antes de construir

1. **¿Agendamiento directo o solicitud con aprobación?**
   - *Directo:* el visitante elige un hueco libre y queda agendado al instante (estilo Calendly). Más cómodo, pero **un endpoint público que crea eventos es abusable** → necesita protección (captcha, rate-limit, y acotar a slots válidos).
   - *Solicitud:* el visitante "pide" una reunión; ustedes la confirman desde Hilván y ahí se crea el evento. Más control, menos riesgo de spam. **Recomendado para empezar.**
2. **Reglas de disponibilidad:** ¿qué días/horas se pueden reservar? ¿duración (30/60 min)? ¿buffer entre reuniones? ¿anticipación mínima?
3. **¿En qué calendario caen?** Por defecto `estudiocasahiedra@gmail.com` (el que ya se sincroniza). Se puede filtrar por un color/etiqueta para distinguir las "reuniones web".
4. **¿Invitación de Google + Meet al visitante?** Ojo técnico: **una service account no envía invitaciones ni agrega invitados** sin *domain-wide delegation* configurada. Lo más simple para v1 es **no** agregar al visitante como "invitado" de GCal y en su lugar **mandarle nuestro propio email de confirmación** (con el link de Meet si se genera aparte). Si se quiere la invitación nativa de Google + Meet automático, hay que configurar delegación de dominio.

### 3.4 Consideraciones importantes

- **Anti-abuso (crítico):** el endpoint es público y escribe en el calendario real. Mínimo: validar payload, rate-limit por IP, y —si es directo— captcha + solo permitir slots que el propio backend calcule como libres (nunca confiar en fecha/hora arbitraria del cliente).
- **Zona horaria:** todo en `America/Santiago` (como ya hace `crearEventoGCal`). Cuidado si el visitante está en otra zona.
- **Doble-booking:** calcular disponibilidad y crear el evento deben ser lo más atómicos posible (dos personas pidiendo el mismo hueco a la vez).

---

## 4. Recomendación / próximos pasos

**Empezar por el modelo "solicitud con aprobación"** (menor riesgo, control humano):

1. Formulario en la web → `POST /api/agendar-reunion` (público, con validación + rate-limit).
2. Guarda la solicitud (tabla `reuniones_web`) + email a Casa Hiedra ("nueva solicitud de reunión de X").
3. Desde Hilván (o un email con link), un productor **aprueba** → se llama `crearEventoGCal()` y se manda la confirmación al visitante.
4. El sync diario ya la muestra en el calendario de Hilván como `reunion`.

Si más adelante quieren el agendamiento **directo** estilo Calendly, se agrega la función de disponibilidad (`slotsDisponibles`) + captcha y se salta el paso de aprobación.

> Todo lo pesado (auth con Google, crear eventos, emails, sync) **ya existe** en Hilván. El trabajo real es: el endpoint público, las reglas de disponibilidad, la protección anti-abuso, y el formulario en la web.
