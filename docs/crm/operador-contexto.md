# Operador del CRM — contexto de traspaso

> Para el chat que va a construir la rutina del operador de CRM.
>
> ⚠️ **Corregido y ampliado por [`operador-verificado.md`](operador-verificado.md)**,
> escrito tras el piloto del 6-ago. Ese documento manda donde haya discrepancia:
> incluye el estado real, los textos de los correos y el comportamiento
> observado de cada herramienta. Este queda como el diseño y las reglas.

---

## 1. El problema real

El CRM tiene **30 prospectos y ~1 contacto registrado en total**. Promedio de
contactos por prospecto: 0,08. Cero confirmados. Hasta hace poco, 18 de 30
estaban sin responsable.

Eso significa dos cosas para quien construya acá:

- **No falta pipeline, falta actividad.** El cuello de botella es cuántos
  toques se dan y se registran, no cuántos prospectos hay.
- **La Biblioteca no sirve todavía.** `hilvan_biblioteca_contactos` calcula
  tasa de respuesta y a qué toque cierran los prospectos, pero con 1
  interacción en la base sus números son ruido. No fundamentes metas con eso
  hasta que haya volumen real.

Hay un agravante ya corregido: hasta el 6-ago **todo contacto se guardaba con
`tipo: 'correo'`** porque el formulario no tenía selector. Cualquier estadística
por canal anterior a esa fecha es inválida.

---

## 2. Qué YA existe (no lo reconstruyas)

### Herramientas del agente (MCP)

| Herramienta | Para qué |
|---|---|
| `hilvan_pipeline` · `hilvan_buscar_prospecto` | leer el tablero |
| `hilvan_metricas_crm` · `hilvan_biblioteca_contactos` | métricas e insights |
| `hilvan_registrar_interaccion` | **registrar un toque** |
| `hilvan_crear_prospecto` · `hilvan_mover_etapa` | alta y avance |
| `hilvan_borrador_escribir` · `hilvan_borrador_leer` | **redactar el próximo contacto** |
| `hilvan_listar_aprobaciones` · `hilvan_resolver_aprobacion` | la Bandeja |
| `hilvan_buscar_leads_web` · `hilvan_descubrir_marcas` | captación nueva |
| `hilvan_proximos_seguimientos` | próximos pasos vencidos |
| `hilvan_derivar_brief_cotizacion` | handoff a cotización |
| `hilvan_registrar_lectura` | vincular una lectura |
| `hilvan_deshacer` | **revertir lo último** |

**Ojo:** `hilvan_correo_pendientes` NO es de correos del CRM — clasifica
documentos tributarios (boletas/facturas). No sirve para esto.

### Superficies en la app

- **Toque de un click** en cada tarjeta del Kanban: cuatro canales (correo,
  llamada, mensaje, reunión). Registra con fecha de hoy y nada más. Registrar
  y detallar son dos momentos separados a propósito.
- **"Tus prospectos de hoy"**: franja con 3 prospectos del usuario, los nunca
  tocados primero y después los más fríos.
- **Reparto masivo**: franja que aparece si hay prospectos sin responsable.
- **Borrador de respuesta** en la ficha (`crm_borradores`): la casilla existe y
  está vacía; dice literalmente "El operador IA o tú pueden rellenar uno".
- **Bandeja de Aprobación** (`crm_aprobaciones`): 37 entradas históricas.
- **Dossier de La Lectura** archivado y renderizado en la ficha.

### Correo — verificado en vivo el 6-ago-2026

El Gmail de Tomás está conectado por MCP y **el equipo le reenvía todo lo que
manda**. Su bandeja es el registro de la actividad de *todo el equipo*.

Datos concretos, comprobados abriendo los hilos:

- **El equipo escribe desde `estudiocasahiedra@gmail.com`**, no desde su
  dirección personal. Buscar `from:simon@…` no encuentra nada.
- El reenvío llega **de** `estudiocasahiedra@gmail.com` **a**
  `tomasmontealegrem@gmail.com`. La dirección del prospecto **no está en
  ninguna cabecera**.
- El cuerpo trae un bloque parseable, siempre igual:

```
---------- Forwarded message ---------
De: Casa Hiedra <estudiocasahiedra@gmail.com>
Date: mar, 4 ago 2026 a la(s) 3:41 p.m.
Subject: Lookbook para Reebok | Casa Hiedra
To: <javier.hernandez@reebok.com>
```

De ahí salen destinatario, fecha y asunto reales.

- **La fecha del mensaje NO sirve**: es la del reenvío. Los 14 correos del
  4-ago fueron reenviados el 6-ago. Usa la del bloque.
- El formato de fecha es español y no ISO (`mar, 4 ago 2026 a la(s) 3:41 p.m.`).
  Hay que parsear meses abreviados en español.

Los leads de La Lectura llegan aparte, con asunto `Tu lectura — Casa Hiedra`, y
ahí sí el destinatario de la cabecera es el correo del lead.

---

## 3. La regla de oro

**Nada que el operador proponga se aplica solo. Nada se envía nunca.**

- Prospectos nuevos y cambios → **propuesta en la Bandeja**, el humano aprueba.
- Correos redactados → **borrador en `crm_borradores`**, nunca `send`.
- Interacciones → ver el matiz en la rutina A.

El patrón ya está construido y funciona: el webhook del sitio deja propuestas,
no prospectos. Respétalo.

---

## 4. Las tres rutinas

### A · Cotejar correos vs registrados · **la más valiosa, y es PERMANENTE**

Reconciliación entre el Gmail y el CRM: encontrar intercambios reales que nunca
se registraron.

**No es una limpieza de atraso, es una rutina fija.** La deuda burocrática del
registro es estructural: nadie anota sus correos de forma fiable, nunca. Si la
reconciliación se corre una vez, el CRM vuelve a mentir en dos semanas. Es el
mecanismo que mantiene el tablero verdadero, no un arreglo puntual.

La primera corrida es grande (meses de atraso). Las siguientes son baratas:
ventana corta, solo lo nuevo.

**La dirección del barrido importa.** El primer diseño iba prospecto por
prospecto. Está mal: pierde a las marcas que el equipo contactó y que **nunca
se dieron de alta**, que resultaron ser varias. Va al revés.

1. **Partir del correo saliente, no del CRM.** Son **dos búsquedas en Gmail**,
   porque desde el 7-ago **los dos reenvían** a `tomasmontealegrem@gmail.com`:
   - `from:estudiocasahiedra@gmail.com` → **Simón**
   - `from:natalia@casahiedra.com` → **Natalia** (protocolo nuevo)

   **Más el histórico de Nati, por una sola vez**: `~/Documents/correos`,
   40 .eml anteriores al protocolo. Cabeceras limpias, parseables con el módulo
   `email` de Python — no hay que parsear cuerpo ahí.

   Usar solo la primera fuente deja fuera ~27 marcas. Ver §2 de
   [`operador-verificado.md`](operador-verificado.md).
2. De cada hilo, parsear el bloque `Forwarded message`: destinatario, fecha y
   asunto **originales**.
3. Buscar ese correo en el CRM (`hilvan_buscar_prospecto`).
   - **Existe** → comparar con sus interacciones y registrar lo que falte.
   - **No existe** → el equipo contactó a alguien que no está en el tablero:
     **propuesta de prospecto nuevo en la Bandeja**, con la marca, el correo y
     el asunto como contexto. No lo crees directo.
4. Para saber si hubo respuesta, buscar aparte `from:<email del prospecto>`.
   Un hilo de reenvío con un solo mensaje significa que **nadie respondió**.
5. Registrar el toque con su fecha, canal y un resumen de una línea.
   `respondido: true` solo si existe respuesta real del prospecto.

**Alcance de la búsqueda:** solo contra direcciones que ya están en el CRM.
Nunca un barrido general de la bandeja. Es el correo personal de Tomás, y ahí
también llega todo lo demás de su vida.

**Deduplicación:** un mismo intercambio puede aparecer tres veces (envío
directo, respuesta y reenvío del equipo). Es *un* toque, no tres. Agrupa por
hilo antes de registrar.

#### Mover la etapa según lo que muestre el correo

El registro del toque no basta: si hubo contacto, el prospecto ya no está en
"Prospecto", y si respondió, ya no está en "Contacto". El tablero tiene que
reflejarlo o sigue mintiendo.

Etapas: `prospecto` → `contacto` → `conversacion` → `confirmado`, más
`en_frio`, `nurture` y `descartado`.

Con `hilvan_mover_etapa`, derivado de la evidencia:

| Lo que muestra el correo | Mover a |
|---|---|
| Se le escribió y no respondió | `contacto` |
| **Respondió** | `conversacion` |

**Reglas:**

1. **Avanzar: directo.** Si la evidencia muestra contacto o respuesta, mueve.
2. **Nunca a `confirmado`.** Esa etapa dispara el handoff a cotización —crea o
   enlaza el cliente y entrega el prospecto al flujo de cotizaciones—, por eso
   la app pide confirmación explícita al arrastrar la tarjeta ahí. Confirmar un
   cliente es una decisión de negocio, no una inferencia sobre un correo.
3. **Nunca a `descartado`, `en_frio` ni `nurture`.** Enfriar o descartar es
   juicio humano.

#### Retroceder: el tablero está inflado

Hoy hay **19 prospectos en Conversación y ~1 interacción registrada en toda la
base**. Se movieron a mano sin que hubiera respuesta.

Comprobado el 6-ago con el correo real: de los 14 envíos del 4-ago, **ninguno
tiene respuesta** — cada hilo de reenvío tiene un solo mensaje. Entre ellos
Reebok, Ellesse, Froens, Street Machine, Treino, Monster Energy, Total Tools y
Universidad Católica, **todos figurando en Conversación**.

"Conversación" no significa nada mientras eso siga así, y peor: infla la
sensación de avance.

Cuando el barrido de un prospecto esté **completo** —las tres búsquedas hechas
sobre su dirección— y muestre que **nunca respondió**, esa tarjeta está mal
ubicada.

- **Retroceder NO se aplica solo: va como propuesta a la Bandeja**, con la
  evidencia adjunta ("3 correos enviados entre el 2-jun y el 14-jul, ninguna
  respuesta en el hilo"). El humano aprueba en tanda.
- Propón `contacto`, que es el estado verdadero: se le escribió y no contestó.
  Si además está frío, eso lo decide la persona.
- **No retrocedas por evidencia parcial.** Si la búsqueda falló, dio timeout o
  el prospecto no tiene email, no concluyas nada. Ausencia de datos no es
  ausencia de conversación.

La asimetría es deliberada: avanzar se apoya en evidencia positiva (existe un
correo), retroceder se apoya en una ausencia, y una ausencia siempre puede ser
un fallo de búsqueda.

Al mover, deja el motivo en el resumen de la interacción ("respondió el 12-jul,
pasa a conversación"). Si el tablero cambia solo, tiene que quedar claro por qué.

**Sobre escribir directo:** acá es defendible registrar sin pasar por la
Bandeja *si el calce de email es exacto* — el intercambio ocurrió, hay
evidencia, y `hilvan_deshacer` permite revertir. Los calces dudosos (dominio
parecido, alias, hilos con varios destinatarios) van a la Bandeja. Confirma
este criterio con Tomás antes de la primera corrida masiva.

**Cadencia:** primera corrida completa ahora, sin ventana. Después, semanal,
mirando solo desde la última corrida.

### B · Redactar próximos contactos

> **Reglas de tono acordadas el 6-ago con Tomás.** El detalle completo, con su
> fundamento en la literatura, está en la memoria del proyecto
> (*Correos de outreach*). Resumen operativo:

**Largo: tope 120 palabras.** Los correos actuales promedian 203. Orden:
presentación en una línea → lo que les pasa a ELLOS → qué hacemos. Lo
específico va segundo, no cuarto.

**El párrafo de traducción decide si el correo se manda.** Debe contener algo
que solo se sabe mirando a esa marca. Prohibido "etc.". Nunca el mismo párrafo
para dos marcas de la misma categoría — ya pasó con Electrolux y Kitchen Center.

**Credenciales: dos, una de cada escala.** Una grande que reconozcan (Falabella,
Aldo, Wrangler, Lee) y una chica del porte del prospecto (Asia Skincare, OZ
Cranberry Lab).

**Valor** = precisar y explicar: observación precisa de su comunicación → qué
mejoraría y por qué → cómo entramos, dicho una vez y sin gesto de venta. NO es
enseñar un truco para que lo hagan solos: suena insincero y no suena a Nati ni a
Simón. Filtro: *si no responden, ¿entendieron mejor su propio problema?*

**Secuencia:** toques 1–2 valor · 3–4 **pedir un avance**, no cerrar · 5+
reactivar con una etiqueta y una pregunta que se pueda responder con un "no".
Si la respuesta pide precio, plazo o disponibilidad, se cierra de inmediato sin
importar el número de toque.

El panel **"Cómo abordarlo"** de la ficha ya muestra en qué toque va cada
prospecto y qué corresponde. Los insights que fundamentan el borrador se
guardan con `hilvan_insight_escribir` para que Nati y Simón los vean.



Para prospectos que llevan días sin toque, dejar un borrador listo en la ficha.

- Escribe en `crm_borradores` vía `hilvan_borrador_escribir`. **Jamás envía.**
- Usa el **dossier de La Lectura** si el prospecto lo tiene archivado
  (`crm_lecturas.dossier`): héroe, villano, vaca púrpura, dirección y ocasión.
  Es material específico de esa marca, no relleno.
- Si no hay dossier, usa `angulo` y `notas` del prospecto.

**Reglas de copy (no negociables):**
- Correo de **valor**: valor puro, sin ningún gesto de venta. Ni precio, ni
  llamado a reunión, ni "conversemos".
- Correo de **venta**: directo, con el precio a la vista.
- **Uno de cada cuatro vende.** Los otros tres son valor.
- Nada de "espero que estés muy bien", "quería contarte", ni entusiasmo
  fabricado.

### C · Buscar leads nuevos · **NO la hagas recurrente todavía**

Existe (`hilvan_descubrir_marcas` → podar → `hilvan_buscar_leads_web`) y
funciona, pero **hoy agrega ruido, no valor**.

Con 30 prospectos y ~1 trabajado, el problema no es la oferta de leads sino el
rendimiento. Sumar prospectos a un pipeline que nadie toca engorda la Bandeja
y entrena al equipo a ignorarla — de las 37 entradas históricas, buena parte
está descartada.

**Actívala cuando el promedio de contactos por prospecto suba de forma
sostenida.** Ese es el disparador, no el calendario.

---

## 5. Sobre hacerlo recurrente

El cron de seguimientos del CRM **existe y está apagado a propósito**.
Encender avisos antes de que registrar sea fácil convierte la app en fuente de
culpa: te recuerda algo que igual cuesta hacer.

Esa condición ya cambió — registrar es de un click. Pero la secuencia correcta
sigue siendo:

1. **A recurrente desde el principio** — primera corrida completa, después
   semanal. Es la que sostiene la verdad del tablero.
2. Cuando haya contactos fluyendo, **B semanal**.
3. **C recién después**, y solo si el rendimiento lo justifica.

Un aviso que llega sin nada que celebrar entrena a ignorar los avisos.

---

## 6. Lo que NO se debe hacer

- **Inventar datos.** Si no hay correo, no lo deduzcas del dominio. Si no hay
  fuente fehaciente, salta y pregunta.
- **Enviar correos.** Ni uno, por ningún camino.
- **Registrar toques que no ocurrieron.** El contador de la tarjeta pinta un
  mapa de calor; inflarlo destruye la única señal del tablero.
- **Rankings entre personas.** Mediría quién recibió asignaciones, no quién
  trabajó.
- **Expandirse fuera de Hilván.** El sitio y La Lectura son otro sistema; solo
  se leen.

---

*Casa Hiedra · Hilván · CH-10 · contexto para el operador de CRM · ago 2026*
