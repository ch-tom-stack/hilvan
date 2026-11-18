import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { contentDisposition } from '@/lib/archivos'
import { COLUMNAS_NOMINA, filasNomina, type PersonaNomina } from '@/lib/nomina'

export const maxDuration = 30

// GET /api/rodaje/[id]/nomina — nómina del equipo técnico en Excel, para
// compartir con producción (transporte, estacionamiento, catering). Solo con sesión.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: rodaje, error } = await supabase
    .from('rodajes')
    .select(`nombre, fecha, equipo_tecnico:rodaje_equipo_tecnico(
      *, departamento:rodaje_departamentos(nombre),
      colaborador:colaboradores(rut, telefono, email, restricciones_alimentarias))`)
    .eq('id', id)
    .single()
  if (error || !rodaje) return NextResponse.json({ error: 'Rodaje no encontrado' }, { status: 404 })

  const filas = filasNomina((rodaje.equipo_tecnico ?? []) as unknown as PersonaNomina[])

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Nómina', { views: [{ state: 'frozen', ySplit: 3 }] })
  const ultima = COLUMNAS_NOMINA.length

  ws.mergeCells(1, 1, 1, ultima)
  ws.getCell(1, 1).value = `Nómina del equipo — ${rodaje.nombre}`
  ws.getCell(1, 1).font = { bold: true, size: 14 }
  ws.mergeCells(2, 1, 2, ultima)
  ws.getCell(2, 1).value = rodaje.fecha ?? 'Fecha por definir'
  ws.getCell(2, 1).font = { color: { argb: 'FF666666' } }

  const cab = ws.getRow(3)
  COLUMNAS_NOMINA.forEach((c, i) => {
    const cell = cab.getCell(i + 1)
    cell.value = c.titulo
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    ws.getColumn(i + 1).width = c.ancho
  })
  cab.height = 22

  filas.forEach((f, r) => {
    const row = ws.getRow(4 + r)
    COLUMNAS_NOMINA.forEach((c, i) => {
      const v = f[c.clave]
      const cell = row.getCell(i + 1)
      cell.value = typeof v === 'boolean' ? (v ? 'Sí' : 'No') : v
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: typeof v === 'boolean' ? 'center' : 'left' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } } }
    })
  })
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition('attachment', `Nómina equipo - ${rodaje.nombre}.xlsx`, 'nomina-equipo.xlsx'),
    },
  })
}
