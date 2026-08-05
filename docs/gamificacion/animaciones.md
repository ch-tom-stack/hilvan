# Catálogo de animaciones de Hilván

> Dónde falta movimiento que dé feedback positivo. Mismo formato que
> `sonidos.md`: cada entrada tiene **token**, evento, qué hace y dónde va.
> Complemento de `auditoria.md`.

---

## Punto de partida — lo que hay hoy

Medición sobre el código actual:

| Recurso de movimiento | Usos en la app |
|---|---|
| `transition-colors` | **538** |
| `transition-opacity` | 10 |
| `transition-all` | 6 |
| `transition-transform` | **4** |
| `animate-pulse` | 8 |
| `@keyframes` propios en `globals.css` | **0** |

La app tiene **una sola idea de movimiento**: el color cambia al pasar el
mouse. Nada entra, nada crece, nada se mueve, nada acusa recibo. Los 538
`transition-colors` demuestran que el cuidado existe — solo que se aplicó
entero a un único eje.

---

## Dirección de arte del movimiento

Las reglas inmutables (sin `border-radius`, sin `box-shadow`) obligan a algo
que además es más elegante: **la jerarquía no se expresa con profundidad, se
expresa con tiempo**. Sin sombras, "elevar" es encender el borde. Sin rebotes
de juguete, "celebrar" es un gesto breve y seguro.

| Parámetro | Valor |
|---|---|
| Easing por defecto | `cubic-bezier(0.16, 1, 0.3, 1)` — salida rápida, llegada suave |
| Micro-feedback | 120–200 ms |
| Entradas de contenido | 250–350 ms |
| Celebraciones | 600–1200 ms |
| Stagger entre ítems de lista | 25–40 ms, tope de 12 ítems |
| Desplazamientos | máximo **8 px** — es una app de trabajo, no una landing |
| Escalas | máximo **1.04** — nada debe "saltar" |

**Regla no negociable:** todo lo de este documento se apaga bajo
`@media (prefers-reduced-motion: reduce)` y bajo el switch de preferencias del
perfil (R3). El estado final siempre es el mismo; lo único que cambia es si se
transita hacia él o se llega de golpe.

---

## Grupo A — base del sistema (7)

Se definen una vez en `globals.css` y sirven a toda la app. Sin esto, el resto
son parches.

| # | Token | Evento | Qué hace | Dónde |
|---|---|---|---|---|
| A1 | `ch-fade-up` | Aparece contenido | Opacidad 0→1 + 6 px hacia arriba, 300 ms | Toda página, card y sección |
| A2 | `ch-stagger` | Aparece una lista | `ch-fade-up` con 30 ms de retraso incremental | Tablas, Kanban, grillas de equipos/clientes/cotizaciones |
| A3 | `ch-page` | Cambio de ruta | Cross-fade de 150 ms con View Transitions (Next 16) | Global. Elimina el parpadeo blanco entre módulos |
| A4 | `ch-shimmer` | Cargando | Barrido diagonal sobre el skeleton | Reemplaza los 8 `animate-pulse`; base de los skeletons de R7 |
| A5 | `ch-press` | Click sostenido | El botón baja 1 px y el borde se enciende | Todos los botones (`:active`) |
| A6 | `ch-focus` | Foco de teclado | Borde `ch-green` que aparece en 100 ms | Global — accesibilidad **y** sensación de pulcritud |
| A7 | `ch-card-lift` | Hover en tarjeta | Borde a `ch-green/40` + fondo un escalón + 1 px arriba | Módulos del dashboard, tarjetas CRM, cards de equipos |

---

## Grupo B — feedback de acción (10)

*"Lo que hice tuvo efecto."* Este grupo es el que más cambia la sensación de
la app por unidad de esfuerzo.

| # | Token | Evento | Qué hace | Dónde |
|---|---|---|---|---|
| B1 | `ch-row-enter` | Se agregó una fila | Altura 0→auto + fade, 250 ms | Ítems de cotización, gastos, contactos, bundles |
| B2 | `ch-row-exit` | Se eliminó una fila | Colapsa a altura 0 y se desvanece **antes** de refrescar | Mismos lugares. Hoy la fila desaparece de golpe |
| B3 | `ch-flash-row` | Una fila se actualizó | Destello `ch-green/12` que decae en 600 ms | Tablas de financiero, conciliación, costos |
| B4 | `ch-pulse` | Un contador subió | Escala 1→1.04→1 + salto de color, 200 ms | Contador de contactos del CRM, totales, badges |
| B5 | `ch-shake` | Validación fallida | Oscilación horizontal de 4 px, 2 ciclos, 250 ms | Formularios — el campo culpable, no todo el form |
| B6 | `ch-check-draw` | Se marcó un check | El trazo del ✓ se dibuja (SVG `stroke-dashoffset`) | Checklists de rodaje y maletas, toggles de rentable |
| B7 | `ch-settle` | Se soltó una tarjeta | Aterriza con un asentamiento leve (sin rebote) | Kanban del CRM al cambiar de etapa |
| B8 | `ch-copy-flash` | Se copió un link | El botón cambia a "Copiado" y vuelve en 1.2 s | Links de cotización, citación, rendición, onboarding |
| B9 | `ch-save-dot` | Se guardó | Un punto `ch-green` late junto al campo y se apaga | Guardados silenciosos (notas, campos inline) — reemplaza toasts de ruido |
| B10 | `ch-upload-fill` | Subiendo archivo | La barra del archivo se llena de izquierda a derecha | Comprobantes de gastos, adjuntos de rendición |

---

## Grupo C — progreso y números (6)

| # | Token | Evento | Qué hace | Dónde |
|---|---|---|---|---|
| C1 | `ch-count-up` | Aparece un monto | Cuenta de 0 al valor en 600 ms con desaceleración | Estado de Resultados, por cobrar, totales de cotización, dashboard |
| C2 | `ch-bar-fill` | Aparece una barra | Crece de 0 a su valor, 500 ms | Meta diaria, avance de pipeline, ocupación de rental |
| C3 | `ch-ring` | Progreso circular | Anillo SVG que se dibuja | Meta diaria y racha en el dashboard |
| C4 | `ch-heat-shift` | Cambió la temperatura | El color del contador transiciona en vivo entre shades | Mapa de calor de contactos (hoy salta de color sin transición) |
| C5 | `ch-step` | Avanzó un paso | El indicador se desplaza y el paso anterior se marca | Constructor de cotización, onboarding de colaborador, flujo de rendición |
| C6 | `ch-cooldown` | Un prospecto se enfría | El shade retrocede lentamente al cargar la vista | Tarjetas del CRM sin toque hace N días (D2 del doc de CRM) |

---

## Grupo D — celebración (7)

Los gestos grandes. Se ven poco, por eso pueden ser memorables. **La claqueta
es el modelo de todo este grupo**: no es un efecto genérico, es un objeto de
la casa haciendo lo que hace.

| # | Token | Evento | Qué hace | Dónde |
|---|---|---|---|---|
| D1 | `ch-claqueta` | **Rodaje publicado / citaciones enviadas** | La claqueta baja al centro, cierra el brazo con el sonido `ch-claqueta`, y se disuelve. ~900 ms | `/rodaje/[id]/citaciones` |
| D2 | `ch-monto-hero` | **Pago recibido** | El monto crece al centro, cuenta desde 0, vuelve a su lugar. Con confeti | `PanelFacturacion` — el momento más importante de la app |
| D3 | `ch-sello` | Factura emitida | Un sello cae en diagonal, estampa (escala 1.15→1) y queda | `PanelFacturacion`, cotización aprobada |
| D4 | `ch-encaje` | **Movimiento conciliado** | Las dos filas (movimiento y gasto) se acercan y calzan con un click visual | `/financiero/pagar`, conciliación. La tarea más tediosa merece el mejor gesto |
| D5 | `ch-obturador` | PDF generado | Viñeta que se cierra y abre como un obturador, 250 ms | Cotización, rodaje, sticker |
| D6 | `ch-glow-hito` | Hito alcanzado | El borde de la tarjeta recorre verde→dorado y decae, 1.5 s | Cierre #10/#50, racha mantenida, meta cumplida |
| D7 | `ch-confetti+` | Celebración mayor | Ya existe en `lib/celebrate.ts`. Falta: **3 intensidades** (chico/normal/hito) y variantes para que no canse | Global, vía el bus de momentos |

---

## Grupo E — estado y presencia (5)

Lo que hace que la app se sienta **viva incluso sin tocarla**. Es la categoría
que más contribuye a "dan ganas de dejarlo abierto".

| # | Token | Evento | Qué hace | Dónde |
|---|---|---|---|---|
| E1 | `ch-live-dot` | Realtime conectado | Punto verde con latido lento (2 s) | Viewer `/rodaje/[id]/ver` — hoy no hay señal de que esté en vivo |
| E2 | `ch-arrive` | Llegó un cambio por Realtime | La fila entra con `ch-flash-row` | Viewer de rodaje, bandeja de aprobaciones |
| E3 | `ch-badge-pop` | Apareció un pendiente | Badge que escala 0→1 con overshoot leve | Sidebar: aprobaciones, leads sin tocar, seguimientos |
| E4 | `ch-empty-invite` | Estado vacío | La flecha del CTA se desplaza 3 px en loop lento | Los 30 estados vacíos (R13) |
| E5 | `ch-arrow-nudge` | Hover en "Abrir →" | La flecha avanza 3 px | Dashboard — la flecha ya está ahí y no se mueve |

---

## Resumen

| Grupo | Animaciones | Prioridad |
|---|---|---|
| A — base del sistema | 7 | **Primero.** Habilita todo lo demás |
| B — feedback de acción | 10 | **Segundo.** Máximo cambio percibido por esfuerzo |
| C — progreso y números | 6 | Tercero. Va junto con el dashboard vivo |
| D — celebración | 7 | Cuarto. Empezar por D2 y D4 (dinero y conciliación) |
| E — estado y presencia | 5 | Quinto |
| **Total** | **35** | |

---

## Nota de implementación

Casi todo esto es CSS puro: `@keyframes` en `globals.css` + clases de
utilidad. Las excepciones que necesitan JS son **C1** (`count-up`), **D1**
(claqueta), **D2** (monto), **D4** (encaje) y **D7** (confeti, ya existe) — y
las cinco se resuelven con DOM propio, sin librerías, igual que
`lib/celebrate.ts`.

Cada token se dispara desde el mismo bus de momentos que los sonidos (R1), de
modo que un evento como `pago.recibido` resuelva en un solo lugar su sonido
(`win-pago`), su animación (`ch-monto-hero` + confeti de hito) y su toast.

*Casa Hiedra · Hilván · catálogo de animaciones · ago 2026*
