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

## Los ejes que hay que clasificar

**`tamano`** — `chica` · `mediana` · `grande`
Marca conocida o cadena = grande; pyme establecida = mediana; emprendimiento = chica.

**`rubro`** — de qué es la marca. Es el eje que decide: **sin rubro no se
asigna**.

`moda` · `moda_intima` · `belleza` · `deporte` · `herramientas` · `consumo`
(alimentos y bebidas) · `retail` · `servicios` · `educacion` · `inmobiliaria` ·
`turismo` · `entretenimiento` · `rental` (busca arriendo de equipos, no
producción) · `otro`

**`tipo_cliente`** — con quién se trabaja. Pregunta distinta del rubro: una
agencia de moda es las dos cosas.

`marca` (directa) · `agencia` · `institucion` · `emprendedor` · `estudiante` ·
`productora`

> **Cambió en ago-2026.** Antes había un solo eje, `segmento`, con valores como
> `ropa_intima_fem` y `masculino_estereotipo`: clasificaba el trabajo por el
> género de quien aparece o compra, cuando "deportes/herramientas" son dos
> rubros. Además no repartía —45 de 66 prospectos caían en `general`—, así que
> en los hechos casi todo se resolvía por producto y tamaño.
>
> **A cada persona le toca exactamente lo mismo que antes.** Cambió cómo se
> nombra, no quién trabaja qué.

El **producto objetivo** (`banco` · `lookbook` · `spot` · `videoclip`) también
entra en las reglas; normalmente viene del lead o de La Lectura
(feed→banco, temporadas→lookbook).

---

## La escalera de asignación

Se evalúa en orden. **Gana la primera que calza.**

| # | Condición | Responsable |
|---|---|---|
| 1 | rubro `rental` | **Josué** |
| 2 | tipo de cliente `estudiante` | **Simón** |
| 3 | rubro `deporte` o `herramientas` | **Simón** |
| 4 | rubro `moda_intima` | **Natalia** |
| 5 | producto `banco` | **Natalia** |
| 6 | producto `videoclip` | **Simón** |
| 7 | producto `lookbook` + tamaño `mediana` o `grande` | **Tomás** |
| 8 | tamaño `grande` (contenido ancla / temporada) | **Tomás** |
| 9 | producto `lookbook` + tamaño `chica` | **Natalia** |
| — | cualquier otra | **Simón** (fallback) |

**Por qué ese orden:** las reglas 1 a 4 son de especialidad —quién trabaja mejor
ese tipo de marca— y por eso pisan a las de producto y tamaño, que son el
criterio por defecto. Tomás recibe menos por diseño: sus condiciones (grandes y
medianas-grandes) son las más raras.

---

## Invariantes

- **Sin `rubro` no se asigna.** Queda "por clasificar" — asignar a ciegas es
  peor que dejarlo pendiente.
- **El reparto automático nunca reasigna** un prospecto que ya tiene
  responsable. Sí existe una vía para cambiarlo, y es pedirlo (ver abajo).
- La clasificación se hace **con fuente** (sitio, Instagram, dossier de La
  Lectura). Si no hay cómo determinarla, se deja pendiente y se reporta.

## Pedir un prospecto (ago 2026)

La regla anterior era "nunca se reasigna, y punto". No resultó viable: en la
práctica alguien conoce al cliente, tiene el contexto o le sobra capacidad, y
sin una vía para decirlo la única salida era saltarse la regla.

Ahora hay una: **se pide, no se toma.**

- Desde la ficha del prospecto: *Pedir este prospecto*.
- Desde el operador: `hilvan_solicitar_asignacion` (`para` = el email de quien
  lo llevaría; si no calza con un usuario, falla en vez de adivinar).

En ambos casos NO se reasigna nada: queda una propuesta en la Bandeja que
resuelve quien gestiona el reparto. Eso conserva lo que la regla protegía —que
nadie elija su propia carga— sin obligar a nadie a saltársela. Una sola
solicitud viva por prospecto.

Al aprobarse, el hilo abierto de la bitácora pasa también al nuevo responsable:
el emisor de la conversación cambió, y dejarlo apuntando al anterior haría que
los mensajes que vengan queden atribuidos a quien ya no la lleva.

## Dónde se aplican

- **Al clasificar** (ficha del prospecto, o el agente): si no tiene dueño, se
  asigna en el acto.
- **Botón "Repartir por reglas"** en el banner de huérfanos: corre la escalera
  sobre todos los sin responsable ya clasificados.
