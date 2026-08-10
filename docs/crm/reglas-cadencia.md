# Reglas de cadencia de contacto — CRM (CH-10)

Fuente de verdad de **cuándo toca el próximo contacto** de un prospecto.
Confirmadas por Tomás (ago 2026). Implementadas en `lib/crm-cadencia.ts`
(`calcularCadencia`), con tests en `tests/crm-cadencia.test.ts`.

El **qué decir** en cada toque no vive acá: eso es `components/crm/ComoAbordarlo.tsx`.

---

## La escalera

Cuenta **toques consecutivos sin respuesta**. Cualquier canal (correo, llamada,
mensaje, reunión) reinicia el reloj: perseguir por correo a alguien con quien se
habló ayer es ruido.

| Situación | Próximo contacto |
|---|---|
| Contestó y le debemos respuesta | **hoy** — manda sobre todo lo demás |
| Nunca tocado | **hoy** |
| 1 toque sin respuesta | último **+ 2 días** |
| 2 seguidos sin respuesta | último **+ 4 días** |
| 3 o más seguidos sin respuesta | último **+ 7 días** |
| **16** sin respuesta | se detiene → propuesta de pasar a **En frío** |

- **Una respuesta reinicia la escalera** a cero: nadie sigue en una secuencia
  después de hablar.
- Si el vencimiento cae **sábado o domingo, corre al lunes**.

## Snooze

Posponer sin perder el prospecto. El tope es **un tercio del tramo, mínimo un
día**, y se valida en el servidor (el cliente propone, el servidor decide):

| Tramo | Snooze máximo |
|---|---|
| 2 días | 1 día |
| 4 días | 1 día |
| 7 días | 2 días |

- El snooze solo **empuja hacia adelante**, nunca adelanta.
- **Registrar un toque lo consume**: un aplazamiento viejo no puede seguir
  escondiendo a alguien cuyo reloj ya volvió a partir.
- Una **respuesta ignora el snooze**: si contestó, se contesta.

## Al agotarse (16 sin respuesta)

Se **detiene** la cadencia y queda una **propuesta en la Bandeja** para moverlo a
En frío — no se mueve solo. Que alguien no conteste 16 veces lo hace probable,
pero "probable" no alcanza para sacarlo del tablero sin que nadie lo mire.

> **Ojo con los dos 16.** Este es el 16° contacto **sin respuesta** (se apaga).
> El otro 16 —el de la Biblioteca, donde ~80% acepta— cuenta **toques totales**,
> respondidos incluidos. No se contradicen; no hay que mezclarlos al leer métricas.

## Dónde se aplica

- **`AgendaDeHoy`** (franja en `/crm`): la lista del día de cada persona, con
  quien respondió primero. Se vacía a medida que se trabaja.
- **Digest matinal** (`/api/cron/crm-digest`, días de semana): la misma lista por
  correo, con nombre del prospecto y fecha del último contacto. Quien gestiona
  recibe además la de todo el equipo.
- **Tarjeta del Kanban**: marca "te respondió" / "N días atrasado".

Ambas superficies llaman al **mismo motor**: la pantalla y el correo no pueden
contradecirse.
