// lib/planilla-santander.ts
// Escribe la planilla de transferencias masivas de Office Banking (.xlsx).
// Se arma desde cero (no desde un template en public/: los archivos de public
// no viajan al bundle serverless y en Vercel no se pueden leer con fs).
// Las columnas de cuentas, códigos y RUT van como TEXTO ('@'): si no, Excel
// se come los ceros de '000065550237' y de '051'.

import ExcelJS from 'exceljs'
import { ENCABEZADOS_PLANILLA, filaPlanilla, type PagoPlanilla } from './pagos-masivos'

const COLUMNAS_TEXTO = new Set([1, 3, 5, 6])
const ANCHOS = [14, 10, 16, 10, 16, 14, 34, 14, 22, 30, 22, 22, 22]

export async function escribirPlanilla(pagos: PagoPlanilla[], cuentaOrigen?: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Hoja1')
  ws.columns = ANCHOS.map(width => ({ width }))

  const cab = ws.getRow(1)
  ENCABEZADOS_PLANILLA.forEach((h, i) => {
    const c = cab.getCell(i + 1)
    c.value = h
    c.font = { bold: true }
    c.alignment = { wrapText: true, vertical: 'top' }
  })
  cab.height = 45

  pagos.forEach((p, i) => {
    const row = ws.getRow(i + 2)
    filaPlanilla(p, cuentaOrigen).forEach((v, j) => {
      const c = row.getCell(j + 1)
      c.value = v
      if (COLUMNAS_TEXTO.has(j + 1)) c.numFmt = '@'
      if (j + 1 === 8) c.numFmt = '#,##0'
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
