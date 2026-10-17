# Transferencias masivas Santander

Office Banking acepta una planilla `.xlsx` de 13 columnas para pagar a varias personas de una vez (Transferencias → Masivas). Hilván arma esa planilla, sabe a qué cuenta pagarle a cada RUT y marca cada pago como hecho cuando el banco lo confirma.

Pantalla: **Financiero → Cuentas por pagar → Transferencias masivas** (`/financiero/masivas`, admin y contabilidad).

## Las tres piezas

| Pieza | Tabla | De dónde sale |
|---|---|---|
| Directorio de cuentas | `cuentas_bancarias` | Cada aviso de Santander trae banco, cuenta, RUT y nombre del destinatario. La tarea diaria `santander-correos-a-hilvan` manda el cuerpo del correo en `aviso_texto` (o en `avisos` si el movimiento ya estaba) y `/api/agent/importar-movimientos` lo lee con `leerAvisoSantander`. Si el banco ya transfirió a esa cuenta, queda `confirmada`. También entra a mano (pantalla o `hilvan_cuenta_bancaria_agregar`). |
| Lote | `pagos_lotes` + `pagos_lote_items` | Se arma con la nómina del mes, las boletas por pagar (por su NETO, glosa `BH <folio>`) y pagos sueltos. Cada pago guarda una copia de la cuenta usada. |
| Cierre | — | `cerrarPagos()` corre después de cada importación y al abrir los lotes: el pago pendiente cuyo cargo llegó (mismo RUT en la glosa, mismo monto, entre 3 días antes y 30 después de la fecha del lote) queda `pagado`, y su gasto queda `pagado=true` sin conciliar. Si se deshace la importación, vuelve a pendiente. |

La cuenta de cada RUT: la del directorio confirmada por el banco más reciente; si no hay, la de la ficha del colaborador (con aviso "sin confirmar").

## Antes de generar la planilla

- Errores (bloquean): RUT inválido, sin banco o cuenta, monto no entero, el gasto ya está en otro lote, el destinatario es la propia empresa.
- Avisos (no bloquean): a ese RUT ya se le transfirió el mismo monto en los últimos 120 días (posible pago doble), cuenta tomada de la ficha, Banco Security en fusión con BICE.
- La planilla lleva solo los pagos **pendientes**: lo pagado o anulado no se vuelve a mandar.

## Formato de la planilla

Igual que la que arma Tomás (ej. `Transferencia Masiva 14-10 n 1.xlsx`): hoja `Hoja1`; cuenta origen `84616290`; cuenta destino como texto (Santander a 12 dígitos con ceros, `000065550237`; otros bancos tal cual); código de banco de 3 dígitos como texto (`051`) solo si no es Santander; RUT pegado sin puntos ni guion (`25476440K`); la glosa se repite en el mensaje del correo y en las cartolas (la del beneficiario solo si es Santander). Lógica en `lib/pagos-masivos.ts` (tests en `tests/pagos-masivos.test.ts`), archivo en `lib/planilla-santander.ts`. El export de Centro de costos (`/costos/admin/export`) usa el mismo generador.

Códigos de banco: `lib/bancos.ts`, del listado de la CMF (cmfchile.cl, artículo 47003) más Coopeuch (672). Un banco que no esté se agrega con su código CMF, nunca adivinado. `colaboradores.banco` tiene check constraint con la lista de la ficha: lo que no está ahí va como `Otro` (el código exacto queda en el directorio).

## Operador (MCP)

- `hilvan_cuentas_bancarias` (`sin_colaborador=true` = a quién ya se le pagó y no está en Colaboradores) → `hilvan_colaborador_guardar` con `cuenta_id` para darlo de alta con su cuenta.
- `hilvan_pagos_candidatos` → `hilvan_pago_lote_crear` (primero con `solo_revisar=true`) → la persona descarga la planilla desde la url y la sube a Office Banking.
- `hilvan_pago_lotes`: estado de cada pago; corre el cierre. `hilvan_pago_lote_editar`: anular, reactivar, corregir monto/glosa/cuenta.
- Todo reversible con `hilvan_deshacer`; en pantalla, Ctrl+Z.

## Nómina

`configuracion_financiero.nomina_personas`, cada persona con `rut` para enlazar su cuenta. Al 17-oct-2026: Tomás Montealegre $1.467.000 (contrato), Natalia Roa $530.000 (contrato), Simón Fernández $250.000 (BH). Josué de la Fuente y Diego López cobran por proyecto, no son nómina. El monto es lo que se transfiere (el líquido de la liquidación): el sueldo de Tomás tiene que verse en su cuenta todos los meses como respaldo de ingresos.
