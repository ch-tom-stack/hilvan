# Emitir facturas desde Hilván — lo verificado y lo que falta

> Estado al 17-oct-2026. Nada construido todavía; esto es la base para diseñarlo.

## Decisiones de Tomás

- Hoy se factura **a mano en sii.cl**, en el portal gratuito del SII (MIPYME), con su RUT personal.
- Hilván **prepara el borrador**; **la firma la hace Tomás en el SII**. Hilván nunca emite.
- La glosa **copia la OC** cuando hay; si no, puede ser más detallada, dentro de los límites de MIPYME.
- Clave personal en el Llavero del Mac (servicio `sii`, cuenta `18932507-K`). El certificado digital **no** se guarda: no hace falta para borradores.

## Cómo se accede (verificado)

- MIPYME **no acepta la cuenta de la empresa**: se opera con la persona registrada como usuario autorizado (Tomás).
- La sesión personal vive en `~/.hilvan-sii-persona/.sii`, separada de la de la empresa (`~/.sii`, que el trabajador necesita para boletas de honorarios). Se corre la CLI con `HOME=~/.hilvan-sii-persona` y `PLAYWRIGHT_BROWSERS_PATH=~/Library/Caches/ms-playwright`; esa carpeta tiene un enlace `Library → ~/Library` para que el Llavero y Chromium sigan funcionando.
- Empresas autorizadas de Tomás en MIPYME: `77151117-1` (EIRL principal, afecta), `77956984-5` (Producciones Culturales, exenta) e `INDOMITA SPA` (fuera de alcance).
- La sesión del SII **no sobrevive la noche** (viva a las 19:27, vencida a las 11:06). El login con Llavero la reabre en ~35 s, un intento.

## Prueba del 17-oct-2026 (borrador creado y borrado)

Borrador a Estudio Prende por $3 → id `4764484` → vista previa PDF ("Vista Previa", "FOLIO NO ASIGNADO") → borrado; la lista de borradores quedó igual que antes. Lo que enseñó:

| Regla del SII | Consecuencia para Hilván |
|---|---|
| "Valor IVA debe ser mayor a 0" | Rechaza montos cuyo IVA redondea a 0 (factura afecta). |
| "En el campo de descripcion … se encontraron caracteres no validos" | La raya larga `—` no pasa; las tildes sí. Limpiar a Latin-1 / caracteres seguros antes de enviar. |
| Nombre del ítem: **25 caracteres** (`EFXP_NMB_nn`) | Nombre corto; el texto de la OC va en la descripción. |
| **10 líneas** de detalle como máximo | Agrupar ítems de la cotización si pasan de 10. |
| Receptor: razón social, dirección, comuna, ciudad y giro obligatorios | Con el RUT, el SII los sugiere de su registro; Hilván solo necesita el RUT del cliente. Si un valor no calza con las opciones del SII, la librería avisa cuál usó. |
| Ciudad del emisor obligatoria y no precargada | Fijarla en la configuración por empresa (`SANTIAGO`). |

## Referencias (OC / HES) — el vacío principal

Todas las facturas afectas revisadas llevan referencia: OC (`801`) siempre, y HES en Falabella. El borrador de la librería no las llena; **`scripts/sii/factura.mjs` sí** (ver abajo). Campos del formulario (capturados en vivo):

- Se activan con el checkbox `REF_SI_NO`; aparecen **3 filas** `_001`…`_003`.
- `EFXP_TPO_DOC_REF_00n` — select: `801` Orden de Compra, `HES` Hoja Entrada Servicio, `802` Nota de pedido, `803` Contrato, `33`/`34`/`61`… (factura, NC).
- `EFXP_FOLIO_REF_00n` — texto, máx. 18.
- `EFXP_FCH_REF_00n` — oculto, `AAAA-MM-DD`; lo arma `actulizaFecha()` al cambiar `cbo_dia_boleta_ref_0n` / `cbo_mes_boleta_ref_0n` / `cbo_anio_boleta_ref_0n` (años ofrecidos: 2024–2027).
- `EFXP_RAZON_REF_00n` — texto, máx. 90. En el PDF va antes del texto de la referencia; en las facturas de Casa Hiedra es el mismo folio.
- `EFXP_IND_GLOBAL_00n` — 1 carácter; solo puede valer `1`.
- Funciones del formulario: `printReferencias`, `insArrReferen` (onchange de tipo y folio), `validaRefernecias`.

### Llenado de referencias — construido y probado (17-oct-2026)

`scripts/sii/factura.mjs` → `prepararBorrador(core, runtime, doc, { outDir })`: usa las piezas de `sii-core` (`resolveAndSelectEmpresa`, `fillFactura`, `grabaBorrador`, `fetchPreviewPdf`) y, entre el llenado y la grabación, marca `REF_SI_NO`, llena hasta 3 referencias (`oc`, `hes`, `nota_pedido`, `contrato` o un código del SII), vuelve a correr `validaFacEx` y graba. También limpia el texto (raya larga → guion) y valida nombre ≤ 25 y ≤ 10 líneas. `runtimePersona(core)` apunta la librería a la sesión personal sin tocar la de la empresa. Tests: `tests/sii-factura.test.ts`.

Prueba: borrador `4764489` a Estudio Prende con OC `007060` (12-sep) y una HES de prueba → la vista previa mostró *"Orden Compra N° 007060 del 2026-09-12"* y *"TipoDoc. HES N° 1234567890 del 2026-10-17"*, igual que las facturas reales → borrado; la lista quedó como antes.

Ojo: importa módulos internos de `sii-core` 0.10.0 (`dist/portal/dte-mipyme.js`), que no son API pública. Al actualizar la librería, repetir esta prueba. A futuro conviene proponer las referencias como PR en `albertomarturelo/sii`.

## Lo que falta construir

1. **RUT de cada cliente** en Hilván (hoy 4 de 11) y la regla de a quién se factura: la agencia si existe, si no el cliente final.
2. **Armar la factura desde la cotización**: glosa (OC o detalle, ≤ 10 líneas, nombre ≤ 25), afecta/exenta según entidad, forma de pago (siempre crédito en lo revisado), limpieza de caracteres.
3. **Cola**: un tipo de pedido "borrador de factura" para el trabajador del Mac, con la sesión personal.
4. **Vista previa** guardada en Storage y aviso a Tomás para revisar y firmar en sii.cl.
5. **Detectar la emisión** con `sii dte emitidos` (folio, fecha, monto, estado) y registrarla en la cotización (`hilvan_registrar_factura_emitida`) con el PDF real (`sii dte pdf`).
6. **Evitar duplicados**: no preparar una segunda factura para una cotización que ya tiene una (en 2026 Producciones Culturales tuvo dos facturas repetidas anuladas con NC).
7. Casos especiales: cliente extranjero (RUT `55.555.555-5`, exenta) y notas de crédito (la librería aún no arma borradores tipo 61).
