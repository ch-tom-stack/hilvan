# Agendamiento de reuniones — Manifiesto + pendientes (handoff al chat de la web)

**Fecha:** 2026-07-02 · Casa Hiedra

Contexto para el chat del **sitio web** (Casa Hiedra web). El agendamiento se
construyó **entero dentro de Hilván**; el sitio solo participa en el dominio, un
tema de facturación de Supabase, y (a futuro) La Lectura.

---

## 1. Qué se hizo (en Hilván — ya en producción)

Página pública de **agendamiento de reuniones estilo Calendly directo**, servida 100% por Hilván. URL final: **`reuniones.casahiedra.com`** (hoy vive en `app.casahiedra.com/reunion`).

- **Página** con marca Casa Hiedra (blanco/negro, rojo solo en el CTA, Schibsted Grotesk, nav Inicio/Productos/Archivo/La casa, logo). Layout de 2 columnas **sin scroll**.
- **Disponibilidad**: lun–vie, 10–13 y 15–18 (Santiago), 30 min, buffer 15, anticipación 24 h, horizonte 2 semanas. **Cupos por día** (mar/mié/jue 4–5, lun/vie 1–2) y el **primer lun/vie del rango va en 0**. Los horarios no ofrecidos se muestran **bloqueados** (sensación de escasez). Resta lo ocupado de Google Calendar.
- **Meet único por reunión** (Google Workspace + delegación de dominio; impersona `tomas@casahiedra.com`, crea el evento en el calendario secundario "Reuniones web" con su Meet propio).
- **Correos**: (1) al visitante, acuse + link a La Lectura; (2) interno a Tomás+Natalia con toda la info + botones **"Responder"** (deep-link de **Gmail compose** pre-cargado, no `mailto`) + link "Marcar como atendida". La respuesta personal se manda desde el correo propio de cada uno.
- **Bandeja "Reuniones web"** en Hilván (admin/productor) con estado atendida/pendiente (se marca con un token desde el correo interno).
- Todo **verificado end-to-end y desplegado**.

---

## 2. Pendientes que tocan al lado de la WEB / dominio

### 2.1 DNS — apuntar el subdominio (lo que gatilló este handoff)
`reuniones.casahiedra.com` debe apuntar al proyecto **Hilván** en Vercel.
1. **Vercel** (proyecto Hilván) → *Settings → Domains* → agregar `reuniones.casahiedra.com`.
2. **Cloudflare** (zona `casahiedra.com`) → *DNS → Records → Add record*:
   - Type **CNAME** · Name `reuniones` · Target `cname.vercel-dns.com` (o el valor que muestre Vercel)
   - **Proxy: DNS only** (nube **gris**, no naranja) — clave para el SSL de Vercel.
3. Vercel emite el SSL solo cuando propaga. El rewrite ya está hecho en Hilván: la **raíz** del subdominio sirve la página (no hay que escribir `/reunion`).

### 2.2 Supabase — Cached Egress excedido (importante)
La org de Supabase (Free) está en **188% de Cached Egress** (9.4/5 GB) — es **egress de Storage vía CDN**, y viene del **proyecto WEB**, no de Hilván (Hilván tiene DB en 6%, 2 MAU). Hay **grace period hasta el 3-ago-2026**; después, si sigue alto, las requests pueden devolver **402**.
- **Acción (lado web):** reducir el peso/servido de los assets de Storage (comprimir/resize imágenes, cachear, revisar si algo los re-sirve en loop), **o** subir la org a **Pro (~US$25/mes)** que da 250 GB.

### 2.3 La Lectura (opcional / futuro)
- El correo del agendamiento linkea a **`casahiedra.com/lectura`** (env `REUNIONES_LECTURA_URL` en Hilván, hoy con ese valor).
- Idea futura (no bloquea): La Lectura, al completarse, hoy **manda un PDF a Casa Hiedra**. Si se quiere que **Hilván** se entere (para un motor de "próxima acción"), La Lectura tendría que **avisarle a Hilván** con un ping/webhook. Integración chica a definir cuando se quiera.

### 2.4 Nav (menor)
- La página `/reunion` **recrea** el nav del sitio (Inicio/Productos/Archivo/La casa → `casahiedra.com`) porque no comparte el CSS/`TransitionLink` del sitio. Si el nav del sitio cambia, avisar para sincronizarlo.

---

## 3. Estado de lanzamiento
Todo lo de Hilván está **listo y en prod**. Env `REUNIONES_CALENDAR_ID` puesto en Vercel, calendario "Reuniones web" compartido con el service account, migraciones corridas, delegación de dominio verificada. **Falta solo el DNS (2.1)** para que `reuniones.casahiedra.com` esté vivo.
