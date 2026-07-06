# Agendamiento de reuniones — Manifiesto + pendientes (handoff al chat de la web)

**Fecha:** 2026-07-02 · Casa Hiedra

Documento **autocontenido** para el chat del **sitio web** (Casa Hiedra web). El
agendamiento se construyó **entero dentro de Hilván**; el sitio participa solo en:
el **dominio** (DNS), un **enlace** desde el sitio, un tema de **facturación de
Supabase**, y (a futuro) **La Lectura**. No hay que construir el agendamiento en el
sitio: ya existe y está en producción.

---

## 0. Arquitectura — qué vive dónde (leer primero)

- **Todo el agendamiento vive en Hilván** (Next.js en Vercel, proyecto `app.casahiedra.com`). El repo del **sitio web NO tiene** nada del agendamiento.
- **Flujo completo:**
  1. El visitante entra a **`reuniones.casahiedra.com`** (un subdominio que apunta al proyecto Hilván en Vercel).
  2. Elige un horario libre y deja sus datos → `POST` a Hilván `/api/reunion`.
  3. Hilván crea el evento en **Google Calendar** (calendario de Workspace "Reuniones web", con **Meet único**), lo guarda en **Supabase** (tabla `reuniones_web`) y manda los correos.
  4. Tomás/Natalia responden desde su Gmail (botón pre-cargado en el correo interno) y marcan "atendida" con un clic.
- **El sitio web aporta 4 cosas:** (1) el DNS del subdominio, (2) un enlace/CTA hacia el agendamiento, (3) resolver el sobreuso de Supabase (es del proyecto web), (4) a futuro, avisar cuando alguien completa La Lectura.

> **Nombre del subdominio:** quedó cableado como **`reuniones.casahiedra.com`**. Si se prefiere `agenda.casahiedra.com` u otro, es un cambio de una línea en Hilván (`proxy.ts`) — pedirlo en el chat de Hilván.

---

## 1. DNS — apuntar el subdominio (bloquea el lanzamiento)

`reuniones.casahiedra.com` debe apuntar al proyecto **Hilván** en Vercel. Que sea un subdominio nuevo **no choca** con el sitio principal `casahiedra.com` (esté en Vercel, Wix o donde sea) — los subdominios son independientes.

1. **Vercel** (proyecto **Hilván**, no el del sitio) → *Settings → Domains* → agregar `reuniones.casahiedra.com`. Vercel mostrará el registro DNS exacto que espera.
2. **Cloudflare** (zona `casahiedra.com`) → *DNS → Records → Add record*:
   - **Type:** `CNAME`
   - **Name:** `reuniones`
   - **Target:** `cname.vercel-dns.com` (o el valor que muestre Vercel)
   - **Proxy status: DNS only** → nube **gris**, NO naranja. ⚠️ Con nube naranja (proxied) Vercel no emite bien el SSL y puede dar loops. Si ya quedó naranja y falla, el fix es cambiar a gris.
   - **TTL:** Auto.
3. Propaga en minutos–~2 h; Vercel muestra **"Valid Configuration"** y emite el **SSL** solo.
4. **Ya resuelto en Hilván:** la **raíz** del subdominio sirve la página (rewrite en `proxy.ts`), no hay que escribir `/reunion`.

---

## 2. Enlace desde el sitio hacia el agendamiento (tarea del sitio)

Hoy la página existe pero **nada en el sitio la enlaza**. Agregar un CTA/enlace visible (ej. en el nav o en un "Hablemos/Agenda una reunión") apuntando a **`https://reuniones.casahiedra.com`**. Sin esto, nadie llega salvo con el link directo.

---

## 3. Supabase — Cached Egress excedido (importante, con fecha límite)

La organización de Supabase (**Free plan**) está en **188% de Cached Egress** (**9.4 / 5 GB**). Es **egress de Storage servido por CDN**, y por descarte viene del **proyecto WEB**, no de Hilván (Hilván: DB al 6%, 2 MAU, egress normal 23%).

- **Consecuencia:** hay **grace period hasta el 3-ago-2026**. Después, si el uso sigue sobre la cuota, aplica Fair Use y las requests pueden devolver **HTTP 402** (proyectos restringidos).
- **Diagnóstico sugerido (lado web):** revisar en el proyecto web de Supabase *Storage* → qué buckets/archivos son pesados y cuáles son **públicos** (los públicos se sirven por CDN = cached egress); ver si hay imágenes grandes sin comprimir, hotlinking, o algo que las re-sirva mucho.
- **Opciones:** (a) **optimizar** — comprimir/resize imágenes, cachear, restringir buckets públicos que no lo necesiten; o (b) **subir la org a Pro (~US$25/mes)** → 250 GB de cached egress (para un negocio en producción suele ser lo pragmático).
- **Ojo:** la org es compartida (`ch-tom-stack's Org`); subir a Pro cubre también a Hilván.

---

## 4. La Lectura (futuro, no bloquea el lanzamiento)

- El **Correo 1** del agendamiento linkea a **`https://casahiedra.com/lectura`** (configurable en Hilván con env `REUNIONES_LECTURA_URL`, hoy con ese valor). Si la URL real de La Lectura es otra, avisar al chat de Hilván.
- **Idea futura** ("siempre hay una próxima acción"): hoy La Lectura, al completarse, **manda un PDF a Casa Hiedra**. Si se quiere que **Hilván se entere** (para encadenar la siguiente acción del solicitante), La Lectura (sitio) tendría que **avisarle a Hilván** con un webhook — ej. `POST https://app.casahiedra.com/api/lectura-completada` con `{ email }`, y Hilván marca esa reunión. Es una integración chica a diseñar cuando se quiera; **no** es requisito para lanzar.

---

## 5. Nav (menor)

La página `/reunion` **recrea** el nav del sitio (Inicio / Productos / Archivo / La casa → `casahiedra.com`) porque no comparte el CSS ni el `TransitionLink` del sitio (viven en el repo web). Si el nav del sitio cambia (links/labels), avisar al chat de Hilván para sincronizarlo.

---

## 6. Estado de lanzamiento (checklist)

**Hecho (Hilván, en prod):**
- ✅ Página, disponibilidad (cupos por día + escasez), reserva (anti-abuso), bandeja.
- ✅ **Meet único** por reunión (Workspace + delegación de dominio, verificado).
- ✅ Correos (acuse + interno con botones Gmail-compose + confirmar por token).
- ✅ Env `REUNIONES_CALENDAR_ID` en Vercel; calendario "Reuniones web" compartido con el service account; migraciones corridas; rewrite del subdominio.

**Falta (lado web/dominio):**
- ⏳ **DNS** del subdominio (sección 1) — único bloqueante para lanzar.
- ⏳ **Enlace** desde el sitio (sección 2).
- ⏳ **Cached Egress** de Supabase (sección 3) — antes del 3-ago-2026.
- 🔵 La Lectura webhook (sección 4) — opcional/futuro.

---

## 7. Datos técnicos de referencia

- Subdominio: `reuniones.casahiedra.com` → proyecto **Hilván** en Vercel.
- Cloudflare CNAME: `reuniones` → `cname.vercel-dns.com`, **DNS only**.
- Google Calendar de reuniones: calendario secundario "Reuniones web" bajo `tomas@casahiedra.com` (gratis, no es un usuario nuevo). ID en env `REUNIONES_CALENDAR_ID` de Hilván.
- Service account: `hilvan-calendar@hilvan-casahiedra.iam.gserviceaccount.com` (client_id `109396074919355664608`, con delegación de dominio para el scope calendar).
- El calendario general del estudio (`estudiocasahiedra@gmail.com`) **no se tocó** — sigue para el sync general.
- Deadline Supabase: **3-ago-2026**.
