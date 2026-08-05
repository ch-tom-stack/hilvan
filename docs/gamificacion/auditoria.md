# Gamificación de Hilván — auditoría de experiencia (ago 2026)

> Alcance: **toda la app**, no solo el CRM. El doc de CRM
> (`docs/crm/gamificacion.md`) sigue vigente como catálogo de mecánicas de ese
> módulo; este documento es la capa de arriba: qué se siente hoy, qué falta, y
> el sistema que hay que construir para que Hilván sea agradable de habitar.

Objetivo declarado (Tomás): *"que mi equipo realmente disfrute de ocupar Hilván
y que den ganas de quedarse con esto abierto."*

---

## 1. Diagnóstico — qué se siente hoy

### 1.1 El sonido existe en 1 de 12 módulos
`lib/sfx.ts` (3 sonidos: `playTick`, `playAdvance`, `playWin`) y
`lib/celebrate.ts` (confeti) se usan **solo** en `PipelineCRM.tsx` y
`FichaProspecto.tsx`. El otro 92% de la app es mudo.

Además los 3 sonidos son osciladores de Web Audio: correctos técnicamente
(cero peso, cero dependencias), pero suenan a sintetizador de los 80. Sirven
como *fallback*, no como identidad sonora de una productora audiovisual.

### 1.2 Toda acción exitosa se siente igual
Hay **45 confirmaciones de éxito** en la app y las 45 son el mismo toast gris
de 3 segundos. La consecuencia: no hay jerarquía emocional.

| Lo que pasó | Cómo se siente hoy |
|---|---|
| Borraste una fila de un bundle | toast gris |
| Registraste un contacto | toast gris |
| Se emitió una factura | toast gris |
| **Entró un pago** | **toast gris** |

El evento más importante que le puede pasar a Casa Hiedra —que llegue plata—
se celebra exactamente igual que borrar un ítem. Ahí está el mayor desperdicio
de la app, y no cuesta casi nada arreglarlo.

### 1.3 El Dashboard no dice nada
`app/(dashboard)/dashboard/page.tsx` es la primera pantalla del día y es una
grilla estática de 6 links + un mini calendario que dice *"El módulo de
calendario completo estará disponible próximamente"* — cuando el módulo de
Calendario **ya existe y está activo**. La sala de entrada está desactualizada
y vacía.

Ni una sola cifra viva: no hay rodaje de hoy, ni por cobrar, ni leads sin
tocar, ni nada que dé una razón para volver.

### 1.4 La app se siente lenta aunque no lo sea
Hay **un solo** `loading.tsx` en toda la app (`/costos/admin`). Cada navegación
es un salto en blanco. La percepción de velocidad es placer: un skeleton que
aparece en 50ms se siente más rápido que una pantalla real que aparece en
400ms.

### 1.5 No hay vocabulario de movimiento
`globals.css` tiene **2 transiciones** en total y **cero** `@keyframes`. No
existen: entradas escalonadas de listas, números que cuentan, barras que
crecen, filas que se resaltan al cambiar. Todo aparece de golpe.

### 1.6 Los vacíos son callejones sin salida
30 mensajes del tipo *"No hay equipos registrados aún"*. Un estado vacío es el
mejor momento para invitar (*"Registra tu primer equipo → "*) o para enseñar.
Hoy solo informan la nada.

### 1.7 Nada recuerda lo que hiciste
No existe ninguna superficie donde el usuario vea su propio esfuerzo: ni
racha, ni "tu semana", ni historial personal. El trabajo desaparece apenas se
guarda. Ese es el motivo estructural de que no den ganas de volver.

---

## 2. Los 12 momentos que hay que amplificar

De todo el mapa de acciones, estos son los que cargan emoción real. Ordenados
por potencia:

| # | Momento | Dónde | Hoy | Debería ser |
|---|---|---|---|---|
| 1 | **Pago recibido** | `PanelFacturacion` | toast | El momento cumbre de la app: sonido pleno + confeti + monto que cuenta |
| 2 | **Cliente confirmado / cotización aprobada** | CRM + Cotizaciones | confeti solo en CRM | Celebración completa en ambos lados |
| 3 | **Movimiento conciliado** | `/financiero/pagar`, conciliación | nada | *Encaje*: la tarea más tediosa es la que más necesita recompensa |
| 4 | **Factura del SII reconocida por el parser** | `/api/parse-factura` | nada | Momento mágico: campos que se autocompletan uno a uno + sonido de "reconocido" |
| 5 | **Entra un lead por la web** | `lib/lead-inbound.ts` | nada | Aviso emocionante, no burocrático (ver `project_leads_webhook`) |
| 6 | **Contacto registrado (CRM)** | `QuickContacto` | tick sintético | Tick con textura + contador que late |
| 7 | **Avance de etapa** | Kanban CRM, reservas rental | tick sintético | Sonido de avance + tarjeta que asienta |
| 8 | **Rodaje publicado / citaciones enviadas** | `/rodaje/[id]/citaciones` | toast | Claqueta. Es literalmente el "acción" de la productora |
| 9 | **Escaneo de QR de maleta** | `/m/[codigo]` | nada | Beep de lector — satisfacción pura, gratis |
| 10 | **Cotización enviada al cliente** | `ConstructorCotizacion` | toast | Sonido de envío + sello visual |
| 11 | **Gasto cargado / comprobante subido** | Centro de costos | toast | Tick de acumulación (suben de a muchos) |
| 12 | **Meta diaria / racha** | (no existe) | — | Barra que se llena + remate |

---

## 3. Recomendaciones — más allá del sonido

Priorizadas por **impacto ÷ esfuerzo**. Esfuerzo: **S** horas · **M** medio día
· **L** varios días.

### Nivel 0 — la infraestructura (hacer primero)

**R1 · `lib/momentos.ts`: un bus de momentos** · **M**
El error a evitar es ir componente por componente pegando `playX()`. Un solo
módulo declara el catálogo de eventos y cada uno resuelve **sonido +
animación + toast + intensidad** de una vez:

```ts
momento('pago.recibido', { monto })   // → sonido win, confeti, toast de hito
momento('gasto.creado')               // → tick, toast normal
```
Beneficio: cambiar el diseño sonoro de toda la app es editar un archivo, y las
preferencias (silencio, volumen, reduced-motion) se respetan en un solo lugar.

**R2 · `lib/sfx.ts` v2 — assets reales con fallback** · **M**
Reproductor de archivos desde `public/sounds/`, precarga perezosa, volumen por
familia, desbloqueo del `AudioContext` al primer gesto, y caída a los tonos
sintéticos actuales si el archivo no cargó. Ver `sonidos.md` para el catálogo.

**R3 · Preferencias en `/perfil`** · **S**
Hoy el toggle de sonido vive escondido en el header del CRM y solo en
`localStorage`. Debe ser: sonido on/off, volumen (3 niveles), celebraciones
on/off, y respeto automático de `prefers-reduced-motion`. Persistido en
`profiles` para que viaje entre dispositivos.

**R4 · Vocabulario de movimiento en `globals.css`** · **S**
6 keyframes que cubren el 90% de los casos: `ch-fade-up` (entrada),
`ch-pulse` (algo cambió), `ch-count` (número), `ch-fill` (barra),
`ch-settle` (soltar tarjeta), `ch-flash-row` (fila actualizada). Con
`prefers-reduced-motion: reduce` desactivando todo.

### Nivel 1 — impacto inmediato

**R5 · Jerarquía de confirmaciones (3 niveles)** · **S**
- *Micro*: sin toast, solo el elemento que cambia de estado (guardar notas, borrar ítem). Menos ruido visual = más señal.
- *Normal*: toast actual + tick.
- *Hito*: toast grande con tipografía display + sonido pleno + confeti (pago, cierre, aprobación).

**R6 · Celebrar donde está el dinero** · **S**
Llevar confeti + `win` a: pago registrado, factura emitida, cotización
aprobada, rodaje publicado. Es reutilizar lo que ya existe en el CRM.

**R7 · Skeletons en las 8 rutas más pesadas** · **M**
`/cotizaciones`, `/financiero/*`, `/costos/admin`, `/equipos`, `/crm`,
`/rodaje`, `/clientes`, `/colaboradores`. Percepción de velocidad.

**R8 · Números que cuentan** · **S**
Todo monto grande (Estado de Resultados, por cobrar, total de cotización)
anima de 0 al valor en ~600ms al aparecer. Es el truco más barato que existe
para que una cifra se sienta importante.

**R9 · Dashboard vivo** · **M**
Reemplazar la grilla estática por un "estado de la casa" del día:
rodaje de hoy · por cobrar · leads sin tocar · aprobaciones esperando · tu
racha · el cierre de la semana. Y sacar el mini calendario "Próximamente" —
el módulo existe hace meses.

### Nivel 2 — el hábito

**R10 · Racha y "tu semana"** · **M**
Días seguidos con actividad + panel de lunes con lo logrado. Computado en
vivo (sin tabla nueva) desde `crm_interacciones`, `rendicion_gastos` y
`cotizaciones`. Es lo que convierte uso en costumbre.

**R11 · Meta diaria configurable** · **M**
Solo donde tiene sentido medir esfuerzo (contactos del CRM, gastos cargados
en cierre de mes). Barra que se llena, remate al completar.

**R12 · Cierre del día** · **S**
A partir de las 19:00, un panel discreto: *"Hoy: 12 contactos, 2 rodajes
cerrados, $1.4M facturados"*. Cerrar el loop del día es lo que hace que
mañana quieras volver a abrirlo.

**R13 · Estados vacíos que invitan** · **S**
Los 30 *"No hay X"* pasan a ser una acción: título display + una línea de por
qué importa + botón. Cero costo, mucha diferencia de tono.

### Nivel 3 — carácter

**R14 · Reconocimiento de equipo (opt-in)** · **M**
Cuando alguien cierra un cliente o cobra una factura, aviso al equipo. Sin
ranking, sin presión: solo *"Natalia cerró a X"*. El refuerzo social es el
más potente y el más fácil de arruinar — que sea celebración, nunca marcador.

**R15 · Transiciones de página** · **S**
Next 16 soporta View Transitions. Un cross-fade de 150ms entre rutas elimina
la sensación de "recargar" y hace que la app se sienta una sola pieza.

**R16 · Micro-interacciones coherentes con la marca** · **S**
Sin sombras ni radios (regla inmutable): la "elevación" se hace con el borde
que se enciende a `ch-green/40` y el fondo que sube un escalón. Estado
`:active` de botón con un desplazamiento de 1px. Detalles que hacen que
clickear sea agradable.

**R17 · Rituales de marca** · **S**
Un sting de 1s al entrar tras el login. La claqueta al abrir un rodaje. El
obturador al generar un PDF. Son 3 sonidos que cuentan quién es Casa Hiedra
mejor que cualquier feature.

---

## 4. Principios (heredados del doc de CRM, válidos para toda la app)

- **Honestidad**: se celebra el éxito real, nunca métricas infladas.
- **Sin dark patterns**: ni culpa, ni presión, ni FOMO. Refuerzo positivo.
- **Opt-out siempre** y `prefers-reduced-motion` respetado.
- **Estética Casa Hiedra**: sobrio, sin `border-radius`, sin `box-shadow`, sin
  emoji en la UI, tokens `ch-*`. El deleite viene del timing y del sonido, no
  de adornos.
- **Sin librerías pesadas**: animación en CSS/DOM propio; audio en `<audio>` /
  Web Audio nativo.
- **El sonido nunca es obligatorio**: la app debe sentirse igual de buena en
  silencio. El sonido es la capa de arriba, no la muleta.

---

## 4 bis. Estado de la infraestructura (ago 2026) — R1–R4 construidos

| Archivo | Qué hace |
|---|---|
| `lib/preferencias.ts` | Sonido on/off, volumen (bajo/medio/alto), celebraciones on/off. localStorage + evento para mantener sincronizadas todas las superficies. Migra el toggle original `ch_sfx` del CRM. Expone `movimientoReducido()` |
| `lib/sfx.ts` | **v2**: reproduce `public/sounds/<token>.mp3` con Web Audio; ganancia por familia (micro/confirmación/celebración/alerta); throttle de 45 ms contra el "ametrallamiento"; precarga; desbloqueo al primer gesto. **Cae a tono sintético si el archivo no existe** — y el sintético está afinado en Do mayor, igual que el set final |
| `lib/celebrate.ts` | Confeti con 3 intensidades (chico/normal/hito) + `montoHero()`: el monto sube, cuenta desde 0 y se disuelve |
| `lib/momentos.ts` | **El bus.** 30 momentos declarados; cada uno resuelve sonido + celebración + toast en un solo lugar. Escala la intensidad según el monto real |
| `lib/animar.ts` | `animar(el, 'ch-pulse')` y `contar(el, valor, formato)` |
| `app/globals.css` | 10 keyframes + clases `ch-*`, con `prefers-reduced-motion` apagando todo. **Aditivo: no toca `@theme` ni los tokens** |
| `components/perfil/PreferenciasFeedback.tsx` | Sección "Sonido y movimiento" en `/perfil`, con botón de prueba |
| `components/ui/AudioBootstrap.tsx` | Montado en el layout raíz; abre el AudioContext al primer gesto |

**Clave del diseño**: el fallback sintético permite cablear la app entera antes
de tener un solo archivo de audio. Cada `.mp3` que se agrega a `public/sounds/`
con el nombre del token mejora el resultado **sin tocar una línea de código**.

Compatibilidad: `playTick` / `playAdvance` / `playWin` / `sfxEnabled` /
`setSfxEnabled` siguen exportados, así que el CRM sigue funcionando sin
cambios. Código nuevo: usar `momento()`.

Pendiente de R3: persistir las preferencias en `profiles` para que viajen entre
dispositivos (requiere migración SQL + grants). Hoy son por dispositivo.

---

## 5. Orden de trabajo propuesto

1. **R1–R4** — infraestructura (bus de momentos, sfx v2, preferencias, keyframes).
2. Conseguir y montar los sonidos del **Grupo A** de `sonidos.md` (12 archivos).
3. **R5, R6, R8** — jerarquía, celebrar el dinero, números que cuentan.
4. **R7, R13** — skeletons y estados vacíos.
5. **R9** — Dashboard vivo.
6. **R10–R12** — racha, metas, cierre del día.
7. **R14–R17** — equipo, transiciones, carácter.

*Casa Hiedra · Hilván · auditoría de gamificación · ago 2026*
