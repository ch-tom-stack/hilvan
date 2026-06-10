# T13 — Hallazgos: unificar lógica cotizaciones / rental

**Resultado:** no se consolidó código adicional. La única duplicación real
(cálculos) ya fue eliminada por T12. El resto de la "duplicación" es nominal,
no estructural: archivos que comparten nombre pero modelan flujos y datos
distintos. Unificarlos costaría más de lo que ahorra y arriesgaría regresión
visual/funcional. Decisión documentada abajo.

## Punto de partida medido

Base: rama `main` (commit T11) que ya incluye `lib/cotizaciones-calc.ts` (T12).

`lib/cotizaciones-calc.ts` YA contiene, en un solo lugar, usados por ambos módulos:

- `calcularBruto`, `subtotalItem`, `subtotalSubgrupo`, `subtotalDepartamento`,
  `calcularTotales`, `formatCLP` (cotizaciones)
- `subtotalRentalItem`, `calcularTotalesRental` (rental)

`types/index.ts` los reexporta, así que los imports `from '@/types'` de los
componentes siguen funcionando sin cambios.

**Conclusión de cálculos:** la duplicación de lógica de negocio descrita en el
encargo (subtotales, totales, formato) está al 100% resuelta. No queda nada que
extraer ahí.

## Comparación archivo a archivo de lo que el encargo pedía revisar

| Par de archivos | Líneas | Duplicación real | Acción |
|---|---|---|---|
| RentalCotizacionPDF.tsx (195) vs CotizacionPDF.tsx (399) | — | ~0% reutilizable | No tocar |
| rental/NuevaCotizacionForm.tsx (236) vs cotizaciones/NuevaCotizacionForm.tsx (207) | — | solo strings de clases Tailwind | No tocar |
| rental.ts (640) vs cotizaciones.ts (824) | — | 0% (tablas y flujos distintos) | No tocar |

### PDFs — visualmente opuestos, no comparten estilos

- **CotizacionPDF**: fondo BLANCO (#FFFFFF), texto negro, barras grises de
  sección, logo 160x27, layout jerárquico departamento -> subgrupo -> ítem,
  fuente base 8pt.
- **RentalCotizacionPDF**: fondo NEGRO (#111110), texto crema, acentos verdes,
  logo 90x22, layout de tabla con columnas (Cant./Días/Precio/Subtotal),
  fuente base 9pt.

Los dos StyleSheet.create(...) no comparten un solo valor de estilo: distinto
esquema de color, distinto tamaño de logo, distinta estructura de tabla.
Extraer estilos "compartidos" obligaría a que un PDF se parezca al otro ->
regresión visual. El encargo exige PDFs idénticos pixel a pixel antes/después,
así que **no se toca**.

### Formularios — mismo nombre, modelos distintos

- **cotizaciones/NuevaCotizacionForm**: 3 modos de cliente (libre / existente /
  nuevo con creación inline), selector de proyecto, campo nombre obligatorio,
  submit vía FormData, sin IVA ni notas.
- **rental/NuevaCotizacionForm**: 2 modos (lista / libre), ligado a una reserva,
  checkbox IVA, notas internas + notas cliente, submit vía objeto a
  crearRentalCotizacion.

El único solapamiento es el patrón "toggle de cliente lista/libre" y las clases
Tailwind de los inputs — pero con nombres de modo distintos, distinto shape de
estado y contratos de submit distintos. Un componente compartido tendría que
parametrizar tanto que resultaría más grande y frágil que la duplicación que
elimina. **No se toca.**

### Server actions — sin solapamiento

rental.ts opera sobre rental_reservas, rental_cotizaciones,
rental_cotizacion_items con verificación de disponibilidad y reservas.
cotizaciones.ts opera sobre cotizacion_grupos/versiones/variantes/
departamentos/subgrupos/items con versionado, copia y jerarquía. Las firmas y
los flujos no se alinean. 0% eliminable.

## Lo que se decidió NO unificar y por qué

1. **Estilos/layout de PDF** — son deliberadamente distintos (el cliente final ve
   marcas visuales diferentes para cotización vs rental). Compartir = regresión.
2. **Formularios de creación** — distinto modelo de datos y de interacción.
   Abstraerlos genera un componente "god" parametrizado peor que el original.
3. **Tablas/esquema** — explícitamente fuera de alcance por el encargo.

## Verificaciones

- npx tsc --noEmit: pasa (sin cambios de código que romper).
- npm test: 98/98 tests pasan (5 archivos).

## Nota para futuros agentes

Si en el futuro se rediseñan ambos PDFs para que compartan identidad visual,
ENTONCES sí valdría extraer un components/shared/PdfPrimitivos (Header, Tabla,
TotalesBox). Hoy no, porque divergen a propósito.
