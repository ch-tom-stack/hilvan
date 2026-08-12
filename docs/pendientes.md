# Pendientes — CRM, Repertorio y sonido

Corte **11-ago-2026**. Sale de la sesión que construyó el eje frío/entrante, el
Repertorio y la capa de sonido de toda la app.

Marcado explícitamente qué verifiqué contra la base y qué no pude comprobar
desde acá, para que nadie trate una suposición como un hecho.

---

## 1. Depende de Tomás

### Confirmar fichas del Repertorio
*Verificado 11-ago: 30 trabajos cargados, links revisados ese mismo día.*

Las fichas traen preguntas escritas en sus notas, dirigidas a él:

- **Años.** Casi todas las que salieron del Archivo del sitio están con
  `anio: null` — el sitio no publica fecha. Afecta el orden por reciente, que es
  como se elige la credencial cuando hay varias del mismo rubro y escala.
- **Cuatro dudas de escala/rubro:**
  - *Sybilla* — marca propia de Falabella. ¿Cuenta como grande o es de porte medio?
  - *Beauty F* — es la línea de belleza de Falabella, no la marca madre. Hoy va
    como chica.
  - *Wolf and Hank* — boutique, pero la pieza es con Benjamín Vicuña.
  - *Puerto de Palos* — rubro exacto sin confirmar (¿restorán? ¿marca de alimentos?).

### Black & Decker no tiene ni un link
La ficha existe porque Tomás confirmó que el trabajo es real, pero no hay pieza
pública que enlazar: ni en la portada ni en el Archivo del sitio. Mientras siga
así es una credencial que **no se puede mostrar** — a diferencia de Stanley, que
sí tiene su mp4 de portada.

### Escuchar el set en la app
Emparejar los 40 sonidos por volumen percibido costó bajar el objetivo global
**10.5 dB** (lo fija la claqueta, con 30 dB de cresta). Si el set suena débil, la
corrección es subir `GANANCIA` en `lib/sfx.ts` — **nunca** reprocesar los
archivos: la sala se acumula y se empantanan.

### Decidir si se enciende el cron de seguimientos del CRM
Está apagado a propósito. La condición que se puso para encenderlo —que
registrar un contacto fuera de un click— ya se cumplió hace rato. Queda como
decisión, no como tarea.

---

## 2. Huecos que van a doler pronto

### Rubros sin ninguna credencial
El Repertorio cubre retail, moda, belleza, bebidas, alimentos, fintech,
herramientas, tecnología y turismo. **No cubre educación ni electrodomésticos.**

En el pipeline hay cinco prospectos de esos rubros: DUOC UC, AIEP, Universidad
San Sebastián, Universidad Católica y Electrolux. Al escribirles,
`hilvan_repertorio_leer` va a devolver `delRubro: false` y el correo tendrá que
citar una credencial de otro rubro — diciéndolo, según la regla.

No es un bug: es que no hay trabajo de esos rubros, o no está cargado.

### Cuatro correos que rebotaron
Ko Andina · Virtex / Ilko · Coopeuch · Aramco (vía Exmax). Direcciones
adivinadas, `mailer-daemon`. Sin dirección válida no tiene sentido escribirles.
*No verificado hoy: puede que ya se hayan corregido.*

---

## 3. Construible

### `hilvan_editar_prospecto` — no existe
El operador **no puede corregir el campo `origen`**. Importa porque ese campo
decide la temperatura (frío vs entrante) y con eso la secuencia de correos: a un
entrante no se le manda el toque 1 de valor, ya levantó la mano.

Un prospecto sin origen sale como *Sin clasificar* y usa la escalera fría, que
es la conservadora. Se arregla sólo a mano en `/crm/[id]/editar`.

Es una herramienta chica y es lo único que hoy bloquea al operador.

### Dos momentos de sonido sin dónde vivir
`movimiento.conciliado` y `lead.entrante` están definidos y nunca suenan: los
dos ocurren en rutas de agente, en el servidor, donde no hay navegador que
reproduzca nada. Suenan sólo si esas acciones ganan una superficie en la app.

Lo mismo pasaba con `qr.escaneado`: se resolvió disparándolo al **descargar** el
QR, porque el escaneo aterriza en una página pública donde el navegador bloquea
el audio hasta que el usuario toque algo.

---

## 4. Medallas — lo que queda abierto

El sistema dejó de ser del CRM: 38 medallas en cuatro capítulos, con emblema
propio, rangos históricos, ritmo del período y repetición mensual con nivel.

- **Emblemas por rehacer.** Tomás revisó los 38 y algunos no se leen a 24 px.
  Falta que diga cuáles. Los sospechosos por densidad: *Tejedora*, *Cincuenta
  jornadas* y *Tres costuras*.
- **El correo NO se mandó, a propósito.** El sistema se descubre solo: al
  registrar un contacto aparece el aviso de la medalla. Anunciarlo el día uno
  habría mostrado 0 de 38 y nada ocurriendo; esperar deja que la primera
  visita encuentre varias ya ganadas.
- **Los umbrales mensuales son una apuesta.** *Cincuenta* pasó a significar 50
  contactos EN EL MES, no acumulados. Si al cierre del primer mes nadie llega,
  hay que bajarlos.
- **`equipos` y `maletas` no tienen atribución**, así que no tienen medallas.
  Agregar un `created_by` a esas tablas abriría el capítulo.
- **Sigue sin decidirse si es un módulo con lugar propio** en el sidebar o una
  sección del perfil. Hoy vive en `/perfil`.

---

## 5. Deuda menor

### Las voces del enfriado siguen siendo TTS
Las cuatro variantes de `crm-enfriado` usan voces sintéticas de macOS montadas
sobre el trombón. Funcionan, pero grabarlas con la voz de Natalia o Simón son
dos segundos por línea y el chiste mejora mucho. El montaje ya está hecho: sólo
hay que reemplazar el archivo de voz y volver a correr la cadena.

**Ojo:** cualquier sonido nuevo se procesa junto al set completo desde los
originales (que están en el historial de git), nunca de a uno — el ajuste de
volumen es global. Ver `tools/sonido/README.md`.

### Del CLAUDE.md, llevan meses
- **Export Santander** — falta validarlo con rendiciones aprobadas reales.
- **OTT\* NT AT HOME** — cargo recurrente de ~$10.100/mes en tarjeta, servicio
  sin identificar.

---

## Lo que ya NO es pendiente

Anotado porque estaba en listas anteriores y se resolvió:

- El Repertorio ya no está vacío: 30 trabajos, links verificados.
- Los 58 prospectos tienen responsable — ya no hay huérfanos.
- Las etapas se movieron (de 18 en *prospecto* a 8): la conciliación corrió.
- El SQL del Repertorio corrió y sus tres herramientas están en producción.
- Enfriar y descartar tienen sonido propio y distinto entre sí.
- Los cinco módulos tienen sonido: ninguno en cero.
- `hilvan_editar_prospecto` existe: el operador ya puede corregir `origen`.
- Las medallas se detectan donde ocurre el trabajo, no sólo al abrir el perfil.
