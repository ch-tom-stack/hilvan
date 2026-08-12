# Misiones

> **Estado: diseño en curso.** Este documento recoge lo que ya está decidido.
> Mientras diga esto, **el operador no genera misiones**: falta definir qué es la
> misión semanal y qué es responsabilidad de cada persona. Las secciones
> marcadas *Pendiente* son eso — huecos declarados, no reglas a medias.

## Qué es una misión

Un encargo acotado —diario o semanal— que una persona recibe al entrar a Hilván.

Es **honor system**: se cumple porque la persona declara que lo cumplió, no
porque la app lo detecte. Esto no es una concesión, es la decisión de fondo, y
cambia todo lo demás: una misión **puede pedir algo que Hilván no ve**. Puede ser
una llamada, una conversación, dejar un archivo ordenado en otra parte.

### Por qué el honor system era necesario

Hilván hoy sabe muy poco de quién hace qué. Contando los últimos 60 días:

| | cotizaciones | rodajes | clientes |
|---|---|---|---|
| Tomás | 25 | — | 1 |
| Josué | 3 | — | — |
| Natalia | 2 | 1 | — |
| Simón | 2 | 1 | — |

Y hay **71 gastos y 13 eventos de calendario sin autor**: entraron por el agente,
sin quedar atribuidos a nadie.

Si las misiones dependieran de lo que la app registra, solo Tomás tendría
misiones — no porque haga todo, sino porque lo suyo es lo único que queda
escrito. El honor system desacopla la misión de la instrumentación.

**Consecuencia para quien redacte misiones:** no dar por hecho que la app puede
verificar nada. Una misión bien escrita es verificable *por la persona*, no por
una consulta.

## Fuentes de información

1. **Hilván** — cotizaciones, rodajes, rental, financiero, CRM. Es la fuente que
   existe hoy y la que menos cubre.
2. **El operador de CRM** — cadencia, seguimientos y correos pendientes. Ver
   [`reglas-cadencia.md`](reglas-cadencia.md) y [`reglas-correos.md`](reglas-correos.md).
3. **Atelier y Bastidor** — próximamente. Van a alimentar al operador con
   información que Hilván no tiene. Cuando existan, se agregan acá.

Ninguna fuente es obligatoria: por el honor system, una misión puede no venir de
ninguna de las tres.

## Jornadas

Las misiones diarias respetan la jornada de cada persona. No es un detalle
administrativo: una misión que llega en el día libre es una intromisión, y una
que vence porque la persona no estaba es una trampa.

| Persona | Días | Notas |
|---|---|---|
| Tomás   | Todos los días | — |
| Natalia | Libre el **martes**; el **viernes** trabaja online | |
| Simón   | Libre el **viernes**; el **jueves** trabaja online | |
| Josué   | Horario propio | No hay días fijos que asumir |
| Diego, FOCH, Ignacio | — | **Sin responsabilidades: no reciben misiones.** |

## Responsabilidades

Las misiones se dirigen a **áreas con dueño**, no a personas con un cargo fijo.
Natalia y Simón montan "en ocasiones", los dos proponen contenidos, los dos
hacen CRM: una lista de roles cerrada envejece en semanas. Cuando un área cambia
de manos, se cambia el dueño acá y las misiones siguen al área.

| Área | Dueño | Notas |
|---|---|---|
| CRM y respuesta a prospectos | Natalia, Simón | **Lo más importante hoy para ambos.** |
| Contenidos culturales | Natalia | Área en formación: ella la está generando. |
| Producción | Natalia | En ocasiones. |
| Asistencia a estudiantes | Simón | |
| Rental | Simón | |
| Montaje | Simón (principal) | Natalia y Tomás también montan. Tomás hace el montaje final. |
| Propuesta de contenidos | Natalia, Simón | |
| Brief, pitch, reuniones de venta importantes | Tomás | |
| Post: color y sonido final | Tomás | |
| Revisión del trabajo de todos | Tomás | |
| Gestión administrativa y financiera | Tomás | |
| Desarrollo de herramientas | Tomás | Incluye Hilván, Atelier y Bastidor. |
| Proyectos propios | Josué | Sin responsabilidades de CRM — ver abajo. |

Natalia y Simón tienen acceso a contenidos educativos (Despega Creativo, Shoot
First Academy). Sirve como insumo de misiones de formación, no como obligación.

### Lo que la app sabe y lo que no

Distinción central para redactar misiones de CRM:

- **La pertenencia está instrumentada.** Los 58 prospectos tienen
  `responsable_id`: Natalia 35, Simón 21, Tomás 2. Una misión puede apuntar con
  precisión a los prospectos de una persona.
- **La ejecución no.** Las 56 interacciones de los últimos 60 días se
  registraron **sin autor** — las cargó el operador. No hay forma de saber si
  actuó la persona o el agente en su nombre.

Por eso: **la app apunta, la persona declara.** Se puede decir "12 de tus 35
prospectos llevan diez días sin movimiento" con total exactitud, y no se puede
verificar que los haya movido. Está bien: para eso es el honor system.

### Josué

Trae proyectos propios y **no tiene responsabilidades de CRM**. Se ha resistido a
usar Hilván de forma activa, y hay interés en buscarle incentivos.

Ojo con la contradicción antes de intentarlo: **la misión vive dentro de la app
que él no abre.** Un sistema de misiones no puede atraer a quien no entra —
llegaría a un lugar donde no está. Si se quiere avanzar, el incentivo tiene que
alcanzarlo por fuera o la entrada tiene que valerle más que la fricción. No es un
problema de misiones; es anterior.

### Practicantes

Cuando haya practicantes, las primeras misiones son de **familiarización con la
organización**, no de producción.

Es el mejor calce que tiene este mecanismo: son acotadas, tienen orden, terminan
de verdad —se deja de ser nuevo— y son el único caso donde inventar la misión es
legítimo, porque el objetivo *es* hacerla, no el resultado que produce.

## Vencimiento

- **Las misiones no cumplidas vencen.** No se arrastran, no se acumulan, no se
  reprograman. Un tablero que crece es una máquina de culpa y deja de leerse.
- **En el día libre no se genera misión diaria.**
- **La misión del día hábil anterior sí sigue viva durante el día libre.** O sea:
  el vencimiento se cuenta en **días hábiles de esa persona**, no en días de
  calendario. La misión de Natalia del lunes no muere porque pasó el martes.
- Vencer es silencioso. No se avisa, no se reprocha, no queda registro visible
  para nadie. La misión simplemente ya no está.

## Visibilidad

- Cada persona ve **sus** misiones.
- **Tomás ve las de todos** y participa en crearlas.
- *Pendiente:* definir cómo participa —si aprueba borradores del operador, si
  las escribe él, o ambas.

## Dónde aparecen

- **Al iniciar sesión**, como aviso.
- **En `/perfil`**, junto al resto de los logros.

*Pendiente:* la forma exacta del aviso de inicio de sesión.

## Diarias y semanales

- **La semanal no es la suma de las diarias.** Es otra cosa.
- *Pendiente:* qué es. Debe ser algo que solo tenga sentido a escala de semana —
  algo que no se pueda partir en siete pedazos sin perder el sentido.

## Pendiente de decidir

1. **Qué es la misión semanal.**
3. **Cómo participa Tomás en la creación.**
4. **La forma del aviso al iniciar sesión.**
5. **Si las misiones dan medallas.** No decidido, y conviene decidirlo tarde: el
   sistema de medallas ya funciona solo y acoplarlos temprano hace difícil
   cambiar cualquiera de los dos. Ver [`gamificacion.md`](gamificacion.md).
