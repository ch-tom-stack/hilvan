# Gamificación del CRM (CH-10) — documento de diseño

> Menú de ideas para gamificar el CRM y generar un **loop positivo**: que el
> usuario quiera entrar y sienta sus éxitos. Pensado como punto de partida para
> un chat dedicado. **No es un plan cerrado** — es un catálogo priorizable.

Objetivo (Tomás): "Quiero que quieran meterse y sientan sus éxitos." El CRM es
la herramienta de captación; mientras más lo usen y registren contactos, mejor
el pipeline. La gamificación es el motor de ese hábito.

---

## Principios (para no romper el producto)
- **Honestidad**: se celebra el éxito real (un cierre, un contacto registrado), nunca métricas infladas. Alineado con [[feedback_no_inventar_datos]].
- **Sin dark patterns**: nada de culpa, presión ni FOMO manipulador. Refuerzo positivo, no castigo.
- **Opt-out siempre**: sonidos ya son silenciables; toda alerta debe poder apagarse.
- **Estética Casa Hiedra**: sobrio, elegante, sin infantilizar. Sin `border-radius`, sin box-shadow, tokens `ch-*`, **sin emoji en la UI** (el confeti y color sí; iconitos no). Ver design-context.
- **Rendimiento**: sin librerías pesadas. Sonido = Web Audio generado; animación = canvas/DOM propio (ya se hizo así).

---

## Lo que YA existe (base, ago 2026)
- **Sonidos** (`lib/sfx.ts`, Web Audio, sin archivos): `playTick` (registrar contacto), `playAdvance` (mover etapa), `playWin` (arpegio al confirmar). Silenciable (`localStorage ch_sfx`), toggle "Sonido/Silencio" en el header.
- **Confeti** (`lib/celebrate.ts`): al confirmar un cliente, en tablero y ficha.
- **Contador de contactos como epígrafe con mapa de calor** (`components/crm/TarjetaProspecto.tsx`): 0 azul → 16 rojo. Ya es un "termómetro" visual del esfuerzo.
- **Biblioteca de contactos** (`/crm/biblioteca`): insights empíricos (a qué toque cierran, tasa de respuesta) — base para metas realistas.

---

## Catálogo de mecánicas (priorizable)

Esfuerzo: **S** (horas) · **M** (medio día) · **L** (varios días / tabla nueva).

### A. Feedback inmediato — *sentir cada acción* (parcialmente hecho)
- **A1** · Escalar la celebración según el hito **S**: cierre grande = confeti + arpegio largo; contacto normal = tick sutil. Distinta intensidad según el evento.
- **A2** · Micro-animación del contador al sumar un toque **S**: el número "late"/pulsa y sube de shade en vivo (transición de color), reforzando el mapa de calor.
- **A3** · Sonido especial al **toque 16** **S**: un remate distinto cuando un prospecto llega al número donde cae el ~80% de los cierres ("está en zona de cierre").
- **A4** · Feedback al arrastrar en el Kanban **S**: sonido/animación sutil al soltar una tarjeta en una etapa nueva.

### B. Progreso y metas — *tener hacia dónde* 
- **B1** · Meta diaria/semanal de contactos **M**: "Hoy: 7 / 10 contactos" con barra que se llena; al completarla, celebración. Configurable por usuario.
- **B2** · Barra de avance del prospecto hacia el cierre **S–M**: sobre la tarjeta/ficha, "toque 9 de ~14" usando el promedio real de la Biblioteca (no el 16 fijo).
- **B3** · Racha (streak) de días activos **M**: "5 días seguidos registrando contactos". Recompensa la constancia (el verdadero driver de la captación).
- **B4** · Progreso del pipeline **S**: barra global "X de Y prospectos tocados esta semana".

### C. Reconocimiento y estatus — *sentirse visto*
- **C1** · Logros / hitos **L** (tabla `crm_logros` o computado): "Primer cierre", "10 cierres", "100 contactos", "Rescataste un prospecto en frío". Se desbloquean y quedan en el perfil.
- **C2** · Tablero entre responsables **M**: ranking amistoso por contactos/cierres del mes (Tomás, Natalia, Simón…). Cuidado: que motive, no que humille — mostrar esfuerzo, no solo resultado.
- **C3** · Resumen de "tu semana" **M**: al entrar el lunes, un panel positivo: "Cerraste 2, tocaste 23, tu prospecto más caliente es X".

### D. Temperatura y narrativa — *el pipeline vivo* (el mapa de calor ya siembra esto)
- **D1** · Vista/filtro "Calientes" **S**: destacar o filtrar los prospectos con más toques (los más cerca del cierre) — foco donde rinde.
- **D2** · Aviso de enfriamiento **M**: cuando un prospecto trabajado lleva N días sin toque, se "enfría" visualmente (el shade retrocede) → invita a retomar antes de perderlo. (Conecta con el cron de seguimientos existente.)
- **D3** · "En zona de cierre" **S**: badge sutil cuando un prospecto pasa el toque del promedio de cierre.

### E. Alertas y loops de retorno — *que traiga de vuelta*
- **E1** · Notificación positiva **M**: push/mail "Tienes 3 prospectos calientes esperando" en vez de "tienes tareas pendientes". Enmarcar como oportunidad, no deber.
- **E2** · Celebración compartida **M**: cuando alguien cierra, un aviso al equipo ("Natalia cerró a X 🎉") — refuerzo social. Opt-in.
- **E3** · Digest positivo **S**: reusar el cron de seguimientos para incluir un titular de logros de la semana, no solo lo vencido.

### F. Sorpresa y deleite — *que no se sienta un formulario*
- **F1** · Celebraciones variadas **S**: rotar entre 2–3 animaciones/sonidos de cierre para que no canse.
- **F2** · Hito especial en cierres redondos **S**: el cierre #10, #50, #100 con una celebración mayor.
- **F3** · Detalle de marca **S**: que la celebración use el lenguaje visual de Casa Hiedra (tipografía display, verde/dorado), no confeti genérico.

---

## Bloques técnicos que habilitan lo de arriba
- **Stats por usuario** (para B/C): computar en vivo desde `crm_interacciones` + `prospectos` (autor/responsable, fechas) — probablemente **sin tabla nueva** al principio (como la Biblioteca). Rachas y logros pueden necesitar persistencia (`crm_logros`, `crm_metas`) si se quiere estado durable.
- **Fecha/hora**: usar `lib/fechas.ts` y hora Chile (patrón ya usado en el cron).
- **Sonido/animación**: extender `lib/sfx.ts` y `lib/celebrate.ts` (ya existen, sin dependencias).
- **Herramienta de agente** (opcional): que Cowork pueda leer stats/rachas para felicitar o sugerir ("te falta 1 para tu meta") vía un endpoint `/api/agent/crm/*` + tool MCP en ambas capas (patrón `hilvan_biblioteca_contactos`).

---

## Recomendación de arranque (si hay que elegir)
Máximo impacto / menor esfuerzo, en orden:
1. **A2 + A3** (contador que late + sonido del toque 16) — amplifica lo que ya emociona.
2. **B1** (meta diaria con barra) — da propósito a cada sesión.
3. **B3** (racha) — construye el hábito.
4. **C3 / E3** (resumen positivo de la semana) — loop de retorno.
5. Luego **C1/C2** (logros y ranking) si el equipo engancha.

Evitar de entrada: rankings agresivos (C2 mal hecho desmotiva) y notificaciones intrusivas (E1 sin opt-out).

---

## Preguntas para el chat dedicado
- ¿Individual (mis éxitos) o de equipo (ranking) el foco inicial?
- ¿Metas fijas o que se auto-ajusten con los datos de la Biblioteca?
- ¿Hasta dónde llega el refuerzo social (avisar al equipo cada cierre)?
- ¿Persistir logros/rachas (tabla) o mantener todo computado en vivo?

*Casa Hiedra · Hilván · CH-10 · doc de diseño de gamificación · ago 2026*
