# Diseño — API + MCP de Hilván para agentes

Documento de diseño (no es implementación). Define cómo un agente de Claude podría operar Hilván de forma directa: **ingresar boletas y pagos entendiendo los archivos**, **consultar el estado financiero**, y **generar feedback** para mejorar la app. Decisiones tomadas con Tomás:

- **Alcance:** operación completa (ingesta + consultas) + loop de feedback, por fases.
- **Modelo de seguridad por defecto:** **borrador → Tomás confirma**. El agente nunca deja un dato financiero firme por sí solo.

---

## 1. Por qué un MCP (y no automatizar el navegador)

Hoy un agente solo podría operar Hilván "clickeando" la web (frágil: si cambia el layout, se rompe; difícil de auditar). La alternativa correcta es exponer las operaciones de Hilván como **herramientas tipadas** vía un **servidor MCP**. Así:

- Cualquier agente de Claude (este chat, un Cowork, uno agendado) las llama con razonamiento — incluyendo "lee este PDF de boleta y créala".
- Entradas validadas, errores claros, y **todo queda registrado** (auditoría).
- Es más seguro y estable que el navegador.

El MCP se apoya en una **API HTTP autenticada** (la capa de verdad); el MCP es la "cara" que el agente entiende.

```
Agente (Claude/Cowork)  →  MCP de Hilván  →  API HTTP autenticada  →  Supabase
                                                   ↑
                                         parse-factura (ya existe)
```

---

## 2. Principio rector: borrador → confirmar

Toda operación que **escribe plata** crea un registro en estado **propuesto/borrador**, nunca firme. Un humano lo confirma en Hilván.

- **Gastos/boletas:** Hilván ya tiene estados (`enviada → aprobada → pago_aprobado`). El agente crea el gasto como **propuesto por agente** (un estado/flag nuevo, p. ej. `origen='agente'` + `estado='enviada'`), y Tomás lo aprueba como hoy. Cero cambios de flujo para el humano.
- **Pagos recibidos:** hoy no hay estado intermedio. Se agrega una **bandeja de propuestas** (`propuestas_agente`): el agente deja "pago propuesto para CH-COT-007, $X, fecha Y, según comprobante adjunto"; Tomás confirma con un clic y ahí recién se escribe `fecha_pago_recibido`.
- **Toda propuesta es reversible** hasta que se confirma, y queda con su archivo fuente y la razón del agente.

Resultado: el agente acelera la carga, pero **Tomás mantiene el control** de lo que queda firme.

---

## 3. Autenticación y permisos

- **Token de servicio dedicado** para el agente (no la cuenta de un humano). Revocable.
- El agente opera con un **rol acotado** equivalente a `contabilidad` (ve cotizaciones, centro de costos, financiero; nada más).
- El token solo habilita: **crear propuestas** y **leer**. **No** puede confirmar, aprobar, borrar ni cambiar configuración. Confirmar/aprobar es exclusivo de humanos.
- Toda llamada del agente queda en un **log de auditoría** (quién/qué/cuándo/desde qué archivo).

---

## 4. Operaciones expuestas (herramientas MCP)

### Ingesta (escriben, siempre como propuesta)
- `proponer_boleta_proyecto` — boleta/gasto contra un ítem de una cotización. Args: cotización/ítem, tipo, monto (neto o bruto), tipo_documento, emisor, archivo. Devuelve la propuesta con su retención calculada.
- `proponer_boleta_mensual` — gasto/boleta operacional del mes (lo que acabamos de habilitar en la UI). Mismos campos.
- `proponer_pago_recibido` — marca propuesta de pago de una cotización (fecha, monto, folio).
- `ingerir_documento` — recibe un PDF/imagen, llama a **parse-factura** (ya existe), y devuelve los datos estructurados + una propuesta pre-armada para que el agente la complete y envíe. Este es el "entiende el archivo como el chat".

### Consultas (solo lectura)
- `listar_por_cobrar` — cotizaciones facturadas sin pago, con aging.
- `listar_propuestas_pendientes` — lo que el agente dejó esperando confirmación.
- `estado_financiero` — resumen (por facturar, por cobrar, obligaciones).
- `buscar_colaborador` / `buscar_cotizacion` — para resolver a qué se asocia una boleta.

### Feedback (fase posterior)
- `registrar_observacion` — el agente anota un hallazgo ("3 boletas de Josué este mes con montos distintos", "cotización CH-COT-005 facturada hace 65 días sin pago"). Va a una bandeja que Tomás revisa.

---

## 5. Flujo típico (ejemplo real)

1. Llega la boleta de Josué (PDF) al agente.
2. Agente llama `ingerir_documento(pdf)` → parse-factura extrae RUT, nombre, monto.
3. Agente razona: "es honorarios mensual de Josué, monto neto $250.000" y llama `proponer_boleta_mensual(...)`.
4. La propuesta queda en la **bandeja de Tomás** con el PDF, los datos y el cálculo de retención (bruto $295.508 · ret. $45.508).
5. Tomás abre Hilván, revisa, y **confirma** (o corrige). Recién ahí el gasto queda firme.
6. Queda registro de que lo propuso el agente, desde qué archivo.

---

## 6. Auditoría y reversibilidad

- Tabla `agente_acciones`: cada llamada (herramienta, args resumidos, resultado, archivo fuente, timestamp).
- Toda propuesta tiene archivo fuente adjunto y "razón del agente".
- Una propuesta no confirmada se puede descartar sin rastro en los datos reales.

---

## 7. Fases sugeridas

| Fase | Qué entrega | Esfuerzo aprox. |
|---|---|---|
| **0 — API base + auth** | Endpoints HTTP autenticados con token de servicio + log de auditoría | Medio |
| **1 — Ingesta con borrador** | `ingerir_documento`, `proponer_boleta_*`, `proponer_pago_recibido` + bandeja de confirmación en Hilván | Medio-alto |
| **2 — MCP** | Servidor MCP que envuelve la API; conectar a Cowork/este chat | Medio |
| **3 — Consultas** | `listar_por_cobrar`, `estado_financiero`, etc. | Bajo |
| **4 — Feedback** | `registrar_observacion` + bandeja de observaciones; opcional agente agendado de solo lectura | Medio |

Recomendación: 0 → 1 → 2 primero (resuelve el dolor de hoy: cargar boletas con un agente, seguro). Consultas y feedback después.

---

## 8. Decisiones abiertas para Tomás (antes de construir)

1. **¿Dónde vive la "bandeja de confirmación"?** ¿Una sección nueva en Hilván (`/costos/propuestas`) donde apruebas lo que dejó el agente? (recomendado)
2. **¿El agente puede proponer en cualquier proyecto, o solo en costos mensuales al principio?** (empezar acotado reduce riesgo).
3. **¿Quién puede confirmar?** ¿Solo admin, o también contabilidad?
4. **Límites:** ¿tope de monto por propuesta sobre el cual siempre se exige doble revisión?
5. **Hosting del MCP:** local (corre en tu máquina/Cowork) vs desplegado (Vercel/servidor). Local es más simple para empezar.

---

## 9. Riesgos y mitigaciones

- **Dato financiero equivocado** → el modelo borrador→confirmar lo contiene; nada queda firme sin humano.
- **PDF mal parseado** → el agente muestra lo detectado y la propuesta es revisable; parse-factura ya es "best-effort" y el humano corrige.
- **Token filtrado** → revocable, permisos mínimos (solo proponer/leer), auditoría.
- **Sobre-automatización** → empezar acotado (costos mensuales), expandir con confianza.

---

*Documento de diseño — Hilván. Próximo paso: si se aprueba el enfoque, detallar el contrato de la API (endpoints, esquemas) de la Fase 0–1.*

---
---

# v2 — Decisiones de Tomás, contrato de API e ideas (jun 2026)

## Decisiones tomadas
1. **La aprobación es en el chat.** El agente propone en la conversación, Tomás aprueba ahí mismo, y el agente **escribe directo** en Hilván. No se construye bandeja `/costos/propuestas`. → La seguridad ya no es una barrera en la app, sino: **(a)** el agente confirma en chat antes de cada escritura, **(b)** todo queda en log de auditoría, **(c)** todo es reversible (deshacer).
2. **Alcance total**, y más adelante también **borradores de planes de rodaje**.
3. **Corre localmente** (Cowork en la máquina de Tomás). El MCP local guarda el token y llama a la API desplegada.

> Trade-off honesto: dar escritura directa al agente es más potente y más cómodo, pero sube el riesgo respecto al modelo borrador→bandeja. Se mitiga con: confirmación conversacional obligatoria antes de escribir, token de permisos mínimos y revocable, log de auditoría, y un `deshacer` por acción.

## Arquitectura (local)
```
Cowork (en tu Mac) → MCP de Hilván (local, guarda el token) → HTTPS → app.casahiedra.com/api/agent/* → Supabase
                                                                              ↑ parse-factura (ya existe)
```

## Contrato de API — Fase 0–1 (`/api/agent/*`)

**Auth:** header `Authorization: Bearer ${HILVAN_AGENT_TOKEN}` en todas. Token = env var en Vercel + en el MCP local. Middleware valida y registra cada llamada en `agente_acciones`.

### Lectura
| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/agent/por-cobrar` | `[{cotizacion_id, numero, cliente, monto, fecha_factura_emitida, dias_aging}]` |
| GET | `/api/agent/cotizaciones?q=` | `[{id, numero, cliente, estado, total, fecha_factura_emitida, fecha_pago_recibido}]` |
| GET | `/api/agent/colaboradores?q=` | `[{id, nombre, rut}]` |
| GET | `/api/agent/clientes?q=` | `[{id, nombre, empresa, rut, email}]` — busca clientes por nombre/empresa/RUT (máx 50). Para obtener `cliente_id` antes de crear una cotización. |
| GET | `/api/agent/rendicion-mensual?periodo=YYYY-MM` | `{id, periodo, estado, gastos:[...]}` |
| GET | `/api/agent/gastos?q=&tipo_documento=&periodo=&estado=` | `[{origen, id, contexto, descripcion, tipo, tipo_documento, monto, rut_emisor, razon_social_emisor, folio, estado, retencion, neto, fecha_documento, created_at}]` — lista unificada de gastos de proyecto y mensuales en cualquier estado (máx 200, desc por fecha). El filtro `periodo` cuadra por **mes tributario**: usa `fecha_documento` cuando existe, con fallback a `created_at`. La `retencion`/`neto` del display se calculan con el año de `fecha_documento ?? created_at`. El texto `q` matchea contra rut_emisor, razon_social_emisor, descripcion **y folio** (deduplicar el RCV por RUT+folio). |
| GET | `/api/agent/cotizacion-items?numero=CH-COT-005` | `[{cotizacion_id, numero, version, variante, departamento, subgrupo, item_id, nombre, tipo}]` — ítems planos de todas las versiones del grupo; o `?cotizacion_id=<uuid>` para una cotización específica. Necesario para obtener `cotizacion_item_id` antes de llamar a `gasto-proyecto`. |
| GET | `/api/agent/estado-financiero?periodo=YYYY-MM` | `{por_facturar, por_cobrar, obligaciones}` |
| GET | `/api/agent/rodajes?q=` | `[{id, nombre, fecha, estado, cotizacion_numero}]` — lista/busca rodajes (máx 50). |
| GET | `/api/agent/rodaje?id=<uuid>` | `{id, nombre, fecha, estado, proyecto_id, cotizacion_id, cotizacion_numero, locacion_nombre, hora_llamado_general, departamentos:[...], equipo:[{nombre, rol, departamento, ...}], bloques:[{orden, titulo, duracion_min, hora_inicio, hora_fin, ...}], citaciones:N}` — detalle con horas de bloques calculadas vía cascada. |
| GET | `/api/agent/acciones` | log de auditoría del agente |
| GET | `/api/agent/movimientos?conciliado=&tipo=&fuente=&desde=&hasta=&q=` | `[{id, fecha, descripcion, monto, tipo:"cargo"\|"abono", fuente, referencia, conciliado, conciliado_tabla, conciliado_id, created_at}]` — movimientos bancarios/tarjeta importados (máx 200, desc por fecha). `conciliado` = `true`/`false`; `desde`/`hasta` filtran por fecha (YYYY-MM-DD); `q` matchea descripcion/referencia. |
| GET | `/api/agent/cuotas-credito?pagada=` | `[{id, gasto_fijo_id, credito, acreedor, tipo_credito, numero_cuota, fecha_vencimiento, monto, pagada, fecha_pago}]` — cuotas de créditos/gastos fijos con su crédito. `pagada` default `false` (solo pendientes). Para cruzar pagos de crédito antes de conciliar con `match_tabla="gastos_fijos_cuotas"`. |

> **Nota conciliación:** `/api/agent/gastos` ahora también devuelve `pagado` y `fecha_pago` por gasto (estado de pago a nivel gasto, seteado al conciliar un cargo).

### Procesar archivo
| Método | Ruta | Body | Devuelve |
|---|---|---|---|
| POST | `/api/agent/parse-documento` | multipart `file` (PDF) | `{rut_emisor, razon_social, folio, fecha, monto}` |
| POST | `/api/agent/upload` | multipart `file` | `{url}` |

### Escritura (confirmadas en chat)
| Método | Ruta | Body | Devuelve |
|---|---|---|---|
| POST | `/api/agent/cliente` | `{nombre, empresa?, email?, telefono?, rut?, direccion?, ciudad?, pais?, notas?}` | `{id, nombre}` — crea un cliente igual que en la UI. `created_by` se atribuye a un perfil real (admin preferido). Reversible: deshacer (`crear-cliente`) borra la fila. |
| POST | `/api/agent/crear-cotizacion` | `{nombre, cliente_id?\|cliente_nombre_libre?, cliente_email_libre?, proyecto_id?, con_iva?(def true), formato_pdf?(simple\|detallado, def detallado), descuento_global?, descuento_global_tipo?(porcentaje\|monto), descripcion?, notas_internas?, notas_cliente?, fecha_factura_emitida?, numero_factura?, departamentos?:[{nombre, orden?, items?:[Item], subgrupos?:[{nombre, orden?, items?:[Item]}]}]}` donde `Item = {tipo(rol\|equipo_ch\|equipo_externo\|servicio\|consumible\|post_produccion\|locacion\|cast\|otro), nombre, descripcion?, con_boleta?, tasa_boleta?, precio_neto_proveedor?, precio_bruto?, precio_cliente?, precio_cliente_personalizado?, cantidad?, dias?, unidad?(día\|hora\|jornada\|unidad\|proyecto), incluido?, descuento_item?, descuento_item_tipo?, equipo_id?, tarifa_id?, orden?}` | `{cotizacion_id, numero:"CH-COT-xxx", url:"/cotizaciones/<id>"}` — crea una cotización COMPLETA idéntica a la de un usuario, **100% editable en la UI** (replica el shape de `copiarItem`/`crearCotizacion`). Genera el número con `siguiente_numero_grupo`; crea grupo + v1 + departamentos → subgrupos → ítems. Sin `departamentos` → crea los 8 por defecto (como "Nueva cotización"). `created_by` (grupo + cotización) se atribuye a un perfil admin real → editable por cualquier admin/productor con sesión (editar **no** es owner-scoped). **Valida TODO antes de escribir** (400 sin escribir si algo falla). Si falla a mitad, registra acción reversible (ok:true con grupo_id+cotizacion_id) y devuelve 500. Reversible: deshacer (`crear-cotizacion`) borra todo en cascada (items → subgrupos → departamentos → cotización → grupo). |
| POST | `/api/agent/gasto-mensual` | `{periodo?|rendicion_mensual_id?, descripcion, categoria, tipo_documento, monto, monto_es:"neto"\|"bruto", rut_emisor?, razon_social_emisor?, folio?, factura_casa_hiedra?, archivo_url?, fecha_documento?:"YYYY-MM-DD"}` | `{id, monto_bruto, retencion, neto}` |
| POST | `/api/agent/gasto-proyecto` | `{cotizacion_item_id, tipo, descripcion, tipo_documento, monto, monto_es, rut_emisor?, razon_social_emisor?, folio?, archivo_url?, fecha_documento?:"YYYY-MM-DD"}` (crea la rendición si falta) | gasto creado |
| POST | `/api/agent/crear-gastos-bulk` | `{gastos:[Fila]}` donde cada `Fila = {origen:"mensual"\|"proyecto", tipo_documento, monto, monto_es, descripcion, rut_emisor?, razon_social_emisor?, folio?, fecha_documento?, factura_casa_hiedra?, ...por origen}`. Mensual exige `periodo`(YYYY-MM)+`categoria`; proyecto exige `cotizacion_item_id` (se verifica que exista). **Valida TODAS las filas antes de escribir** (si una falla → 400 con `fila N: motivo`, sin escribir nada). Inserta fila por fila. | `{creados:N, detalle:{mensual, proyecto}, ids:[{tabla,id}]}` — reversible **en bloque** (deshacer borra cada `{tabla,id}`). Si un insert falla a mitad, registra lo creado como reversible y devuelve 500 `{error, creados}`. |
| POST | `/api/agent/gasto-fecha` | `{gasto_id, origen:"proyecto"\|"mensual", fecha_documento:"YYYY-MM-DD"}` | `{ok, gasto_id, fecha_documento, fecha_anterior}` — edita la fecha real de un gasto existente; reversible (deshacer restaura fecha_anterior, no borra la fila) |
| POST | `/api/agent/editar-gasto` | `{gasto_id, origen:"proyecto"\|"mensual", tipo_documento?, folio?}` (al menos uno de tipo_documento/folio) | `{ok, gasto_id, origen, previo:{tipo_documento, folio}, cambios}` — corrige **metadata** (tipo_documento y/o folio) de un gasto ya cargado; **NO recalcula el monto**. `tipo_documento` validado contra `boleta\|boleta_consumo\|factura\|exenta\|sin_documento\|nota_credito`. Lee los valores previos y los guarda en el log; reversible (deshacer **restaura** tipo_documento/folio previos, no borra la fila). |
| POST | `/api/agent/crear-nota-credito` | `{origen:"mensual"\|"proyecto", monto>0 (valor absoluto), descripcion, folio?, fecha_documento?, rut_emisor?, razon_social_emisor?, referencia_folio?, + mensual:(periodo+categoria) \| proyecto:(cotizacion_item_id)}` (crea la rendición padre si falta) | `{id, origen, monto}` (monto **negativo**) — registra una **nota de crédito** (NC, Tipo Doc 61) como gasto con `tipo_documento="nota_credito"` y monto = `-abs(monto)`, para que **RESTE** una factura previa. **NO aplica retención.** Si viene `referencia_folio`, se anexa a la descripción como `(NC ref factura <folio>)`. Reversible: deshacer **borra** la fila (rama de gastos genérica, vía resultado_tabla/_id). |
| POST | `/api/agent/pago-recibido` | `{cotizacion_id, fecha_pago_recibido, fecha_factura_emitida?, numero_factura?}` | `{ok, cotizacion}` |
| POST | `/api/agent/registrar-factura-emitida` | `{cotizacion_id, fecha_factura_emitida:"YYYY-MM-DD", numero_factura?}` | `{ok, cotizacion}` — marca la factura **emitida** (venta), separado del pago; **NO toca** fecha_pago_recibido. Lee los valores previos y los guarda en el log; reversible (deshacer **restaura** fecha/número anteriores, no a ciegas null). |
| POST | `/api/agent/sembrar-rodaje` | `{cotizacion_id, nombre?, fecha?:"YYYY-MM-DD"}` | `{rodaje_id, estado:"borrador", creado:{departamentos, equipo, bloques}, url}` — crea un borrador de rodaje desde una cotización: rodaje + departamentos (de `cotizacion_departamentos`) + equipo (ítems tipo `rol`/`cast`, nombre=rol) + plan esqueleto de bloques (CALL, PRE SET, ALMUERZO, DESMONTAJE, CIERRE de `PLANTILLAS_BLOQUES`). Reversible: deshacer borra el rodaje completo. |
| POST | `/api/agent/generar-citaciones` | `{rodaje_id}` | `{creadas:N, citaciones:[{persona, token, url:"/citacion/<token>"}]}` — crea una citación (token UUID) por persona del equipo sin citación. **NO envía email/WhatsApp.** Reversible: deshacer borra solo las citaciones creadas (`payload.citacion_ids`). |
| POST | `/api/agent/importar-movimientos` | `{movimientos:[{fecha:"YYYY-MM-DD", monto>0, tipo:"cargo"\|"abono", descripcion?, fuente?, referencia?}]}` | `{creados:N, detalle:{cargos, abonos}, ids:[{tabla,id}]}` — importa el extracto a `movimientos_bancarios`. **Valida TODAS las filas antes de escribir** (si una falla → 400 `fila N: motivo`, sin escribir nada). Reversible **en bloque** (deshacer borra cada movimiento, pero **aborta** si alguno ya está conciliado). Si un insert falla a mitad, registra lo creado como reversible y devuelve 500 `{error, creados}`. |
| POST | `/api/agent/conciliar` | `{movimiento_id, match_tabla:"rendicion_gastos"\|"rendicion_mensual_gastos"\|"gastos_fijos_cuotas"\|"cotizaciones", match_id, fecha_pago?}` | `{ok, conciliado:{movimiento_id, match_tabla, match_id, fecha_pago, tipo, monto}}` — cruza un movimiento con una fila de Hilván y **marca pagada** la obligación. El movimiento debe existir y NO estar ya conciliado (400 si lo está). **Coherencia tipo↔match:** `abono` (entrada) solo con `cotizaciones`; `cargo` (salida) solo con las otras tres. `fecha_pago` efectiva = body.fecha_pago \|\| movimiento.fecha. Marca: gastos → `pagado/fecha_pago`; cuotas → `pagada/fecha_pago`; cotizaciones → `fecha_pago_recibido` (NO toca factura). Lee el estado previo para reversibilidad. Reversible (deshacer **restaura** el estado previo y des-concilia el movimiento). |
| POST | `/api/agent/deshacer` | `{accion_id}` | revierte la última escritura registrada — ramifica por herramienta ANTES que por tabla: `crear-cotizacion` → borra la cotización completa en cascada (cotizacion_items → cotizacion_subgrupos → cotizacion_departamentos por cotizacion_id → cotizaciones → cotizacion_grupos por `payload.grupo_id`); va **antes** de la rama genérica `resultado_tabla==='cotizaciones'` (pago); `crear-cliente` → DELETE de la fila de `clientes` (`resultado_id`); `crear-gastos-bulk` → borra cada `payload.creados:[{tabla,id}]` (no usa resultado_tabla/_id); `importar-movimientos` → borra cada `payload.creados` de `movimientos_bancarios`, pero **aborta 400** si alguno ya está conciliado (no usa resultado_tabla/_id); `registrar-factura-emitida` → UPDATE cotizaciones restaurando `payload.fecha_anterior`/`numero_anterior` (va antes de la rama genérica de pago); `conciliar` → restaura el estado previo de la fila match (`payload.previo` según `payload.match_tabla`) y vuelve el movimiento a `conciliado=false`; `sembrar-rodaje` → borra el rodaje completo (hijos primero: citaciones, equipo, bloques, escenas, departamentos, locaciones; luego `rodajes`); `generar-citaciones` → borra solo `payload.citacion_ids`; `gasto-fecha` → UPDATE fecha_anterior; `editar-gasto` → UPDATE tipo_documento/folio a `payload.previo` (restaura, no borra); creaciones de gasto (incluida `crear-nota-credito`) → DELETE; pago → fecha_pago_recibido null |

**Regla de la capa write:** `monto_es` permite mandar neto o bruto; el server calcula y **persiste el bruto** + retención (usa `calcularRetencion`, tasa por año (2026: 15,25%)). `fecha_documento` (opcional, YYYY-MM-DD) es la fecha real de la boleta/documento: define el año usado para la tasa de retención (fallback: año del período en mensual, o año actual) y permite cuadrar el gasto por su mes tributario. Todo write inserta en `agente_acciones` con archivo fuente y resumen.

### Herramientas MCP (1:1 con los endpoints)
`hilvan_por_cobrar`, `hilvan_buscar_cotizacion`, `hilvan_buscar_colaborador`, `hilvan_rendicion_mensual`, `hilvan_buscar_gastos`, `hilvan_items_cotizacion`, `hilvan_estado_financiero`, `hilvan_listar_rodajes`, `hilvan_rodaje`, `hilvan_parse_documento`, `hilvan_subir_archivo`, `hilvan_crear_gasto_mensual`, `hilvan_crear_gasto_proyecto`, `hilvan_crear_gastos_bulk`, `hilvan_set_fecha_documento`, `hilvan_crear_nota_credito`, `hilvan_editar_gasto`, `hilvan_registrar_pago`, `hilvan_registrar_factura_emitida`, `hilvan_sembrar_rodaje`, `hilvan_generar_citaciones`, `hilvan_movimientos`, `hilvan_cuotas_credito`, `hilvan_importar_movimientos`, `hilvan_conciliar`, `hilvan_deshacer`.

> **Conciliación bancaria:** el agente importa el extracto (`hilvan_importar_movimientos`), revisa los cargos/abonos sin conciliar (`hilvan_movimientos?conciliado=false`), los cruza con Hilván (gastos vía `hilvan_buscar_gastos`, cuotas de crédito vía `hilvan_cuotas_credito`, ventas vía `hilvan_por_cobrar`) y marca pagado lo que coincide (`hilvan_conciliar`). Las escrituras CONFIRMAN con el usuario antes y todo es reversible con `hilvan_deshacer`.

> **Rodaje (escritura):** `hilvan_sembrar_rodaje` y `hilvan_generar_citaciones` son de **mejor esfuerzo** y crean siempre en estado borrador; el humano refina. El agente **nunca envía** citaciones — solo genera los links.

## Investigación — qué pueden hacer agentes de IA en Hilván

### Dentro del alcance (el cowork de carga/operación)
- **Ingesta de boletas/facturas por PDF** → parse + crear gasto (mensual o proyecto). [núcleo]
- **Registro de pagos recibidos** desde un comprobante/aviso.
- **Conciliación de nómina:** cruzar boletas cargadas vs nómina (Josué/Simón) y avisar si falta o no calza un monto.
- **Cobranza asistida:** detectar facturas >X días sin pago y redactar el correo de cobro (borrador).
- **Cierre de mes:** armar el resumen de costos del mes y señalar faltantes ("falta la boleta de Simón").

### Adyacente / fuera del alcance actual (más ambicioso)
- **Borradores de planes de rodaje** (lo que pediste): desde una cotización aprobada + locaciones + equipo, pre-armar el plan y las citaciones.
- **Cotizaciones asistidas:** desde un brief del cliente, borrador de cotización con ítems y tarifas.
- **Onboarding de colaboradores:** preparar contrato `.docx` + link de onboarding desde los datos.
- **Análisis financiero conversacional:** "¿cómo vamos este mes?" → el agente lee y responde.
- **Clasificación de eventos de Google Calendar** (ya existe InboxGCal — un agente podría clasificar rodaje/reunión/ignorar).
- **Auditoría continua agendada:** agente de solo lectura que revisa datos inconsistentes (RUT mal, montos raros, cotización sin folio) y reporta.
- **Feedback de producto:** el agente observa patrones de uso/datos y sugiere mejoras a la app.

### Habilitador transversal
- El **MCP de Hilván** es la base de todo lo anterior. Construirlo bien una vez = todas estas ideas se vuelven incrementales.

## Próximo paso técnico
Si apruebas el contrato, detallar: esquemas JSON exactos (zod), el middleware de auth + auditoría, y un esqueleto del servidor MCP local. Construcción sugerida: Fase 0 (auth+audit) → endpoints de escritura mensual (tu dolor de hoy) → MCP local → resto.
