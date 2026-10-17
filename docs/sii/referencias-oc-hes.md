# OC y HES — de dónde salen y cómo llegan a la factura

> Oct-2026. Tabla `cotizacion_referencias` (`sql/cotizacion_referencias.sql`). Lógica pura en `lib/cotizacion-referencias.ts` (tests en `tests/cotizacion-referencias.test.ts`).

## Para qué

Las facturas de Casa Hiedra llevan referencias: la **OC** del cliente (código SII `801`) y, en Falabella, también la **HES** (Hoja de Entrada de Servicio). Antes se copiaban a mano desde el correo; ahora quedan guardadas en cada cotización y el borrador de factura (`scripts/sii/factura.mjs`) las toma solo: confirmadas, OC primero, máximo 3, y la glosa de la OC si existe.

## Estados

| Estado | Quién | Va a la factura |
|---|---|---|
| `propuesta` | La deja el operador al leer un correo | No |
| `confirmada` | Tomás (botón en el Panel de facturación, o por chat) o la escribe a mano | Sí |
| `descartada` | Tomás dijo que no corresponde | No — se guarda para no volver a proponerla |

Confirmada exige número y fecha. Las propuestas de HES de Falabella llegan **sin número**: Tomás lo escribe al confirmar.

## Qué exige cada cliente

`clientes.exige_oc` / `clientes.exige_hes`, del cliente que recibe la factura (la agencia si hay; si no, el cliente). Inicial, según las facturas de 2026: **Falabella** (Aldo Shoes y ULA) OC + HES; **Republik / Estudio Prende** OC. Con eso cada cotización por facturar muestra OC y HES como ✓ confirmada, ? por confirmar, falta o nada (no aplica).

## De dónde salen (formatos observados)

| Cliente | Documento | Remitente / asunto | Dónde está el número |
|---|---|---|---|
| Falabella | OC | `proveedores_dos@falabella.cl`, asunto `Pedido6001807651` | Asunto. Fecha: "contabilizado el MM/DD/AAAA" del cuerpo |
| Falabella | HES | `aaromerov@falabella.cl` (u otro `@falabella.cl`), asunto `Nuevo Documento HES` | **Solo en el PDF adjunto** (el conector de Gmail no abre adjuntos y el navegador integrado no tiene sesión de Gmail) |
| Estudio Prende | OC | `info@unabase.com`, asunto `[Estudio Prende Spa (Republik)] … Orden de Compra Nº 007225: <trabajo>` | Asunto y cuerpo. Fecha: la del correo |
| Cualquiera | OC y/o HES | Una persona del cliente: "Te mando OC y HES de este contenido: 6001783114 1003012275" | Texto del correo |

`leerCorreoReferencia()` reconoce estos cuatro formatos; lo que no reconoce no se propone. Llegan a tres casillas (tomas@casahiedra, tomasmontealegrem@gmail, estudiocasahiedra@gmail) y todas se ven desde el mismo Gmail.

## Quién lee el correo

La tarea programada local `santander-correos-a-hilvan` (21:00), **Parte D**: busca esos correos de los últimos 14 días, salta los ya procesados (`correos_vistos` de `hilvan_referencias_pendientes`) y, si hay UNA cotización candidata clara (mismo cliente, sin esa referencia, nombre parecido), la propone con `hilvan_proponer_referencia`. Si duda, no propone y lo lista para Tomás. **Nunca confirma.**

## Herramientas

- `hilvan_referencias_pendientes` — aprobadas sin factura con su estado de OC/HES, sus referencias y `correos_vistos`.
- `hilvan_proponer_referencia` — propone desde un correo (Hilván lo lee). Idempotente por cotización + correo. Reversible con `hilvan_deshacer`.
- `hilvan_confirmar_referencia` — solo con el OK explícito de Tomás en la conversación. Reversible.
- Editor: sección **Referencias** del Panel de facturación (agregar a mano, confirmar, escribir el número de la HES, descartar; Ctrl+Z). Vista `/financiero/cobrar` → "Por facturar": marcas OC/HES, filtro "Sin OC / sin HES" y "Copiar lista para el cliente" (reemplaza el correo "OC pendientes").
