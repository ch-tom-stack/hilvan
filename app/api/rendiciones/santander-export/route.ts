import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import path from 'path'

export interface FilaSantander {
  cuenta_origen: string
  moneda_origen: 'CLP'
  cuenta_destino: string
  moneda_destino: 'CLP'
  codigo_banco_destino: number | ''
  rut_beneficiario: string
  nombre_beneficiario: string
  monto: number
  glosa_transferencia: string
  correo_beneficiario: string
  mensaje_correo: string
  glosa_cartola_originador: string
  glosa_cartola_beneficiario: string
}

// cols que van alineadas a la derecha (igual que el template)
const RIGHT_COLS = new Set([1, 3, 5, 6, 8])

export async function POST(req: NextRequest) {
  const { filas, nombre }: { filas: FilaSantander[]; nombre: string } = await req.json()

  // ── Cargar template ───────────────────────────────────────────────────────
  const templatePath = path.join(process.cwd(), 'public', 'templates', 'santander_masivo.xlsx')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(templatePath)

  const ws = wb.getWorksheet('Hoja1')
  if (!ws) throw new Error('Hoja1 not found in template')

  // ── Capturar estilo de la fila de ejemplo (fila 2) ───────────────────────
  const templateRow = ws.getRow(2)
  const cellStyles: ExcelJS.Style[] = []
  for (let c = 1; c <= 13; c++) {
    const cell = templateRow.getCell(c)
    // clonar estilo profundo
    cellStyles.push(JSON.parse(JSON.stringify(cell.style)) as ExcelJS.Style)
  }
  const templateRowHeight = templateRow.height ?? 15

  // ── Borrar fila de ejemplo ────────────────────────────────────────────────
  ws.spliceRows(2, 1)

  // ── Insertar filas reales ─────────────────────────────────────────────────
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i]
    const values = [
      f.cuenta_origen,
      f.moneda_origen,
      f.cuenta_destino,
      f.moneda_destino,
      f.codigo_banco_destino === '' ? null : f.codigo_banco_destino,
      f.rut_beneficiario || null,
      f.nombre_beneficiario || null,
      f.monto,
      f.glosa_transferencia || null,
      f.correo_beneficiario || null,
      f.mensaje_correo || null,
      f.glosa_cartola_originador || null,
      f.glosa_cartola_beneficiario || null,
    ]

    const row = ws.getRow(2 + i)
    row.height = templateRowHeight

    for (let c = 1; c <= 13; c++) {
      const cell = row.getCell(c)
      cell.value = values[c - 1] ?? null
      // aplicar estilo clonado del template
      cell.style = JSON.parse(JSON.stringify(cellStyles[c - 1]))
      // respetar alineación horizontal del template (right para numéricos)
      if (RIGHT_COLS.has(c)) {
        cell.alignment = { ...cell.alignment, horizontal: 'right' }
      }
    }

    row.commit()
  }

  // ── Serializar y devolver ─────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const fecha = new Date().toISOString().slice(0, 10)
  const filename = `santander_${nombre.replace(/\s+/g, '_')}_${fecha}.xlsx`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
