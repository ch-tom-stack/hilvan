# Gamificación de Hilván — resumen de lo construido

> Punto de entrada de `docs/gamificacion/`. Qué se hizo, dónde vive, qué falta.
> Agosto 2026.

**Objetivo:** que el equipo disfrute usar Hilván. La app tenía 45 confirmaciones
de éxito idénticas —recibir un pago se sentía igual que borrar una fila—, sonido
en 1 de 12 módulos y cero keyframes propios.

---

## 1. El sistema

Todo pasa por un **bus de momentos**. Un momento es algo que le pasó al usuario;
el bus resuelve en un solo lugar su sonido, su celebración y su toast.

```ts
import { momento } from '@/lib/momentos'

momento('crm.contacto')                                   // tick + chispa + toast
momento('pago.recibido', { monto, montoTexto })           // celebración escalada
momento('rodaje.publicado', { claqueta: datosClaqueta() }) // la pizarra
```

Cambiar el diseño de feedback de toda la app es editar `lib/momentos.ts`.

| Archivo | Rol |
|---|---|
| `lib/momentos.ts` | **El bus.** 32 momentos declarados |
| `lib/sfx.ts` | Motor de audio: 34 tokens, ganancia por familia, throttle, precarga, **fallback sintético** |
| `lib/celebrate.ts` | Chispa, confeti (4 intensidades), `montoHero`, `claqueta` |
| `lib/animar.ts` | `animar()`, `contar()`, `encajar()` |
| `lib/preferencias.ts` | Sonido, volumen, celebraciones + `movimientoReducido()` |
| `app/globals.css` | 10 keyframes `ch-*` — aditivo, no toca `@theme` |
| `components/ui/AudioBootstrap.tsx` | Desbloquea el audio y rastrea el puntero |
| `components/perfil/PreferenciasFeedback.tsx` | Sección "Sonido y movimiento" en `/perfil` |

**Decisión clave:** si falta el `.mp3` de un token suena un tono sintético
equivalente, afinado en Do mayor. Eso permitió cablear la app entera antes de
tener un solo archivo de audio.

---

## 2. Sonido

**34 archivos, 383 KB** en `public/sounds/`, uno por token. Elegidos de oído por
Tomás en un banco de pruebas con 252 candidatos de cuatro fuentes.

Procedencia, licencias y procesamiento: **[`mapeo-sonidos.md`](mapeo-sonidos.md)**.
Catálogo y dirección de arte: **[`sonidos.md`](sonidos.md)**.

Fuentes: SND (`snd.dev`), Kenney UI Audio (CC0), Sonniss GDC 2026 y Freesound
(CC0, verificado ficha por ficha). Sin costo ni atribución obligatoria.

> **La afinación a Do mayor NO se aplicó.** Se construyó el detector y se probó
> con `rubberband`, pero la verificación falló en 11 de 15 archivos: la mayoría
> del set son frases de varias notas donde la fundamental no es medible de forma
> reproducible. Se revirtió al set elegido de oído. El razonamiento completo está
> en `mapeo-sonidos.md`.

Sí se aplicó **ecualización** a las 6 grabaciones reales (claqueta, obturador,
cinta, papel, pieza de madera, pestillo): realce suave en el grado de Do mayor
más cercano a su centroide. Modula el timbre sin transponerlas, que las volvería
falsas.

---

## 3. Movimiento

10 keyframes en `globals.css`, todos apagados bajo `prefers-reduced-motion`.
Catálogo completo: **[`animaciones.md`](animaciones.md)**.

| Animación | Dónde |
|---|---|
| `ch-pulse` | contador de contactos del CRM |
| `ch-settle` | tarjeta del Kanban al cambiar de etapa |
| `ch-badge-pop` | badge de la Bandeja |
| `ch-live-dot` | viewer de rodaje — antes no había señal de que estuviera en vivo |
| `ch-shimmer` | skeleton de `/costos/admin` |
| `ch-fade-up` + `ch-stagger` | tarjetas del dashboard |
| `ch-nudge` | flecha "Abrir →" |
| `ch-shake` | validación en el perfil |

Reglas: desplazamiento máximo 8 px, escala máxima 1.04. Sin sombras ni radios,
la jerarquía se expresa con **tiempo**, no con profundidad.

Listas y sin superficie donde dispararse: `ch-glow-hito`, `ch-flash-row`,
`ch-bar-fill`, `encajar()`.

---

## 4. La escalera de celebración

El hallazgo que más cambió el diseño: la app celebraba lo que pasa una vez a la
semana, no lo que pasa cada minuto.

| Nivel | Qué se ve | Cuándo |
|---|---|---|
| **micro** | chispa de 9 partículas anclada al click | 15 momentos recurrentes |
| **chico** | confeti de 40 | factura emitida, lead nuevo |
| **normal** | confeti de 90 | rodaje publicado/finalizado, meta |
| **hito** | 190 en **3 oleadas** + monto contando | pago, cierre, cotización aprobada |

La chispa cubre las acciones frecuentes: registrar contacto, guardar, crear,
copiar, subir, marcar checklist, agregar ítem a una cotización, conciliar. Tiene
un tope de una cada 140 ms para que una importación masiva no sea fuegos
artificiales.

**La frecuencia sale del uso, no de un temporizador.** Fabricar eventos sin
acción detrás sería la mecánica de casino que se descartó a propósito.

---

## 5. Lecciones de casino aplicadas

Detalle en `sonidos.md`. Lo que se robó del oficio de las tragamonedas:

- **La recompensa escala con la magnitud real** — un pago de $5M no suena ni se
  ve como uno de $50k. Umbrales en `intensidadPorMonto()`.
- **Rolling proporcional** — el monto cuenta desde cero; más grande, más larga.
- **Oleadas escalonadas** en los hitos: la recompensa se despliega en el tiempo.
- **Latencia bajo 100 ms** — el sonido va en el gesto, no después del `await`.

Lo que se descartó: refuerzo de razón variable, near-miss y pérdidas disfrazadas
de ganancias. No por moralismo: en una herramienta que el equipo usa durante
años, si la celebración deja de significar algo real se pierde el canal entero.

---

## 6. La claqueta

`claqueta()` en `lib/celebrate.ts`, disparada al confirmar un rodaje. El brazo
baja, golpea, la pizarra tiembla. Se rellena con el **Plan de Rodaje real**:
producción, fecha, nombre, locación, llamado, secuencias, equipo y dirección.

Probada contra dos rodajes de la base. Lo que enseñaron los datos reales:

- `proyecto_id` y `cotizacion_id` vienen `null` → **no hay cliente**; el nombre
  del rodaje es el único identificador.
- El equipo puede venir vacío → los campos sin dato **no se dibujan**, para no
  mostrar un "0" que parece error.
- No hay escenas numeradas, hay **bloques**; se cuentan solo los de tipo rodaje.
- El director se detecta por coincidencia **exacta** con "Dirección": "Dirección
  de Foto" y "Asistencia de Dirección" darían falso positivo.

---

## 7. Cambios de infraestructura

- **`proxy.ts`**: se agregó `mp3` a la exclusión del matcher para que los sonidos
  se sirvan en rutas públicas y sin pagar un `auth.getUser()` por archivo. El
  `.xlsx` bancario de `public/templates/` sigue protegido — verificado.
- **`lib/toast.ts`**: `toastOk` acepta duración; los hitos se quedan más rato.

---

## 8. Qué falta

**Sin superficie donde vivir** (el momento existe, la pantalla no):
`conciliar-match` — la conciliación ocurre por el agente, no tiene UI ·
`lead.entrante` — llega por webhook · `meta.cumplida` y `hito.alcanzado` —
dependen de rachas y metas diarias.

**Del plan original de la auditoría**, sin empezar: dashboard vivo (R9),
racha y "tu semana" (R10), meta diaria (R11), cierre del día (R12), estados
vacíos que invitan (R13), skeletons en las 8 rutas pesadas (R7), números que
cuentan en Financiero (R8).

**Pendiente menor:** persistir las preferencias en `profiles` para que viajen
entre dispositivos (requiere migración SQL + grants). Hoy son por dispositivo.

---

## Los documentos

| | |
|---|---|
| [`auditoria.md`](auditoria.md) | Diagnóstico inicial y las 17 recomendaciones R1–R17 |
| [`sonidos.md`](sonidos.md) | Catálogo de 34 sonidos, dirección de arte, lecciones de casino |
| [`animaciones.md`](animaciones.md) | Catálogo de 35 animaciones en 5 grupos |
| [`mapeo-sonidos.md`](mapeo-sonidos.md) | Procedencia archivo por archivo y procesamiento |

El doc previo `docs/crm/gamificacion.md` sigue vigente como catálogo de mecánicas
del CRM (metas, rachas, logros).

*Casa Hiedra · Hilván · ago 2026*
