# Catálogo sonoro de Hilván

> Lista completa de sonidos a incorporar, con **nombre de token**, carácter
> buscado y términos de búsqueda para Epidemic Sound / Artlist.
> Complemento de `auditoria.md`.

---

## Dirección de arte sonora

Hilván es la herramienta interna de una **productora audiovisual**. El sonido
tiene que sonar a eso, no a videojuego ni a app bancaria.

**Buscar:** madera, fieltro, cinta, mecanismos analógicos, marimba/kalimba con
mucho aire, obturadores, claquetas, papel. Ataques suaves, colas cortas y
naturales.

**Evitar:** sintetizadores brillantes, arpegios de videojuego, "coin/level up",
campanitas de notificación de iOS, whooshes exagerados, cualquier cosa con
reverb larga.

### Especificación técnica
| Parámetro | Valor |
|---|---|
| Formato | `.mp3` 128 kbps (universal) — opcional `.webm/opus` como primario |
| Canales | Mono (salvo celebraciones, que pueden ser estéreo) |
| Sample rate | 44.1 kHz |
| Loudness | Normalizar micro-sonidos a **−22 LUFS**, confirmaciones a −20, celebraciones a −16 |
| Silencio inicial | 0 ms — recortar al ataque (cualquier delay se percibe como lag) |
| Peso objetivo | < 15 KB micro · < 60 KB celebración · **< 500 KB el set completo** |
| **Afinación** | **Todo el set en una sola tonalidad — Do mayor** (ver "Lecciones de casino") |
| Ubicación | `public/sounds/<token>.mp3` |

Los tokens de abajo son el nombre de archivo **y** la clave del evento en
`lib/momentos.ts`.

---

## Lecciones del diseño sonoro de casinos

Las tragamonedas son el estado del arte en refuerzo sonoro: nadie ha invertido
más plata en que apretar un botón se sienta bien. El oficio es robable; el
objetivo no.

La diferencia práctica —no solo ética— es el **horizonte**. Un casino optimiza
una sesión con un desconocido: le da igual que mañana no vuelvas. Hilván tiene
que aguantar a las mismas 5 personas durante años. Eso cambia qué mecánicas
funcionan: las que fabrican señal se descubren en dos semanas, y cuando el
equipo aprende que la celebración no significa nada, **se pierde el canal
completo**. La honestidad acá es lo que hace que el sistema siga funcionando
en el mes seis.

### Lo que sí robamos

**1. Una sola tonalidad para todo el sistema** ← *la más valiosa*
Las tragamonedas antiguas afinaban deliberadamente sus melodías en **Do
mayor**, asociado a una sensación resuelta y positiva; el objetivo era que una
sala entera de máquinas sonando a la vez fuera armónica en vez de cacofónica.

Aplica directo: en Hilván los sonidos **se van a superponer** —carga masiva de
gastos, Kanban con varios movimientos, el viewer recibiendo cambios por
Realtime. Si cada uno viene de una biblioteca distinta con su propia
afinación, el resultado es basura sonora. Afinando los 34 a Do mayor, cualquier
combinación simultánea suena como un acorde. Es medible y automatizable con
`ffmpeg`: detectar la fundamental de cada archivo y desplazarla al grado más
cercano de la escala.

**2. La recompensa escala con la magnitud real**
El sonido de pago de una tragamonedas crece con el premio. Versión honesta:
un pago de $50.000 y uno de $5.000.000 **no pueden sonar igual**. La
intensidad se ata al monto, que es dato real. Aplica a `win-pago`,
`win-cierre` y `win-factura`.

**3. El "rolling" proporcional**
La cascada de monedas dura lo que dura el premio. Versión honesta: el tick del
contador de `ch-monto-hero` corre mientras el número sube; monto más grande =
celebración más larga, sin inventar nada. Es de las cosas más satisfactorias
del set y sale gratis del `count-up` que ya está en el catálogo de animaciones.

**4. Latencia cero**
Por debajo de ~100 ms o el cerebro no lo lee como consecuencia de su acción.
Obliga a precargar el audio y a disparar en el `click`, no después de que
responda el servidor. Esto ya condiciona el diseño de `lib/momentos.ts`:
**el sonido va en el optimistic update, no en el `await`.**

**5. Variedad para que no fatigue**
Las máquinas rotan variantes del mismo evento para que 300 repeticiones no
cansen. Aplica a `ok-registrar` y `ok-guardar`, que se van a escuchar decenas
de veces al día: 2–3 variantes que alternan al azar. *(Ojo: variar el sonido
de un evento fijo no es lo mismo que variar la recompensa — ver abajo.)*

**6. Cada input tiene respuesta**
En una tragamonedas no existe apretar algo y que no pase nada. Hoy en Hilván
sí existe, en casi toda la app.

### Lo que no transfiere

| Mecánica | Por qué no funciona acá |
|---|---|
| **Refuerzo de razón variable** (recompensa aleatoria) | Es el motor adictivo real de la tragamonedas. En una herramienta de trabajo rompe el vínculo entre acción y señal: si celebrar es aleatorio, el equipo deja de leer la celebración como información y la empieza a ignorar |
| **Near-miss** (los rodillos que frenan justo al lado) | Fabrica una emoción sobre un evento que no ocurrió. Primo honesto y mejor: **proximidad real a una meta real** — "toque 9 de 14" con el promedio empírico de la Biblioteca. La tensión es verdadera |
| **Pérdidas disfrazadas de ganancias** | Celebrar algo que no fue un logro. Contradice de frente el principio de honestidad del proyecto |
| **Sin relojes, sin ventanas, planta laberinto** | Hilván debe hacer exactamente lo contrario. El **cierre del día** (R12) es el movimiento anti-casino: decirle al equipo "listo, ya está, hasta mañana". Es lo que hace que la herramienta se sienta de ellos y no en contra de ellos |

---

## Grupo A — imprescindibles (12)

Con estos 12 la app ya se siente viva. Es el set mínimo para el primer envío.

| # | Token | Evento | Carácter buscado | Dur. | Búsqueda en Epidemic / Artlist |
|---|---|---|---|---|---|
| A1 | `ui-tap` | Click en botón primario | Golpe seco de madera, muy corto, sin tono | 40 ms | `ui click wood`, `soft button tap`, `minimal ui click` |
| A2 | `ui-toggle-on` / `ui-toggle-off` | Switch, checkbox, filtro | Par asimétrico: on más agudo que off | 60 ms | `toggle switch soft`, `ui switch on off` |
| A3 | `ok-guardar` | Guardado simple (notas, edición) | Nota única de fieltro, cálida, discreta | 180 ms | `soft mallet note`, `felt piano single note`, `ui confirm soft` |
| A4 | `ok-registrar` | Contacto CRM, gasto cargado, ítem agregado | Tick con textura, satisfactorio, repetible sin cansar | 90 ms | `wood tick`, `pen click`, `marimba short note`, `data entry click` |
| A5 | `ok-crear` | Se creó una entidad nueva (cliente, equipo, rodaje) | Dos notas ascendentes, tibias | 300 ms | `soft positive confirm`, `two note up marimba` |
| A6 | `ok-enviar` | Cotización / citación / correo enviado | Aire que sale, papel deslizando, sin whoosh dramático | 350 ms | `paper slide`, `send message soft`, `subtle whoosh short` |
| A7 | `prog-avance` | Mover etapa (Kanban CRM, estado de reserva) | Dos notas ascendentes con "asiento" al final | 250 ms | `progress step up`, `wooden step`, `positive advance` |
| A8 | `win-cierre` | **Cliente confirmado / cotización aprobada** | Acorde ascendente, orgánico, orgulloso, sin épica de tráiler | 1.2 s | `warm success chime`, `organic achievement`, `marimba success arpeggio` |
| A9 | `win-pago` | **Pago recibido** — el momento cumbre | El más pleno del set. Cuerpo grave + resolución brillante | 1.5 s | `rewarding success`, `deep positive resolve`, `reward collect warm` |
| A10 | `alert-error` | Falló una operación | Nota grave breve, neutra. **Nunca "buzz" de castigo** | 200 ms | `soft error tone`, `subtle negative ui`, `low wood thud` |
| A11 | `alert-atencion` | Validación / falta un campo | Doble tap seco, sin tono | 150 ms | `ui warning subtle`, `double tap wood` |
| A12 | `alert-lead` | **Entró un lead nuevo por la web** | Distinto a todo lo demás. Debe hacer levantar la cabeza | 700 ms | `notification warm`, `incoming positive alert`, `soft bell notification` |

---

## Grupo B — completan el sistema (12)

| # | Token | Evento | Carácter buscado | Dur. | Búsqueda |
|---|---|---|---|---|---|
| B1 | `ui-panel-open` / `ui-panel-close` | Modal, drawer, sidebar móvil | Aire suave, par simétrico invertido | 200 ms | `panel open close soft`, `menu open air` |
| B2 | `ui-nav` | Cambio de sección en el sidebar | Tap más apagado que `ui-tap` | 50 ms | `navigation tick`, `menu select soft` |
| B3 | `ok-eliminar` | Eliminación confirmada | Descendente, neutro, **sin drama** | 200 ms | `delete soft`, `descending two note`, `remove item ui` |
| B4 | `ok-upload` | Archivo / comprobante subido | Cinta que asienta, sensación de "quedó guardado" | 400 ms | `upload complete soft`, `file drop`, `tape click` |
| B5 | `ok-copiar` | Copiar link al portapapeles | Tick metálico mínimo | 60 ms | `copy ui click`, `light metallic tick` |
| B6 | `prog-check` | Marcar ítem de checklist (rodaje, maleta) | Lápiz sobre papel + tick | 120 ms | `checkbox check`, `pencil mark`, `checklist tick` |
| B7 | `prog-retroceso` | Mover etapa hacia atrás | `prog-avance` invertido, sin connotación negativa | 250 ms | `step back soft`, `descending neutral` |
| B8 | `prog-barra-llena` | Meta diaria completada | Barrido corto que resuelve en una nota | 800 ms | `progress complete`, `bar fill success`, `short riser resolve` |
| B9 | `win-factura` | Factura emitida | Sello/estampa + nota. Sensación de "queda registrado" | 600 ms | `stamp impact`, `official seal`, `rubber stamp` |
| B10 | `win-hito` | Cierre #10 / #50 / racha mantenida | Versión ampliada de `win-cierre`, con capa extra | 2 s | `celebration warm`, `milestone achievement organic` |
| B11 | `conciliar-match` | **Movimiento conciliado con su gasto** | *Encaje*: dos piezas que calzan. Corto, mecánico, adictivo | 180 ms | `puzzle piece fit`, `mechanical latch`, `snap into place`, `lock click` |
| B12 | `parse-reconocido` | El parser leyó la factura y autocompletó | Barrido de escaneo + confirmación | 500 ms | `scan complete`, `data recognized`, `sci fi scan short` |

---

## Grupo C — carácter y marca (10)

Se usan poco, por eso pueden ser más memorables. Aquí es donde Hilván deja de
parecer software genérico.

| # | Token | Evento | Carácter buscado | Dur. | Búsqueda |
|---|---|---|---|---|---|
| C1 | `ch-inicio` | Entrar a la app tras el login | Sting de marca. Sobrio, 1 s, se escucha 1 vez al día | 1 s | `logo sting minimal`, `brand ident short`, `warm intro sting` |
| C2 | `ch-claqueta` | Publicar un rodaje / enviar citaciones | **Claqueta real.** El sonido más de marca posible | 300 ms | `clapperboard`, `film slate clap` |
| C3 | `ch-obturador` | Generar PDF / capturar sticker | Obturador de cámara fotográfica mecánica | 200 ms | `camera shutter mechanical`, `slr shutter` |
| C4 | `ch-scan-qr` | Escanear QR de maleta en `/m/[codigo]` | Beep de lector de código. Corto y limpio | 120 ms | `barcode scanner beep`, `qr scan confirm` |
| C5 | `ch-proyector` | (opcional) Carga larga / export pesado | Proyector de 16mm corriendo, en loop muy bajo | loop | `film projector loop`, `16mm projector` |
| C6 | `ch-cinta` | Cambio de mes / período en Financiero | Rebobinado corto de cinta | 300 ms | `tape rewind short`, `cassette wind` |
| C7 | `win-rodaje-cerrado` | Rodaje marcado como finalizado | Cierre cálido con cola. "Es un wrap" | 1.5 s | `warm resolve`, `completion chord organic` |
| C8 | `win-meta-dia` | Meta diaria cumplida | Remate breve y alegre, sin exceso | 900 ms | `daily goal complete`, `short reward warm` |
| C9 | `amb-ui-hover` | (evaluar) Hover en tarjeta de módulo | Roce apenas audible. **Riesgo alto de molestar** | 30 ms | `ui hover subtle`, `micro texture tick` |
| C10 | `ch-salida` | Cerrar sesión | `ch-inicio` invertido y más apagado | 800 ms | *(derivar de C1 en edición)* |

---

## Resumen de conteo

| Grupo | Sonidos | Archivos (con pares on/off) |
|---|---|---|
| A — imprescindibles | 12 | 13 |
| B — completan | 12 | 13 |
| C — carácter | 10 | 10 |
| **Total** | **34** | **36** |

---

## Sobre las bibliotecas (Epidemic Sound / Artlist)

### ¿Hay API?
**Sí, ambas — pero no sirven para este caso.**

- **Epidemic Sound** tiene una *Partner Content API* con acceso a 250.000+
  efectos, e incluso un servidor MCP en beta. El acceso está **cerrado detrás
  de un acuerdo de partnership**: hay que hablar con un partner manager y
  firmar; las credenciales las entrega el Developer Portal después. No es
  autoservicio con la suscripción normal.
- **Artlist** ofrece integración vía *Music API* dentro del **plan Enterprise**,
  pensada para plataformas que revenden o integran audio a escala.

Para 36 archivos, una sola vez, ninguna de las dos vale la gestión: **bajarlos
a mano desde la web es más rápido que conseguir el acceso.** Yo puedo dejar
listo el sistema, los tokens y los slots; tú bajas los archivos con los
términos de búsqueda de las tablas y los dejas en `public/sounds/` con el
nombre del token.

### Nota de licencia — revisar antes de publicar
Las suscripciones de Epidemic y Artlist están escritas para **contenido
publicado** (videos, campañas, podcasts, sitios). Incrustar audio **dentro de
un producto de software** es un uso distinto y suele requerir licencia
enterprise.

Hilván es una **herramienta interna, no se vende ni se distribuye**, lo que
deja el riesgo muy bajo — pero conviene confirmarlo por escrito con soporte
antes de que la app sea pública o se le venda a alguien. **Yo no puedo
verificar los términos de tu cuenta**; es una consulta de un correo.

---

## Bibliotecas gratuitas — la vía recomendada para la v1

No hace falta grabar nada ni tocar Epidemic/Artlist. Hay fuentes gratuitas,
comerciales y sin atribución que cubren el catálogo completo.

### Las tres que resuelven todo

**1. SND — `snd.dev`** · *la base del sistema*
Biblioteca de sonidos de interfaz hecha por Dentsu **específicamente para
desarrolladores**. Trae exactamente los 13 tipos que necesitamos —Tap,
Disabled, Toggle, Pointer, Swipe, Select, Modal, Process, Type, Notification,
Caution, Alert, Celebration— en **3 kits temáticos: `sine`, `piano` e
`industrial`**. Gratis para uso comercial y no comercial, crédito apreciado
pero **no requerido**. Se baja como ZIP o se instala con `npm i snd-lib`.

→ **El kit `piano` es prácticamente nuestra dirección de arte.** Cubre casi
todo el Grupo A y buena parte del B de una sola vez. Empezar por acá.
*(Nota: bajar los archivos y servirlos desde `public/sounds/` en vez de usar
la librería npm — así mantenemos un solo reproductor y el control de volumen
por familia.)*

**2. Sonniss — GDC Game Audio Bundle** · *el foley del Grupo C*
Paquete anual de 30+ GB, royalty-free, **sin atribución**, comercial
permitido, uso ilimitado y de por vida. Acá está el material real que
necesitamos para el carácter de marca: **claqueta, obturador, papel, madera,
mecanismos, cinta**. Es la forma de tener el Grupo C sin montar una sesión de
foley.
*Restricciones: no revender los sonidos sueltos, no atribuirse la autoría, y
no usarlos para entrenar modelos de IA.*

**3. Kenney — UI Audio** · *relleno seguro*
50 archivos de interfaz en **CC0 puro** (dominio público, sin atribución, sin
condiciones). Es el fallback más limpio que existe para cualquier hueco de
clicks y toggles.

### Otras, con matices

| Fuente | Licencia | Sirve para | Ojo |
|---|---|---|---|
| **Freesound** (filtro CC0) | CC0 si se filtra | Huecos puntuales; 700k+ sonidos | Las licencias varían **por sonido** — hay que filtrar CC0 y verificar uno por uno |
| **Material Design Sound Resources** (Google) | CC-BY 4.0 | Sonidos de UI bien diseñados | **Exige crédito visible** a Google |
| **ZapSplat** | Gratis con atribución | Catálogo amplio | El tier free **obliga a acreditar "ZapSplat"**; se quita pagando Premium |
| **Mixkit** | Free, sin atribución | Alternativa general | No pude leer el texto de la licencia de SFX (página caída) — **verificar antes de usar** |
| **Pixabay** | Pixabay Content License | Alternativa general | No pude leer los términos directamente (bloqueó el acceso) — **verificar antes de usar** |
| **Dev_Tones** (RCP Tones) | Comercial, sin atribución | 630+ sonidos de UI | **De pago** (tier gratis: 8 sonidos). Prohíbe usarlo en apps centradas en sonido o app-builders — Hilván no lo es |

### Estado: material bajado y medido (ago 2026)

En `public/sounds/_candidatos/` (gitignored) hay **133 archivos** medidos con
`ffprobe`/`ffmpeg`:

- **SND** — los 3 kits vienen como *audio sprite* + JSON de tiempos; se
  cortaron los 82 sonidos individuales con `ffmpeg`.
- **Kenney UI Audio** — 51 archivos, licencia CC0 confirmada en el `License.txt`.

Carácter medido de cada fuente (centroide espectral = brillo):

| fuente | n | centroide medio | dur. media |
|---|---|---|---|
| **SND kit01** | 28 | **1714 Hz** — el más oscuro | 237 ms |
| SND kit02 | 27 | 2054 Hz | 689 ms |
| SND kit03 | 27 | 2458 Hz | 349 ms |
| Kenney | 51 | 2681 Hz — el más brillante | 262 ms |

→ **El kit01 es el más cercano a la dirección "madera y fieltro"**, no el kit02
pese a que el sitio etiqueta uno de los kits como "piano". El dato manda sobre
la etiqueta.

**Banco de pruebas**: `public/sounds/_candidatos/banco.html` — autocontenido,
se abre con doble clic (sin servidor ni sesión). Presenta los 34 tokens con
hasta 8 candidatos cada uno, ordenados por cercanía a la duración objetivo y,
a igualdad, por timbre más oscuro. Reproduce, compara A/B, guarda las
elecciones en `localStorage` y exporta el mapeo final en JSON.

> **Nota sobre el LUFS**: la medición de loudness integrado (EBU R128) devuelve
> −70 en todos los archivos porque su puerta descarta material bajo ~400 ms.
> Para sonidos de UI hay que medir con **RMS y pico**, no con LUFS. La
> normalización final debe dejar **−1.5 dB de headroom**: los archivos de
> Kenney vienen a 0 dBFS y el encode a mp3 sobrepasa, generando clipping.

### Plan recomendado para la v1
1. Bajar el kit **`piano` de SND** → cubre la mayoría del Grupo A y B.
2. Completar los huecos con **Kenney UI Audio (CC0)**.
3. Sacar el Grupo C del **bundle de Sonniss** (claqueta, obturador, scan, cinta).

Cero costo, cero atribución obligatoria, cero grabación. Grabar los propios
queda como **mejora de v2**, cuando ya sepamos qué sonidos aguantan el uso
diario y valga la pena reemplazar solo esos.

---

## Cómo se conecta después

Cada token de este catálogo es una clave del bus de momentos (R1 de la
auditoría). El sistema cae a los tonos sintéticos actuales de `lib/sfx.ts` si
un archivo falta, así que **se puede construir todo antes de tener un solo
sonido** e ir llenando `public/sounds/` a medida que aparezcan.

*Casa Hiedra · Hilván · catálogo sonoro · ago 2026*
