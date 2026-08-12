# Reglas de reparto de prospectos — CRM (CH-10)

Fuente de verdad de **a quién le toca cada prospecto**. Confirmadas por Tomás
(ago 2026).

> Nota de implementación (para quien desarrolla, no para operar): la lógica vive
> en `lib/crm-asignacion.ts` (`personaSegunReglas`) — si estas reglas cambian,
> ese archivo cambia con ellas. Es una ruta del repositorio: no existe en la
> sesión del operador y no hay que abrirla.

El reparto NO se decide por temperatura (frío vs entrante): el frío ya tiene
dueño —quien lo encontró— y reasignar cuando entra en calor bota la curva de
aprendizaje de lo ya investigado.

---

## Los dos ejes que hay que clasificar

**`tamano`** — `chica` · `mediana` · `grande`
Marca conocida o cadena = grande; pyme establecida = mediana; emprendimiento = chica.

**`segmento`** — uno solo:

| Valor | Cuándo |
|---|---|
| `estudiante` | Es un/a estudiante o proyecto estudiantil |
| `rental` | Busca **arriendo de equipos**, no producción |
| `ropa_intima_fem` | Ropa íntima femenina o productos asociados |
| `masculino_estereotipo` | Rubro que por estereotipo trataría mejor con un hombre: deportes masculinos, herramientas, ferretería |
| `general` | Todo lo demás |

El **producto objetivo** (`banco` · `lookbook` · `spot` · `videoclip`) también
entra en las reglas; normalmente viene del lead o de La Lectura
(feed→banco, temporadas→lookbook).

---

## La escalera de asignación

Se evalúa en orden. **Gana la primera que calza.**

| # | Condición | Responsable |
|---|---|---|
| 1 | segmento `rental` | **Josué** |
| 2 | segmento `estudiante` | **Simón** |
| 3 | segmento `masculino_estereotipo` | **Simón** |
| 4 | segmento `ropa_intima_fem` | **Natalia** |
| 5 | producto `banco` | **Natalia** |
| 6 | producto `videoclip` | **Simón** |
| 7 | producto `lookbook` + tamaño `mediana` o `grande` | **Tomás** |
| 8 | tamaño `grande` (contenido ancla / temporada) | **Tomás** |
| 9 | producto `lookbook` + tamaño `chica` | **Natalia** |
| — | cualquier otra | **Simón** (fallback) |

**Por qué ese orden:** la regla 3 pisa a la 4 y la 5 a propósito — la excepción
de género manda sobre el producto. Tomás recibe menos por diseño: sus criterios
(grandes y medianas-grandes) son los más raros.

---

## Invariantes

- **Sin `segmento` no se asigna.** Queda "por clasificar" — asignar a ciegas es
  peor que dejarlo pendiente.
- **Nunca se reasigna** un prospecto que ya tiene responsable.
- La clasificación se hace **con fuente** (sitio, Instagram, dossier de La
  Lectura). Si no hay cómo determinarla, se deja pendiente y se reporta.

## Dónde se aplican

- **Al clasificar** (ficha del prospecto, o el agente): si no tiene dueño, se
  asigna en el acto.
- **Botón "Repartir por reglas"** en el banner de huérfanos: corre la escalera
  sobre todos los sin responsable ya clasificados.
