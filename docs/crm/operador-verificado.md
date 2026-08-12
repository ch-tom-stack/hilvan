# Operador de CRM — Contexto exhaustivo
### Estado, correos reales, comportamiento de herramientas, límites y sugerencias

**Verificado en vivo:** 6-ago-2026 · complementa (y corrige) el documento de
traspaso [`operador-contexto.md`](operador-contexto.md).
**Pendiente declarado:** sesión de tono con Tomás; sus conclusiones se sumarán a
esta nota como contexto permanente del operador.

---

## 1. Estado del CRM (verificado, no de memoria)

- **31 prospectos** (30 + Human Mob, ingresado en el piloto).
- Por etapa antes del piloto: prospecto 10 · **conversación 19** · confirmado 1 (Somos MODO). Tras el piloto: Reebok pasó a `contacto` (evidencia: 0 respuestas).
- Responsables: Simón 11 · Natalia 18 · 1 sin asignar ("Home"). El "18 sin responsable" del traspaso ya estaba corregido.
- Concentración Falabella: 0% del pipeline (KPI de diversificación en verde).
- Interacciones registradas en toda la base: ~1 antes del piloto; +2 del piloto (Reebok, Human Mob). La Biblioteca de contactos sigue siendo ruido — no fundamentar metas con ella.
- Tablero **inflado confirmado**: de los 14 envíos del 4-ago, ninguno tiene respuesta; 8 de esas marcas figuraban en "Conversación".

### Piloto ejecutado (reversible con `hilvan_deshacer`)
| Acción | Resultado |
|---|---|
| Reebok: verificación `from:reebok.com` | 0 respuestas → mal clasificado confirmado |
| Reebok → `contacto` + toque registrado (4-ago, Simón) | ✓ lleva **1 contacto** |
| Human Mob: creado (`contacto`, lookbook, resp. Simón) + toque (4-ago) | ✓ lleva **1 contacto** |
| Borradores de siguiente correo (valor, sin venta) en ambas fichas | ✓ `crm_borradores` |

> Matiz aplicado: el retroceso de Reebok fue **directo por instrucción de Tomás**
> (piloto). En la corrida masiva, los retrocesos van **a la Bandeja** con
> evidencia, según la asimetría del traspaso.

---

## 2. Quién envía qué — corrección importante al traspaso

| Emisor | Dirección real | Cómo llega a Tomás | Cobertura |
|---|---|---|---|
| **Simón** | `estudiocasahiedra@gmail.com` (cuenta compartida, firma "Simón" en el cuerpo) | **Reenvío** a `tomasmontealegrem@gmail.com` (bloque *Forwarded*) | 14 envíos del 4-ago + UC (27-jul) — confirmado por Tomás: "los reenviados hoy son de Simón" |
| **Natalia** | **`natalia@casahiedra.com`** (dirección propia — el traspaso asumía que todo salía de estudiocasahiedra: **falso**) | **NO se reenvía**: existe como export .eml en `~/Documents/correos` | ~27 marcas (jul–ago), mayoría "Banco de videos para X" |
| Resto | mixed batch (dice Tomás) | — | por atribuir caso a caso |

**PROTOCOLO NUEVO (7-ago-2026):** Natalia **también reenvía** a
`tomasmontealegrem@gmail.com`, igual que la cuenta de Simón. El punto ciego se
cierra por proceso, no por herramienta.

Consecuencia para la rutina A — **dos búsquedas, no una**:

| Periodo | Fuente |
|---|---|
| **De ahora en adelante** | `from:estudiocasahiedra@gmail.com` (Simón) **+** `from:natalia@casahiedra.com` (Nati). Ambos llegan como reenvío con bloque *Forwarded*. |
| **Histórico de Nati (jul–ago)** | carpeta `~/Documents/correos` — 40 .eml, anteriores al protocolo. Se procesa **una sola vez**. |

Si aparece un tercer remitente, agregarlo a la lista en vez de asumir que el
barrido está completo.

### Universo detectado en la reconciliación (aún sin escribir, salvo el piloto)
- **Existentes contactados sin toque registrado:** Treino, Ellesse, Froens, Street Machine, Monster, Total Tools, UC (Simón) · Kuy-Kuy, Leal & Morris, La Araucana, Kitchen Center, Desigual (Nati). [Reebok ya hecho]
- **Contactados que NO están en el CRM (~26):** Silk Perfumes, Elite Perfumes, Natura, Tienda Voce, Varsovienne (Simón) · Dual Slow Fashion, Buffalo, Sportlife, Mercado Vitamina, APL Logistics, Sky Airline, Kinegun, USS, DUOC UC, Fundamenta, AIEP, Coopeuch, Electrolux, Aramark, EHS Apryma, Enko, Plaza S.A., Virtex/Ilko, Aramco, Ko Andina, TI Chile (Nati). [Human Mob ya hecho]
- **"Lead landing" (.eml) son entrantes de La Lectura**, ya en CRM — no confundir con salientes.

---

## 3. Textos reales de los correos (base para la sesión de tono)

### 3.1 Natalia — Lookbook (Kuy-Kuy, 5-ago-2026, a dralorenasalazar@gmail.com)
> Buen día, Lorena! ¿Cómo estás?
>
> Mi nombre es Natalia Roa y soy productora en Casa Hiedra, una productora audiovisual enfocada en contenidos para medios y publicidad. La moda es nuestra especialidad y nos encantaría conversar con ustedes para explorar la posibilidad de trabajar juntos en un lookbook.
>
> Un lookbook es un conjunto de imágenes y videos producidos en una o pocas jornadas, diseñados para durar y adaptarse. Pensado para Kuy-Kuy, eso podría traducirse en clips de las prendas en movimiento, modelos posando, macros de las fibras de alpaca y del tejido artesanal, y looks completos. Todo pensado para tener recursos listos para usar en redes sociales, tienda online y lanzamientos de colección, sin depender de una producción nueva cada vez que lancen piezas nuevas.
>
> Todo esto se entrega en alta calidad y con colorización básica, y siempre lo ajustamos a las necesidades reales de cada cliente. Te invito a ver este video donde Tomás, nuestro director, explica el concepto con ejemplos concretos.
>
> Ya hemos producido el lookbook de Falabella, Aldo, Wrangler y Lee. Nos encantaría conocerte y analizar qué podemos hacer por Kuy-Kuy.
>
> ¿Te parece agendar una reunión para conversar? Quedo atenta.
> Saludos,
> **Natalia Roa** · *Productora | Casa Hiedra*

### 3.2 Natalia — Banco de videos (Kitchen Center, 6-jul-2026, a mfonseca@kitchencenter.cl)
> Buen día, Macarena! ¿Cómo estás?
>
> Mi nombre es Natalia Roa y soy productora en Casa Hiedra, una productora audiovisual enfocada en contenidos para medios y publicidad. Este año hemos desarrollado bancos de videos para marcas de electrodomésticos y nos ha encantado este tipo de proyectos! Te escribo porque me gustaría explorar la posibilidad de trabajar con Kitchen Center en estos contenidos.
>
> Un banco de videos es exactamente lo que suena: un conjunto de imágenes y videos producidos en una o pocas jornadas, diseñados para durar y adaptarse. Para una empresa como Kitchen Center, eso podría traducirse en tomas como: equipos funcionando, detalles que destaquen su calidad, tutoriales para distintos modos de uso, etc. Todo pensado para tener recursos listos para usar en comunicación a distribuidores, redes sociales y campañas de temporada, sin depender de una producción nueva cada vez que lo necesiten.
>
> Adjunto una cotización tipo que consiste en 90 fotos + 30 videos — el promedio con el que trabajamos. Todo se entrega en alta calidad y con colorización básica, y siempre lo ajustamos a las necesidades reales de cada cliente. Los invito también a ver este video donde Tomás, nuestro director, explica el concepto con ejemplos concretos.
>
> ¿Te parece agendar una reunión la prox. semana para conversar? Quedo atenta.
> Saludos,
> **Natalia Roa** · *Productora | Casa Hiedra*

### 3.3 Simón — Lookbook (Human Mob, 4-ago-2026, a humanmob.cl@gmail.com, desde estudiocasahiedra)
> Buen día! ¿Cómo están?
>
> Mi nombre es Simón y soy parte del equipo de Casa Hiedra, una productora audiovisual enfocada en contenidos para medios y publicidad. Los encontré investigando marcas del rubro y me pareció que había una conversación interesante que tener.
>
> La moda es nuestra especialidad y nos encantaría explorar la posibilidad de trabajar juntos en un lookbook. Para Human Mob, eso podría traducirse en prendas boxy fit en movimiento, looks completos en locaciones urbanas con carácter, detalle de texturas y acabados, y contenido por drop listo para usar en redes sociales y tienda online.
>
> Todo se entrega en alta calidad y con colorización básica. Te invito a ver este video donde Tomás, nuestro director, explica el concepto con ejemplos concretos.
>
> Ya hemos producido el lookbook de Falabella, Aldo, Wrangler y Lee. Nos encantaría conocerlos y analizar qué podemos hacer por Human Mob.
>
> ¿Les parece agendar una reunión para conversar? Quedo atento.
> ¡Saludos! **Simón** · Casa Hiedra

### 3.4 Observaciones de tono (insumo para la sesión pendiente)
- Ambos usan la **misma plantilla**: saludo con nombre → presentación personal → definición del producto → traducción a la marca específica ("para X, eso podría traducirse en…") → video de Tomás → credenciales (Falabella, Aldo, Wrangler, Lee) → CTA de reunión.
- La **personalización real** está en un solo párrafo (el de "podría traducirse en"): fibras de alpaca (Kuy-Kuy), boxy fit/locaciones urbanas (Human Mob), tutoriales de equipos (Kitchen Center). Es el corazón del correo.
- Diferencias: Nati firma con cargo y adjunta cotización tipo en bancos de video; Simón agrega el origen del contacto ("los encontré investigando marcas del rubro").
- Todos los correos son **de venta con CTA de reunión** — la regla del traspaso (3 de valor por 1 de venta) todavía no se practica. Los borradores que dejé en el piloto (Reebok, Human Mob) son los primeros "de valor" puros; revisar su tono contra lo que se defina en la sesión.

---

## 4. Comportamiento de las herramientas (observado en uso real)

### 4.1 CRM (Hilván MCP) — todas en línea al 6-ago
| Herramienta | Comportamiento observado / quirks |
|---|---|
| `hilvan_pipeline` | Devuelve conteo por etapa + lista completa con id, empresa, etapa, score, origen, responsable. Base de todo barrido. |
| `hilvan_metricas_crm` | KPI Falabella + conteos. Sin params. |
| `hilvan_biblioteca_contactos` | Solo lectura; con ~3 interacciones sus promedios son ruido — no usar para metas. |
| `hilvan_buscar_prospecto` | Busca por empresa/contacto/email. |
| `hilvan_registrar_interaccion` | Toques NUESTROS. Acepta fecha pasada (clave para backfill), tipo, resumen, `gmail_thread` (trazabilidad al hilo) y próximo paso. |
| `hilvan_registrar_respuesta` | Mensajes RECIBIDOS. No corre la escalera; marca respondido el mensaje al que contesta. Guardar el cuerpo importa: ahí está la objeción. |
| `hilvan_bitacora` | La conversación por líneas, con `direccion` y `quien`. Sin ella no se distingue "le escribimos 3 veces" de "nos escribieron 3 veces". |
| `hilvan_contactos_listar` | El árbol de la marca con sus `contacto_id` + las líneas abiertas sin contacto. Llámala ANTES de crear, para no duplicar. |
| `hilvan_contacto_crear` | Nombre o email mínimo. Rechaza correo repetido en la misma marca. `fuente` = de dónde salió el dato. Ancla solo si hay una línea abierta sin contacto. |
| `hilvan_contacto_editar` | Corrige sin perder la conversación colgada del contacto. |
| `hilvan_notas_leer` | Las notas sueltas + el dossier de La Lectura. Reemplazan al campo `prospectos.notas`, que quedó vacío. Léelas antes de redactar. |
| `hilvan_nota_escribir` | Una nota por tema. `bloqueada: true` la congela como registro: no se edita después, sólo se borra. |
| `hilvan_nota_editar` | Corrige lo que escribiste mal, en vez de dejar dos notas del mismo tema. No sirve para bloqueadas. |
| `hilvan_nota_borrar` | Borra, incluidas las bloqueadas: el candado impide editar, no borrar. La nota entera queda en la auditoría. |
| `hilvan_hilo` | Abrir una línea cierra la vigente y reinicia la cadencia. Para contraparte nueva o marca retomada tras meses. |
| `hilvan_editar_interaccion` | Corrige lo ya registrado. Poner `gmail_thread` en las cargadas a mano evita que el cotejo las duplique en cada corrida. |
| `hilvan_solicitar_asignacion` | Deja una propuesta en la Bandeja; no reasigna. `para` = email, falla si no calza. |
| `hilvan_mover_etapa` | Directo, sin validar evidencia — la disciplina es del operador. Etapas: prospecto→contacto→conversacion→confirmado, + en_frio/nurture/descartado. `confirmado` dispara handoff a cotización: NUNCA por inferencia. |
| `hilvan_crear_prospecto` | `como_propuesta=true` deja en Bandeja (regla general); directo solo con evidencia exacta (criterio confirmado por Tomás). Acepta etapa inicial ≠ prospecto. |
| `hilvan_borrador_escribir/leer` | Escribe en `crm_borradores`; **no envía nunca**. Estados borrador/listo/enviado. |
| `hilvan_listar_aprobaciones` / `resolver_aprobacion` | Bandeja: aprobar APLICA el cambio; el humano decide. 37 entradas históricas, mayoría descartadas. |
| `hilvan_proximos_seguimientos` | La agenda: pendientes hoy + los que vencen en `dias`, por orden de prioridad. Mismo motor que el digest, así que coinciden. Es la fuente para la rutina B. |
| `hilvan_derivar_brief_cotizacion` | Deja PROPUESTA de brief en Bandeja; nunca deriva solo. |
| `hilvan_registrar_lectura` | Vincula dossier; avanza a lectura_entregada; heurística feed→banco, temporadas→lookbook. |
| `hilvan_deshacer` | Revierte cualquier escritura del agente por accion_id (log de auditoría). Red de seguridad de todo el flujo. |
| `hilvan_buscar_leads_web` / `descubrir_marcas` | Captación: **apagada por decisión** hasta que suba el promedio de contactos. |
| ⚠️ `hilvan_correo_pendientes` | NO es de correos del CRM: clasifica documentos tributarios. No usar aquí. |

### 4.2 Gmail (MCP)
- `search_threads`: sintaxis Gmail completa. `from:estudiocasahiedra@gmail.com` → 16 hilos (14 prospectos + 1 Fundamenta directo + 1 calendario). `from:<dominio del prospecto>` vacío = sin respuesta (evidencia negativa, confirmar antes de retroceder). Los **snippets ya traen el bloque Forwarded parseable** (destinatario/asunto/fecha reales) — muchas veces no hace falta abrir el cuerpo.
- `get_thread` / `get_message` FULL_CONTENT: pueden **desbordar el límite de tokens** (hilos con HTML acumulado: 4,9M chars el de Falabella). El overflow se guarda en un archivo host que el sandbox bash NO ve y que Grep lee mal (JSON en una línea). Mitigación: usar snippets, MINIMAL, o pedir hilos chicos.
- **La fecha del mensaje reenviado es la del reenvío**, no la del envío real — usar siempre la del bloque Forwarded (formato español: "mar, 4 ago 2026 a la(s) 2:11 p.m.").
- Alcance: solo direcciones ya vinculadas al CRM o a la actividad del equipo. **Nunca barrido general** — es el correo personal de Tomás.

### 4.3 Carpeta local `~/Documents/correos` (montada)
- .eml de Nati: cabeceras limpias (`From: Natalia Roa <natalia@casahiedra.com>`, `To:`, `Date:` reales) + cuerpo quoted-printable → parseables al 100% con Python (`email` stdlib) en el sandbox. Evidencia de mejor calidad que los reenvíos.
- También contiene: entrantes de La Lectura ("Lead landing", "Tu lectura"), PDFs de cotizaciones (CH-COT-014, paquetes) y blobs `noname`.

---

## 5. Límites del operador — MCP vs manipulación directa (web)

**Lo que hago por MCP (mi vía de escritura):** registrar interacciones, mover
etapas, crear prospectos/propuestas, escribir borradores, resolver aprobaciones
(solo con orden explícita de Tomás), deshacer. Todo queda en log de auditoría y
es reversible.

**Lo que NO hago, aunque la web lo permita:**
- **Enviar correos.** Por ningún camino (ni Gmail MCP —que además no tiene send—, ni la web). Los borradores viven en `crm_borradores` y los envía un humano.
- **Aprobar/descartar en la Bandeja por iniciativa propia.** `resolver_aprobacion` existe, pero la Bandeja es la interfaz del humano; yo propongo, no resuelvo.
- **Manipular la app por navegador.** La sesión de Tomás en `app.casahiedra.com` es de **verificación visual** (mirar Kanban, fichas, Bandeja), no de escritura. Clickear "toque de un click", arrastrar tarjetas o llenar formularios web sería escribir sin log de agente ni deshacer — todo lo que escriba va por MCP.
- **Confirmar clientes** (`confirmado`), descartar, enfriar o mandar a nurture: juicio de negocio humano.
- **Rankings entre personas**, barridos generales del Gmail, o inventar datos (emails deducidos del dominio, toques no ocurridos).

**Asimetría operativa (regla vigente):** avanzar etapa = evidencia positiva →
directo; retroceder = evidencia de ausencia → **Bandeja**; calce dudoso (alias,
dominio parecido, multi-destinatario) → **Bandeja**; calce exacto → registro
directo reversible.

---

## 6. Sugerencias para mejorar el trabajo del operador

> **Estado 6-ago (tarde): las cinco están CONSTRUIDAS.** Ver
> `sql/crm_interacciones_operador.sql` (pendiente de correr en el editor SQL de
> Supabase — habilita 4 y 5) y las herramientas nuevas
> `hilvan_interacciones` y `hilvan_registrar_interacciones_bulk`.
> `hilvan_mover_etapa` acepta `como_propuesta` + `evidencia`.
> Probadas contra datos reales: lectura de la bitácora de Reebok, validación
> atómica del bulk, idempotencia por `gmail_thread` y propuesta de retroceso
> sin mover el prospecto.

**Del lado del MCP (para el builder):**
1. **`hilvan_interacciones(prospecto_id)`** — hoy puedo escribir toques pero **no leer los existentes** de un prospecto; para "cuántos contactos lleva X" dependo de la evidencia externa. Es la carencia nº 1 para la reconciliación incremental.
2. **Propuesta de retroceso como tipo de Bandeja** — hoy la Bandeja acepta prospectos nuevos; un tipo `mover_etapa_propuesto` con evidencia adjunta formalizaría la asimetría (retrocesos en tanda aprobables por el humano).
3. **`registrar_interaccion` masivo (bulk)** — la primera corrida son ~40 toques; uno a uno es lento y llena el log.
4. **Campo `enviado_por`** en la interacción — hoy el autor real (Simón/Nati) solo se infiere; un campo persona (sin rankings, solo trazabilidad) haría el historial legible.
5. **Dedupe por `gmail_thread`** — si registro dos veces el mismo hilo, nada lo impide; un unique por (prospecto, gmail_thread) evitaría dobles toques.

**Del lado del proceso (para Tomás y el equipo):**
6. ~~**Cerrar el punto ciego de Nati**~~ → **RESUELTO 7-ago**: Nati reenvía, mismo protocolo que la cuenta de Simón. Detalle original: su correo (`natalia@casahiedra.com`) no llega al Gmail de Tomás. Opciones: (a) regla de auto-reenvío como la de estudiocasahiedra, (b) export .eml periódico a la carpeta, o (c) conectar su cuenta por MCP. Sin esto, la rutina A solo ve a Simón.
7. **Estandarizar el remitente o registrar al enviar:** si todo el equipo enviara desde cuentas reenviadas (o registrara el toque con el click del Kanban al enviar), la reconciliación semanal sería casi vacía — que es el objetivo.
8. **Sesión de tono pendiente:** definir la voz de los correos de valor (los actuales son 100% venta con plantilla común). Los dos borradores del piloto sirven de material de discusión. Lo que salga se agrega aquí como regla del operador.
9. **El prospecto "Home"** sigue sin responsable; y "WOkGBTUybPNwckUkj" parece basura de formulario — candidatos a limpieza humana.

---

## 7. Siguiente paso acordado
Corrida completa de la rutina A pendiente de ok: ~12 toques de existentes + ~26
propuestas de prospecto nuevo a la Bandeja + retrocesos con evidencia (a
Bandeja). Piloto validado (Reebok + Human Mob). Después: rutina B con el tono ya
definido; rutina C apagada hasta que el promedio de contactos suba.

---

*Casa Hiedra · Hilván · CH-10 · contexto exhaustivo del operador de CRM · 6-ago-2026*
