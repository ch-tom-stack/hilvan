# Pendientes — CRM, Repertorio y sonido

Corte **11-ago-2026**. Viene de la sesión que construyó el eje frío/entrante, el
Repertorio y la capa de sonido.

Está en el repo y no en la memoria de un chat a propósito: los agentes de Cowork
no leen memorias de chats, y estas listas se pierden. Marcado qué está
verificado contra la base y qué no, para que nadie trate una suposición como un
hecho.

---

## 1. Depende de Tomás

### Confirmar fichas del Repertorio
*Verificado 11-ago: 30 trabajos cargados, links revisados ese día.*

Las preguntas están escritas en las `notas` de cada ficha:

- **Años.** Casi todas las que salieron del Archivo del sitio tienen
  `anio: null` — el sitio no publica fecha. Afecta el orden por reciente, que es
  como se desempata la credencial cuando hay varias del mismo rubro y escala.
  *(Tomás, 11-ago: no es prioridad para el CRM.)*
- **Cuatro dudas de escala/rubro:**
  - *Sybilla* — marca propia de Falabella. ¿Grande o porte medio?
  - *Beauty F* — línea de belleza de Falabella, no la marca madre. Hoy va chica.
  - *Wolf and Hank* — boutique, pero la pieza es con Benjamín Vicuña.
  - *Puerto de Palos* — rubro sin confirmar (¿restorán? ¿marca de alimentos?).

### Black & Decker no tiene ni un link
La ficha existe porque Tomás confirmó que el trabajo es real, pero no hay pieza
pública que enlazar: ni en la portada ni en el Archivo. Mientras siga así es una
credencial que **no se puede mostrar** — a diferencia de Stanley, cuyo mp4 de
portada apareció y ya la habilita.

### Escuchar el set de sonido en la app
Emparejar los 40 sonidos por volumen percibido costó bajar el objetivo global
**10.5 dB** (lo fija la claqueta, con 30 dB de cresta). Si suena débil, se sube
`GANANCIA` en `lib/sfx.ts` — **nunca** se reprocesan los archivos: la sala se
acumula y se empantanan.

### Decidir si se enciende el cron de seguimientos
Está apagado a propósito. La condición que se puso para encenderlo —que
registrar un contacto fuera de un click— ya se cumplió. Es decisión, no tarea.

---

## 2. Huecos que van a doler pronto

### Rubros sin ninguna credencial
El Repertorio cubre retail, moda, belleza, bebidas, alimentos, fintech,
herramientas, tecnología y turismo. **No cubre educación ni electrodomésticos.**

En el pipeline hay cinco prospectos de esos rubros: DUOC UC, AIEP, Universidad
San Sebastián, Universidad Católica y Electrolux. Al escribirles,
`hilvan_repertorio_leer` devuelve `delRubro: false` y el correo tendrá que citar
una credencial de otro rubro, diciéndolo. No es un bug: o no hay trabajo de esos
rubros, o no está cargado.

### Cuatro correos que rebotaron
Ko Andina · Virtex/Ilko · Coopeuch · Aramco (vía Exmax). Direcciones adivinadas,
`mailer-daemon`. *No verificado hoy: pueden estar corregidas.*

---

## 3. Construible

### ~~`hilvan_editar_prospecto`~~ — HECHO (11-ago)
Era lo único que bloqueaba al operador: no podía corregir `origen`, el campo que
decide la temperatura y con ella la secuencia de correos. Ya existe, con
actualización parcial (sólo escribe los campos que se manden) y guardando el
valor anterior en la auditoría.

### Dos momentos de sonido sin dónde vivir
`movimiento.conciliado` y `lead.entrante` están definidos y nunca suenan: ocurren
en rutas de agente, en el servidor, donde no hay navegador. Suenan sólo si esas
acciones ganan una superficie en la app.

Lo mismo pasaba con `qr.escaneado`: se resolvió disparándolo al **descargar** el
QR, porque el escaneo aterriza en una página pública donde el navegador bloquea
el audio hasta que el usuario toque algo.

---

## 4. Deuda menor

### Las voces del enfriado son TTS
Las variantes de `crm-enfriado` usan voces sintéticas de macOS sobre el trombón.
Funcionan, pero grabarlas con la voz de Natalia o Simón son dos segundos por
línea y el chiste mejora mucho. El montaje ya está hecho: se reemplaza el
archivo de voz y se vuelve a correr la cadena.

**Ojo:** cualquier sonido nuevo se procesa junto al set completo desde los
originales (que están en el historial de git), nunca de a uno — el ajuste de
volumen es global. Ver `tools/sonido/README.md`.

### Del CLAUDE.md, llevan meses
- **Export Santander** — falta validarlo con rendiciones aprobadas reales.
- **OTT\* NT AT HOME** — cargo recurrente de ~$10.100/mes, servicio sin identificar.

## Cómo abordarlo — revisar cómo funciona (13-ago-2026)

El panel propone el próximo correo cruzando insights, interacciones y origen.
**No está sirviendo**: Tomás lo bajó al final de la ficha porque encabezarla con
una sugerencia floja le daba a eso el lugar de lo que sí es cierto —la
conversación y lo que se sabe de la marca—. Estuvo a un paso de sacarlo.

Antes de arreglarlo hay que decidir si el panel debe existir. Si se mantiene,
tres cosas cambiaron bajo sus pies y probablemente expliquen parte del problema:

- `origen` era mentira hasta hoy: todo lo del sitio se etiquetaba `lectura`, así
  que el panel calculaba la temperatura (frío vs entrante) sobre un dato falso
  en 16 prospectos.
- Los insights tipo `lectura` nunca se usaron (100 filas, sólo `investigacion` y
  `literatura`), y ahora La Lectura vive en `crm_lecturas` y en las notas.
- La bitácora dejó de ser una lista de toques: tiene dirección y respuestas, que
  es información que el panel todavía no mira.

---

## Resuelto (estaba en listas anteriores)

- El Repertorio ya no está vacío: 30 trabajos, links verificados.
- Los 58 prospectos tienen responsable — no quedan huérfanos.
- Las etapas se movieron (de 18 en *prospecto* a 8): la conciliación corrió.
- El SQL del Repertorio corrió y sus tres herramientas están en producción.
- Enfriar y descartar tienen sonido propio y distinto entre sí.
- Los cinco módulos tienen sonido: ninguno en cero.
- `hilvan_editar_prospecto` existe (ver arriba).
