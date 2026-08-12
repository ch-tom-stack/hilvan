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

1. **Qué es responsabilidad de cada persona.** Es lo que falta para poder
   redactar misiones que no sean genéricas. Sin esto, una misión personalizada es
   una cuota inventada con otro nombre.
2. **Qué es la misión semanal.**
3. **Cómo participa Tomás en la creación.**
4. **La forma del aviso al iniciar sesión.**
5. **Si las misiones dan medallas.** No decidido, y conviene decidirlo tarde: el
   sistema de medallas ya funciona solo y acoplarlos temprano hace difícil
   cambiar cualquiera de los dos. Ver [`gamificacion.md`](gamificacion.md).
