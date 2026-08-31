# Reglas de correos de captación — CRM (CH-10)

Fuente de verdad del **qué y cómo se escribe** un correo de outreach de Casa
Hiedra. Acordadas con Tomás el 6-ago-2026 tras leer los 28 correos reales de
Natalia. Es una de las tres reglas que entrega `hilvan_reglas_crm`: las otras
dos son la de **cadencia** (cuándo se manda) y la de **reparto** (de quién es el
prospecto). Vienen en la misma respuesta — no hay que ir a buscarlas.

> Quien redacte —persona o agente— trabaja con este documento a la vista.
> Antes vivía en la memoria de un chat, que no es accesible para todos.

---

## 1. Largo y estructura

- **80–130 palabras** (los buenos rondan ahí; 130 es el tope). Los correos
  previos promediaban 203: a esa extensión se escanean, y lo que se escanea es
  el primer párrafo.
- **Orden:** presentación en una línea → **lo que les pasa a ELLOS** → qué
  hacemos nosotros. Lo específico va segundo, no cuarto.
- El párrafo específico de la marca **no puede ser menos de un tercio** del
  total. Si lo es, el correo habla más de nosotros que de ellos.

**Se elimina por defecto:** explicar qué es un banco de videos o un lookbook (no
interesa antes de haber interés), "entregamos en alta calidad", "lo ajustamos a
las necesidades de cada cliente". El video de Tomás es buen activo pero compite
con el mensaje: va en el **correo 2**.

## 2. El párrafo de traducción — decide si el correo se manda

Es el correo; el resto es envoltorio. La frase *"para X, eso podría traducirse
en…"* es la que vale.

- Debe contener algo que **solo se sabe mirando a esa marca**: un material, un
  proceso, un espacio, un producto con nombre.
- **"Etc." prohibido.** Es la señal de que se acabó lo específico. Tres
  elementos concretos > cinco con etcétera.
- **Nunca el mismo párrafo para dos marcas de la misma categoría.** Ya pasó:
  Electrolux y Kitchen Center —competidores directos— recibieron el idéntico.
- **Investigar antes de escribir.** Si el prospecto tiene dossier de La Lectura
  archivado, ese es el mejor material posible.

## 3. Credenciales — dos, una de cada escala

Una marca grande que reconozcan (Falabella, Aldo, Wrangler, Lee) **y** una chica
del porte del prospecto (Asia Skincare, OZ Cranberry Lab). Cuatro se leen como
currículum; dos como contexto. Solo gigantes, para una marca chica, se lee como
"son muy grandes para mí".

**No se citan de memoria: se sacan del Repertorio** (`hilvan_repertorio_leer`
con `credenciales_para=<rubro>`), que además descarta las de link roto. Citar
clientes de memoria ya provocó el peor error registrado: credenciales que no
correspondían al rubro.

- Si el Repertorio devuelve **`delRubro: false`** (no hay nada de ese rubro), o
  se **dice en el correo**, o no se usan esas credenciales. No se hacen pasar
  por del rubro.
- Sí se pueden **proponer marcas o benchmarks no verificados** —Nati y Simón
  revisan antes de enviar— pero se anota la **baja confianza** al dejarlos.

### Nunca se dice que hicimos un banco
**Casa Hiedra todavía no ha vendido un banco de video como tal** (confirmado por
Tomás, ago-2026). Es el producto que más se ofrece en los correos, así que la
tentación de respaldarlo con un caso propio es permanente — y no hay ninguno.

**Prohibido escribir "hicimos el banco de X" o "el banco que hicimos para X".**
Eso no sería una credencial inexacta: sería afirmarle algo falso a un cliente.

Lo que sí se puede, y es verdad: **ULA y Asia son la inspiración del producto**.
A ULA se le montaron doce piezas terminadas y a Asia nueve, para una misma marca
y sostenidas en el tiempo. Se cita como analogía, nunca como banco:

> ✅ *"Hicimos algo con esa lógica para Asia: contenido pensado para rendir en
> varios lanzamientos, no en uno solo."*
> ✅ *"Para ULA montamos doce piezas para la misma marca."*
> ❌ *"Hicimos el banco de contenido de ULA."*

Cuando exista el primero, se carga al Repertorio con formato `banco` y esta
regla se reemplaza.

## 4. Valor y venta — sin zona gris

**Uno de cada cuatro correos vende. Los otros tres son valor.**

**Valor** = *"un aporte real a la firma que recibe el correo, una generosidad
que se les da de partida"*.
- Es **precisar y explicar**: observación precisa de su comunicación actual
  (verificable, sin adjetivos) → qué mejoraría y por qué, en términos de su
  negocio → cómo entramos, dicho una vez y **sin gesto de venta**.
- **No es enseñar un truco para que lo hagan solos**: suena insincero —si el
  truco funcionara no estaríamos escribiendo— y no suena a Nati ni a Simón.
- Abre con lo que les pasa a ellos.
- Filtro: **si no responden, ¿entendieron mejor su propio problema?**

**Venta** = directo, **con el precio a la vista**. Abre con la oferta y cierra
pidiendo algo concreto.

### El cierre: siempre hay un pedido, la intensidad cambia
Corrección de ago-2026 sobre la regla original ("el valor cierra sin pedir
nada"): los cierres sin pedido terminaban siendo fórmulas de plantilla que se
leen como mensaje prehecho. **Ningún correo termina sin un pedido concreto** —
lo que cambia es el peso:

- **En valor**, el pedido es blando: una pregunta que se pueda contestar, pedir
  un dato, ofrecer mandar algo puntual. **Nunca** precio ni "agendemos una
  reunión".
- **En venta**, el pedido es duro y explícito (agendar, confirmar, comprar).

**Frases prohibidas** — se leen como plantilla sin insight real:
"lo dejo por si sirve" · "por si les suma" · "no para retomar la cotización" ·
"cualquier cosa, quedo atenta" · "espero que estés muy bien" · "quería
contarte" · entusiasmo fabricado.

**Cierres prohibidos** (retro 31-ago-2026: aparecieron idénticos en correos a
marcas distintas — plantilla detectada en producción):
"¿Funciona conversar de esto en [mes]?" · "Quedo atenta." / "Quedo atento."
como cierre seco. El cierre es parte del correo específico: si sirve igual
para otra marca, está mal.

### Registro
- Nunca **pedante ni sermoneador**. Nunca agresivo ni impaciente ("de una vez").
- Tiene que **sonar a Nati o a Simón, no a una IA**.
- **Nunca cifras o "hallazgos" inventados presentados como hecho.** Si es una
  lectura propia sin fuente dura, se dice: *"es una lectura nuestra, no una
  cifra medida con rigor"*. Si falta la fuente, se salta el hallazgo y se
  pregunta — no se rellena.

## 5. La escalada — frío y entrante no se escriben igual

El CRM deriva la temperatura del `origen` y la muestra en la tarjeta y en "Cómo
abordarlo". No es un matiz de tono: es otra secuencia.

| Toque | **Frío** (correo, linkedin, instagram, otro) | **Entrante** (lectura, web, feria, referido) |
|---|---|---|
| 1 | Valor, sin pedir nada | **Responder lo que preguntaron.** Corto y rápido |
| 2 | Valor otra vez (cabe el video de Tomás) | **Pedir un avance** — el interés ya está declarado |
| 3–4 | Pedir un avance | Avance concreto: una fecha, un alcance, un número |
| 5+ | Reactivar (etiqueta + pregunta de "no") | Reactivar nombrando que hubo interés y quedó en nada |

Mandarle a un entrante el correo de valor del toque 1 es no haberlo escuchado:
ya levantó la mano.

**Sin clasificar** (sin origen registrado) → se usa la secuencia fría, que es la
conservadora, y se avisa para que alguien complete la ficha.

> **Cuidado con `origen = lectura`: puede ser frío disfrazado de entrante.** La
> Lectura también sale como correo saliente de Casa Hiedra. Si el primer mensaje
> del hilo es de `noreply@casahiedra.com`, nosotros escribimos primero → es
> **frío**, aunque el origen diga lectura. Revisar el correo original antes de
> asumir que levantaron la mano.

A un **frío** hay que llevarlo a explorar un servicio concreto (por ejemplo,
banco de videos): no dejarlo en una nota vaga.

**Excepción que manda sobre todo:** si la respuesta pide **precio, plazo o
disponibilidad**, se cierra de inmediato, sin importar el número de toque.

## 6. Por qué la secuencia es así

- **Rackham (SPIN Selling)** — 35.000 llamadas, el único estudio empírico grande.
  En **ventas grandes las técnicas de cierre perjudican**: presionar temprano
  aleja al comprador. El ticket de Casa Hiedra es $1–5M CLP, así que esto manda
  sobre los blogs de cold email que dicen "pide la reunión en el correo 3".
  El objetivo de cada contacto es un **AVANCE** —un compromiso concreto que
  mueve la cosa—, no un cierre. Por eso el toque 3–4 pregunta *"¿qué tendría que
  pasar para que esto avance?"* y no *"¿te parece agendar una reunión?"*.
- **Challenger Sale** — lo que más vende es traer una **perspectiva nueva sobre
  el negocio del cliente**. Casa Hiedra ya la produce: **es La Lectura** (héroe,
  villano, vaca púrpura). Falta usarla en el outreach frío, no solo con quien
  llega por el sitio.
- **Voss** — se toma: **etiquetar** (*"parece que esto no es prioridad este
  trimestre"*), **preguntas orientadas al "no"** (*"¿es mala idea retomarlo en
  marzo?"*) y **preguntas calibradas** que empiezan con *qué* o *cómo*.

**Se rechaza explícitamente:** todo lo que fabrique urgencia o presión social
—"¿ya descartaron esto?" para gatillar FOMO, escalar al superior, crear urgencia
artificial—. Sirve una vez con un desconocido y destruye una relación que tiene
que durar años.

## 7. Checklist antes de guardar un borrador

- [ ] 80–130 palabras.
- [ ] El párrafo específico es al menos un tercio y dice algo que solo se sabe
      mirando a esa marca. Sin "etc.".
- [ ] Máximo dos credenciales **reales del Repertorio** (una grande, una chica)
      — o ninguna si el rubro no tiene nada.
- [ ] Suena a Nati o a Simón, no a IA. Sin pedantería ni entusiasmo fabricado.
- [ ] Tiene un pedido concreto, del peso que corresponda al tipo de correo.
- [ ] Nada inventado: ninguna cifra sin fuente presentada como hecho.

## 8. Advertencia sobre "los 16 toques"

El mapa de calor de la tarjeta llega a 16 porque **una consultoría se lo dijo a
Casa Hiedra**: no sale de datos propios ni de la literatura, que habla de 4–5
correos en ~21 días. Pueden ser compatibles (16 toques por todos los canales
durante meses vs. 4–5 correos en una secuencia), pero hoy no hay datos para
saberlo.

**No tratar el 16 como verdad establecida.** Cuando la Biblioteca de contactos
(`/crm/biblioteca`) tenga volumen real, su promedio empírico manda sobre
cualquier consultoría y sobre cualquier blog.

## 9. Borradores — producción y ciclo de vida (retro 31-ago-2026)

Estas reglas salen de datos reales: en jun–ago se escribieron 149 borradores y
se enviaron 32 (21%). Quedaron 117 muertos con más de una semana, 11 prospectos
acumularon 3+ borradores cada uno, y hubo borradores escritos para prospectos
descartados y para un correo que rebotaba. El cuello de botella NO es escribir:
es enviar. Un borrador que nadie envía no es trabajo hecho — es ruido que tapa
al que sí había que enviar.

1. **Un borrador vivo por prospecto.** Antes de escribir, revisar si ya existe
   uno sin enviar (`hilvan_borrador_leer`): se ACTUALIZA ese, jamás se escribe
   otro. Dos borradores para el mismo prospecto = un error de proceso.
2. **Caducidad a 7 días.** Un borrador no enviado en una semana está vencido:
   si el contexto sigue vigente se refresca (fecha, gancho, gatillo); si no,
   se borra. La bandeja de "listos" nunca supera los 10.
3. **Prioridad de escritura:** (1º) respuestas entrantes — borrador el mismo
   día, es lo único que los datos premian; (2º) seguimientos de conversación
   viva; (3º) fríos nuevos, solo con lo anterior al día.
4. **Cero borradores a canal muerto.** Prospecto descartado, correo que rebotó
   o casilla que nunca fue de una persona (bot/formulario) no recibe
   borradores. Si el canal falló, la tarea es "conseguir canal" (nota en el
   prospecto), no escribir otro correo. Ver §10.
5. **Cierres prohibidos** — ver la lista de §4: el cierre también es específico.
6. **Tope de producción: 5 borradores al día.** El equipo envía ~30 al mes;
   producir sobre esa capacidad baja la probabilidad de que CUALQUIERA salga.
7. **Cada borrador declara su gatillo.** La primera línea del insight que lo
   acompaña dice POR QUÉ hoy: "respondió el [fecha]", "3er toque de cadencia",
   "lead web de ayer". El humano decide enviar en 5 segundos o no envía nunca.

## 10. Descarte real de canales muertos

Un prospecto cuyo correo REBOTA (mailer-daemon) o que resultó ser un bot /
casilla no atendida no es un prospecto: es una fila que ensucia la cadencia y
los vencidos. El operador no descarta (regla de oro), pero SÍ debe:

1. Dejar **nota bloqueada** en el prospecto con la evidencia (fechas de los
   rebotes, o por qué se concluye que es bot).
2. **Proponer el descarte** con `hilvan_mover_etapa { etapa: 'descartado',
   como_propuesta: true, evidencia: '...' }` — el humano aprueba en la Bandeja.
3. Si hay un canal alternativo con fuente real (IG visible en el sitio,
   teléfono publicado), anotarlo en la nota como siguiente paso ANTES de
   proponer descartar. Sin fuente no se inventa canal.

Caso que originó la regla: Cándida y Narcisa — 3 rebotes (18–20 ago) y el
sistema siguió proponiendo "insistir" al mismo correo muerto.
