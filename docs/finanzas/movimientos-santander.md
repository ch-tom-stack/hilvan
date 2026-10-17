# Movimientos bancarios (Santander y BancoEstado) → Hilván

Santander no tiene API para pymes (la banca abierta regulada parte en jul-2027) y se descartó pagar un agregador (Fintoc). Los movimientos de la cuenta corriente **84616290** de Casa Hiedra (Tomás Montealegre Producciones E.I.R.L, RUT 77.151.117-1) y de su tarjeta de crédito entran a `movimientos_bancarios` por dos caminos. Ambos solo **importan**: conciliar es trabajo del agente.

| Camino | Cubre | Cuándo |
|---|---|---|
| Avisos de Santander en Gmail | transferencias salientes de Office Banking y las del dueño hacia la empresa | todos los días, solos |
| Carpeta `~/Documents/Cartolas Santander` | TODO: pagos de clientes, comisiones, PAC, compras con débito, giros; y la tarjeta | cuando Tomás suelta el archivo (recordatorio en su calendario el día 8 de cada mes: el estado de cuenta de la tarjeta sale entre el 5 y el 7) |

La cuenta personal del dueño es otra: de ella solo entra lo que transfiere **hacia** la empresa.

## La tarea diaria

Tarea programada local `santander-correos-a-hilvan` (app de Claude, 21:00, modo Auto; corre al abrir la app si estaba cerrada). En orden:

1. `npm run -s cartolas:importar` → procesa la carpeta.
2. Lee en Gmail los correos de `mensajeria@santander.cl` de los últimos 7 días e importa con `hilvan_importar_movimientos`.

## La carpeta

Se descarga de Office Banking y se suelta en `~/Documents/Cartolas Santander`:

- **Cartola mensual** de cuenta corriente: `.tx1`. Se valida RUT, cuenta y que **cuadre** (saldo inicial + abonos − cargos = saldo final); si no, no se importa nada de ese archivo.
- **Estado de cuenta** mensual de la tarjeta: PDF `EstadoCuentaTC-…pdf` (se lee con `pdftotext` de poppler). Se valida el titular y que la suma de las líneas dé el TOTAL OPERACIONES y el total de CARGOS, COMISIONES, IMPUESTOS Y ABONOS. Las compras en cuotas entran UNA vez, por el total y en la fecha de compra; los pagos ("MONTO CANCELADO") y notas de crédito, como abono.
- **Cartola en línea BancoEstado** (`Cartola_en_linea_<cuenta>.xlsx`): solo la chequera electrónica **90270670201** de la empresa (RUT 77.151.117-1), `fuente: "BancoEstado"`. Es acumulada (trae desde enero): se valida saldo inicial + abonos − cargos = saldo contable, los totales y el saldo de cada línea; referencia `BE <fecha> <N° operación> <monto>`. La chequera **90277664967** es de **Casa Hiedra EIRL (77.956.984-5)**: es la misma casa, pero el segundo RUT tributa aparte, así que entra con `fuente: "BancoEstado Casa Hiedra EIRL"` y referencia `BEE …` para no mezclarse. Cualquier otra chequera se rechaza (lista en `CHEQUERAS_BANCOESTADO`, `scripts/cartolas/lector.mjs`).
- **Movimientos no facturados** de la tarjeta: `mov_nac*.txt`. Solo trae el período en curso (sirve para ver lo del mes antes de que cierre); cuando llega el estado de cuenta, lo ya cargado se reconoce y no se duplica.

Lo importado pasa a `importadas/` con la fecha. Lo que falla se queda en la carpeta y la tarea dice por qué. Soltar dos veces el mismo archivo no duplica.

```bash
npm run cartolas:importar -- --dry      # ver qué entraría, sin enviar ni mover
npm run cartolas:importar               # importar ya, sin esperar a la tarea
```

## No duplicar

- Cartola: referencia `cartola <N°> L<línea>`. Una línea que ya entró por correo o a mano se reconoce por monto + tipo + misma fecha (si ambos traen RUT, el mismo), o hasta 3 días de diferencia con el mismo RUT. Lógica pura en `scripts/cartolas/lector.mjs`, tests en `tests/cartolas.test.ts`.
- Correo: referencia `OB <N>` o `gmail:<id>`; si la cartola ya trae ese movimiento, la tarea lo descarta.
- Tarjeta: referencia por contenido — `TCE <fecha> <glosa> <monto>` (estado de cuenta) y `TC <fecha> <comercio> <monto>` (no facturados), `#2` si se repite igual — para que bajar el archivo de nuevo no duplique. Entre ambos tipos se cruza por fecha + monto + tipo.

## Formato de la cartola `.tx1` (ancho fijo, latin-1)

- Cabecera: RUT(12) · nombre(40) · banco(3+14) · cuenta(12) · N° cartola(3) · emisión DDMMAAAA · hora · … · saldos como `<DDMMAAAA><+|-><16 dígitos, 2 decimales>` (inicial y final).
- Movimiento: `DDMM` · `A`(abono) / `C`(cargo) · código(5) · glosa(31, a veces empieza con el RUT de la contraparte) · documento(10) · monto(14, 2 decimales) · sucursal.

## Estado (17-oct-2026)

Cuenta corriente: mayo → septiembre 2026 completos (cartolas N°055–059); octubre solo tiene lo de los correos hasta que llegue la cartola N°060.
BancoEstado 90270670201: enero → 5-oct-2026 (22 movimientos: traspasos desde/hacia Santander y cuotas de créditos).
BancoEstado Casa Hiedra EIRL 90277664967: febrero → agosto 2026 (6 movimientos).
Tarjeta 0192: estados de cuenta completos del 06-04 al 05-10-2026 (99 movimientos con los no facturados de octubre). Ojo: la fila de no facturados `TEMU.COM — compra en cuota (cuof)` $28.127 del 27-09 puede repetir las compras TEMU del estado de cuenta ($11.076 + $19.194): revisar al conciliar.
