# Sistema de campaña secuencial — Casa Hiedra (diseño)

> Cómo escribimos los correos juntos y cómo se mandan solos, con baja fácil.
> Complementa [campana-correos.md](campana-correos.md) (el contenido). **Diseño, aún no código.**
> Estado: 🟢 decidido · 🟡 a decidir · ⚪ idea

El sistema tiene **dos mitades**:
- **Autoría** — dónde viven los correos, cómo los co-escribimos y versionamos.
- **Runtime** — cómo entra la gente, cómo se mandan solos, cómo se detienen.

---

## 1. Modelo de datos (tablas nuevas)

```
crm_secuencias            id · nombre · activa
crm_secuencia_correos     id · secuencia_id · posicion(1..16) · tipo('valor'|'venta')
                          · industria(null=universal) · asunto · cuerpo(con ‹huecos›)
                          · dias_espera (desde el correo anterior)
crm_inscripciones         id · prospecto_id · secuencia_id · industria
                          · estado('activa'|'pausada'|'completada'|'baja')
                          · posicion_actual · fecha_proximo_envio · fecha_baja · motivo_baja
```
- El **envío** se registra en `crm_interacciones` (tipo `correo`) — ya existe.
- **Baja global:** flag `no_contactar` en `prospectos` (+ tabla de supresión por email) → bloquea inscripción futura en CUALQUIER secuencia.

---

## 2. Inscripción — cómo entra la gente 🟡
La gente entra al funnel desde la **Bandeja** (leads-web / descubrir-marcas, todo
propuesto) → al aprobar un prospecto, se elige **secuencia + industria** y se crea
la `inscripcion` (posición 1, fecha_proximo = hoy). Probar metiendo lotes chicos.

---

## 3. Secuenciador (cron) — cómo se mandan solos 🟢 base existe
Cron diario (`/api/cron/crm-secuencia`). Por cada inscripción `activa` con
`fecha_proximo_envio <= hoy`:
1. Si el prospecto **respondió** o tiene `no_contactar` → pausar/baja, **no enviar**.
2. Render del correo `posicion_actual` (rellena ‹huecos› con datos del prospecto).
3. **Enviar** (Gmail SMTP) **o dejar borrador** según modo (§5).
4. Registrar `interaccion` · avanzar `posicion_actual` · `fecha_proximo = hoy + dias_espera` del siguiente.
5. Si era el último → `completada`.

**Auto-stop al responder** es la regla de oro (usa la ingesta de correos F4):
nadie sigue recibiendo drip después de contestar.

---

## 4. ⭐ Desuscripción fácil 🟢 (no negociable)
- **Footer en CADA correo** con link de baja: `app.casahiedra.com/baja/‹token›`.
- **1 click, sin login, sin preguntas.** El token (crypto.randomUUID, por prospecto) abre una página que confirma "Listo, no recibirás más correos" y setea `no_contactar=true` + `inscripciones → baja` (todas).
- **Global y permanente:** nunca más entra a ninguna secuencia (lista de supresión por email, también bloquea si re-aparece en leads-web).
- Es ruta pública nueva → token obligatorio (regla auditoría), sin exponer el ID.
- Razón: deliverability (Gmail penaliza sin opt-out claro) + ética + Ley 19.628.

---

## 5. Modo de automatización 🟡 — la decisión que falta
Dijiste "bastante automatizado". Dos modos:
- **(A) Auto-envío** — humano aprueba la **inscripción**; de ahí el cron envía solo. Más automático. *(Recomendado ahora, dado que quieres automatización — el gate humano queda en QUIÉN entra, no en cada correo.)*
- **(B) Auto-borrador** — el cron deja el correo redactado; Natalia/Tomás envían con 1 click. Más seguro para el primer lote.

**Sugerencia:** arrancar el **primer lote en B** (calentar dominio, validar plantillas) y migrar a **A** apenas las plantillas estén probadas. Plantillas siempre pre-aprobadas; lo único variable son los ‹huecos› de datos reales.

---

## 6. Deliverability (salud del dominio) ⚪
- Ritmo bajo al principio (ej. ≤20–30 correos/día) y subir gradual.
- SPF/DKIM/DMARC del dominio ok (verificar antes de empezar).
- Sin links raros ni imágenes pesadas en frío; texto principalmente.
- Auto-stop + baja fácil = lo que más cuida la reputación.

---

## 7. Autoría — escribir los correos juntos 🟡
- **Fuente de verdad:** un archivo estructurado en el repo (seed) que co-escribimos
  acá — un entry por correo (`posicion`, `tipo`, `industria`, `asunto`, `cuerpo`).
  Legible para ti, importable a `crm_secuencia_correos` con un script de seed.
- Iteramos en chat/repo → seed → DB. Versionado en git.
- ⚪ Más adelante: UI simple en `/crm` para que edites correos sin pasar por código.

---

## 8. Plan de construcción por fases
1. **Tablas + baja fácil** (la pieza crítica primero) + ruta pública `/baja/[token]`.
2. **Seed de autoría** + co-escribir los 16 correos (arco maestro) — [campana-correos.md](campana-correos.md).
3. **Secuenciador cron** en **modo B** (borrador) + inscripción desde Bandeja.
4. **Probar** metiendo un lote chico real, medir respuestas/bajas.
5. Variantes por industria + migrar a **modo A** por segmento.

---

### Decisiones para Tomás
- **Modo A o B** para arrancar (recomiendo B → A).
- Baja = **global y permanente** (recomendado) ¿ok?
- ¿Arrancamos construyendo la **fase 1** (tablas + baja fácil), o seguimos primero co-escribiendo los correos?
