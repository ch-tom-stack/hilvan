# Segunda auditoría — el CRM

> Agosto 2026, después de construir la capa de feedback. La primera auditoría
> preguntó "¿la app responde?". Esta pregunta **"¿responde a algo que alguien
> esté haciendo?"**.
>
> Foco: **CRM**. Las alertas financieras quedan fuera — son de uso exclusivo de
> Tomás y ya las consume por Cowork; no van al dashboard del equipo.

---

## La tesis

**La capa de recompensa está construida y apunta a una acción que casi nadie
realiza. El cuello de botella no es el feedback: es la fricción que hay antes.**

---

## 1. La evidencia

Datos reales de la base:

| | |
|---|---|
| Prospectos | **30** |
| Contactos registrados, en total | **1** |
| Promedio de contactos por prospecto | **0,08** |
| Prospectos sin responsable | **18 de 30** |
| Confirmados | **0** |
| Reparto | Simón 10 · Natalia 2 · **sin asignar 18** |

El mapa de calor de la tarjeta va de 0 a 16 toques. **Su valor máximo en toda la
base es 1.** El contador que late, la chispa al registrar, el confeti de hito al
confirmar: todo construido para un evento que ocurrió una vez.

*Lectura alternativa honesta:* el módulo es reciente y puede faltarle rodaje.
Pero la conclusión operativa no cambia — hay que atacar lo que ocurre **antes**
del feedback.

---

## 2. Por qué no se registran contactos

### El registro "rápido" no es rápido

`QuickContacto` se llama rápido pero pide **seis campos**, uno de ellos un
textarea de cinco filas para *pegar el correo completo*:

| Campo | |
|---|---|
| Fecha | prellenada ✓ |
| Tuvo respuesta | checkbox |
| Resumen | texto libre |
| **Correo enviado** | **textarea de 5 filas** |
| Próximo paso | texto libre |
| Fecha próximo paso | fecha |

La acción real que el usuario quiere registrar es *"toqué a este prospecto hoy"*.
Eso debería ser **un click**.

### La barrera es autoimpuesta

`registrarInteraccion()` en `app/actions/crm.ts` **no exige ningún campo**: todos
son opcionales y `limpiar()` resuelve los vacíos. Un
`registrarInteraccion(id, { fecha, tipo })` funciona perfecto hoy.

Lo único que bloquea el registro de un click es una validación **del lado del
cliente**, en `QuickContacto.tsx:36`:

```ts
if (!form.resumen?.trim() && !form.cuerpo?.trim()) {
  toastError('Escribe un resumen o pega el correo enviado')
  return
}
```

Quitar esa exigencia no requiere tocar la base ni el action.

### Bug de datos: todo contacto queda como "correo"

`QuickContacto` inicializa `tipo: 'correo'` y **el formulario no tiene selector
de tipo**. No se puede registrar una llamada, un WhatsApp ni una reunión: todo
entra como correo.

Consecuencia real: la **Biblioteca de contactos** —que calcula tasa de respuesta
y a qué toque cierran los prospectos, y que iba a fundamentar las metas— está
midiendo sobre un campo que siempre vale lo mismo. Cualquier insight por canal
es inválido de origen.

### Nadie sabe a quién le toca

18 de 30 prospectos sin responsable. Sin dueño no hay lista, sin lista no hay
acción, y sin acción la capa de recompensa no tiene qué recompensar.

---

## 3. Las recomendaciones

### C1 · El toque de un click · **S** · *la más importante*

Un botón en la tarjeta del Kanban que registre el contacto con fecha de hoy y
nada más. Sin modal, sin formulario. Dispara `crm.contacto` → chispa + tick, el
contador late y sube de color en el acto.

El detalle: quien quiera detallar puede hacerlo después desde la ficha. **El
registro y el detalle son dos momentos distintos y hoy están fusionados en uno.**
Separarlos es lo que desbloquea el hábito.

### C2 · Selector de tipo · **S**

Correo · Llamada · WhatsApp · Reunión, como cuatro botones en la tarjeta. Cada
uno es un toque de un click y a la vez arregla el bug de `tipo`. La Biblioteca
empieza a medir algo real.

### C3 · Repartir los 18 huérfanos · **S**

Asignación masiva desde el tablero: seleccionar varias tarjetas y asignar
responsable. Sin esto, C1 y C2 no tienen a quién servirle.

### C4 · "Tus prospectos de hoy" · **M**

Al entrar al CRM, una franja corta con **tres** prospectos: los que llevan más
días sin toque, del usuario. No una lista de tareas — una sugerencia de por dónde
empezar. Es el equivalente honesto a mostrar el premio: acá está lo que está a un
click de sumar.

### C5 · Estado vacío que enseñe · **S**

Con 1 contacto en la base, *"Sin interacciones registradas"* es lo que aparece en
**29 de 30 fichas**: es el estado vacío más visto de toda la app. Debería
explicar en una línea por qué registrar toques importa y traer el botón de C1.

### C6 · Racha y meta diaria · **M** · *después de C1–C4*

Recién cuando registrar sea de un click tiene sentido medir constancia. La
Biblioteca dará el promedio empírico para fijar una meta realista en vez de
inventada. Habilita `meta.cumplida` y `hito.alcanzado`, los dos momentos que
quedaron declarados sin superficie.

---

## 4. Lo que NO recomiendo

**Más animación ni más sonido.** La capa está sobrada para el uso actual.
Agregarle antes de que haya actividad solo la desgasta.

**Rankings entre personas.** Con 18 prospectos sin dueño, un ranking mediría
quién recibió asignaciones, no quién trabajó. Primero repartir (C3), después
medir.

**Recordatorios de "tienes pendientes".** El cron de seguimientos existe y está
apagado. Encenderlo antes de bajar la fricción convierte la app en una fuente de
culpa: te avisa de algo que igual cuesta hacer.

---

## 5. Orden sugerido

1. **C1 + C2** — el toque de un click con su tipo. Es un día de trabajo y es lo
   único que puede cambiar la curva.
2. **C3** — repartir los huérfanos.
3. **C5** — el estado vacío, que es gratis y se ve en 29 de 30 fichas.
4. **C4** — tus prospectos de hoy.
5. **C6** — racha y metas, cuando ya haya qué medir.

---

*Casa Hiedra · Hilván · segunda auditoría, foco CRM · ago 2026*
