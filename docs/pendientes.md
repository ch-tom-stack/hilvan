# Pendientes de Hilván

Corte **11-ago-2026**. Sólo lo que se arregla tocando la app.

**Lo operativo del CRM no vive acá.** Las fichas del Repertorio por confirmar,
los rubros sin credencial, los correos rebotados y la cadencia de contactos son
trabajo del operador y de quien capta — su lugar es
[`docs/crm/operador-contexto.md`](crm/operador-contexto.md), no esta lista.

---

## 1. Decisiones, no tareas

### Medallas: ¿módulo o sección?
Hoy viven en `/perfil`, con una tira en el pie del sidebar. Si van a tener lugar
propio en la navegación, conviene decidirlo antes de que el equipo se acostumbre
a una forma: el primer lugar donde algo aparece define qué creen que es.

### Los umbrales mensuales son una apuesta
*Cincuenta* significa 50 contactos **en el mes**, no acumulados. Nadie los ha
vivido un mes completo todavía. Revisar al cierre de agosto: si nadie llegó, hay
que bajarlos.

### El correo de anuncio — recomendación: no mandarlo
La literatura de gamificación es específica: el efecto de sobrejustificación es
fuerte con recompensas **anunciadas y esperadas**, y débil o positivo con
feedback **inesperado** que informa competencia. Anunciar las medallas las
convierte en lo primero. Con la tira del sidebar ya tienen por dónde
descubrirse solas.

### El cron de seguimientos del CRM sigue apagado
La condición que se puso para encenderlo —que registrar fuera de un click— se
cumplió hace rato. Queda como decisión.

---

## 2. Trabajo de UX que sigue abierto

### `ch-press` no existe fuera del CRM
281 botones en ocho módulos sin respuesta al tacto: rodaje 89, financiero 51,
cotizaciones 38, equipos 34, clientes 27, rental 22, colaboradores 12,
calendario 8. Es el micro-gesto más frecuente de la app y sólo lo tienen el CRM
y el perfil.

### La animación de entrada tampoco
`ch-fade-up` y `ch-stagger` se usan una vez cada uno fuera del CRM. Las listas
del resto de la app aparecen de golpe.

### El dashboard está inerte
Es lo primero que se ve al entrar y es una grilla de módulos más un calendario.
No cuenta nada de ti: ni el rango, ni el ritmo, ni qué quedó pendiente. Es la
pantalla con más tráfico y la que menos hace.

### 55 rutas siguen sin `loading.tsx`
Se cubrieron las 12 principales. Faltan las de detalle —`crm/[id]`,
`rodaje/[id]`, `cotizaciones/[id]`— que son las que más tardan, porque cargan
todo el expediente.

---

## 3. Construible

### `equipos` y `maletas` no tienen `created_by`
Sin atribución no puede haber medallas de ese módulo, y no se inventa
asignándoselas a alguien. Una migración chica abriría el capítulo.

### Dos momentos de sonido sin dónde vivir
`movimiento.conciliado` y `lead.entrante` están definidos y nunca suenan: los
dos ocurren en rutas de agente, en el servidor, donde no hay navegador que
reproduzca nada. Suenan sólo si esas acciones ganan superficie en la app.

---

## 4. Deuda menor

### Las voces del enfriado son TTS
Las cuatro variantes de `crm-enfriado` usan voces sintéticas de macOS sobre el
trombón. Grabarlas con la voz de Natalia o Simón son dos segundos por línea. El
montaje ya está hecho: sólo hay que reemplazar el archivo de voz.

**Ojo:** cualquier sonido nuevo se procesa junto al set completo desde los
originales (que están en el historial de git), nunca de a uno — el ajuste de
volumen es global. Ver [`tools/sonido/README.md`](../tools/sonido/README.md).

### Escuchar el set en la app
Emparejar los 40 sonidos costó bajar el objetivo global 10.5 dB. Si suena débil,
se sube `GANANCIA` en `lib/sfx.ts` — **nunca** reprocesar los archivos: la sala
se acumula.

### Del CLAUDE.md, llevan meses
- **Export Santander** — validarlo con rendiciones aprobadas reales.
- **OTT\* NT AT HOME** — cargo recurrente de ~$10.100/mes sin identificar.
