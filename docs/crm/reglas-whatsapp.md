# Reglas de WhatsApp — CRM (CH-10)

El WhatsApp de la empresa está conectado a Hilván: cada mensaje que llega al
número y cada mensaje que el equipo manda desde el celular queda guardado, y el
operador lo pasa al CRM en su rutina. Hilván solo ESCUCHA — nunca envía por
WhatsApp.

Por qué existe (brief de calidad de leads, 19-sep-2026): Magnolia novias dejó
plantado al equipo tres veces y Atelier Paola Castro postergó el proyecto por
WhatsApp. Nada de eso estaba en el CRM, así que la ficha mostraba dos leads
abandonados después de una reunión — y el operador, leyendo eso, podía
redactarle una insistencia a alguien que ya había dicho que no.

---

## 1. El cotejo de WhatsApp va junto al de correos

En el paso 1 de la rutina, después de Gmail:

1. `hilvan_whatsapp_pendientes` — conversaciones sin registrar, agrupadas por
   prospecto y día, de la más antigua a la más nueva.
2. Por cada una, `hilvan_whatsapp_registrar` con un resumen.
3. Si `hay_mas` es true, se repite hasta vaciar la cola. Tras el alta del número
   entra el historial de 180 días de una vez: esa primera corrida es larga y
   está bien que lo sea.

**La unidad es la conversación del día, no el mensaje.** Una charla de treinta
globos es UN registro.

## 2. Qué va en el resumen

Al CRM va el resumen, **nunca la transcripción**. Debe contestar dos cosas: qué
se habló y **en qué quedó**.

> ✅ *"Paola pide postergar: el proyecto queda sin fecha, 'lo retomamos después
> del verano'. No pidió nada más."*
> ✅ *"No llegó a la reunión de las 11:00 (tercera vez). Se disculpó a las 12:40
> y propuso reagendar sin dar fecha."*
> ❌ *"Conversación por WhatsApp sobre el proyecto."*

- Lo que el resumen afirme tiene que estar en los mensajes. No se infiere tono,
  interés ni intención que nadie escribió.
- **Audios, fotos y documentos no se pueden leer.** Si `sin_texto` es mayor que
  cero se dice en el resumen ("incluye 2 audios sin transcribir") y, si la
  conversación no se entiende sin ellos, se deja como pendiente humano en el
  reporte. No se adivina lo que decía un audio.
- Si salió un compromiso con fecha ("hablemos el lunes"), va en `proximo_paso` /
  `fecha_proximo`.
- **Ruido** — un "gracias!", un sticker, un "ok" suelto — se cierra con
  `sin_registro: true` y un motivo. No todo mensaje merece una línea en la ficha.

## 3. Lo que WhatsApp cambia en el resto de la rutina

- **Antes de redactar cualquier borrador**, mirar si el prospecto tiene una
  conversación de WhatsApp reciente. Lo que dijo por WhatsApp manda sobre el
  número de toque: si postergó, no se le insiste; si preguntó precio, se le
  contesta eso.
- **El registro no mueve etapas.** Si la conversación muestra que avanzó
  ("mándame la cotización"), que se enfrió ("después del verano") o que se cayó
  ("ya lo resolvimos con otra productora"), se propone aparte con
  `hilvan_mover_etapa { como_propuesta: true, evidencia }`. Un "no" o un
  "más adelante" por WhatsApp vale lo mismo que por correo.
- **Un plantón es un dato.** Reunión agendada + nadie se conectó + disculpa
  posterior se registra tal cual. Tres plantones son evidencia para proponer
  `en_frio`, no para seguir agendando.

## 4. La cuarentena

Al número de la empresa también le escriben proveedores, equipo y gente que no
es venta. Por eso **solo se guarda el contenido de números que calzan con un
prospecto o un contacto del CRM**. El resto cae en cuarentena: número, nombre
de perfil, fechas y cantidad de mensajes — jamás el texto — y se borra sola a
los 30 días.

`hilvan_whatsapp_desconocidos` los lista. Con cada uno:

- **Vincular** a un prospecto **solo con fuente**: el número aparece en la firma
  de un correo, en el sitio de la marca, en la ficha. Un nombre de perfil
  parecido al de un contacto **no es fuente**.
- **Ignorar** cuando es evidente que no es venta (un proveedor conocido).
- **En la duda, no tocar**: se reporta ("3 números en cuarentena, uno con perfil
  'Flora Utopía'") y decide una persona.

Al vincular, los mensajes **anteriores no se recuperan** — nunca se guardaron.
Por eso conviene que los prospectos tengan su teléfono cargado desde el primer
contacto: es lo que hace que su WhatsApp entre completo.

## 5. Lo que no se hace

- No se envía nada por WhatsApp. Ni el operador ni Hilván.
- No se copia la conversación al campo `cuerpo`, a notas ni a insights.
- No se crean prospectos desde la cuarentena sin que una persona lo confirme.
