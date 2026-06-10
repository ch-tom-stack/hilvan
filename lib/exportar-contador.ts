import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { getResumenContador } from '@/app/actions/financiero'
import type { GastoContador, InversionContador } from '@/app/actions/financiero'
import { CATEGORIAS_INVERSION } from '@/types'
import { parseFechaLocal } from '@/lib/fechas'

// ─── Labels ───────────────────────────────────────────────────────────────────

const DOC_LABELS: Record<string, string> = {
  factura:        'Factura',
  boleta:         'Boleta honorarios',
  boleta_consumo: 'Boleta (con IVA)',
  exenta:         'Boleta exenta',
  sin_documento:  'Sin documento',
}

const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFechaExcel(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function nombreArchivo(fecha: string, descripcion: string, url: string): string {
  const d = parseFechaLocal(fecha)
  const ddmm = `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}`
  const slug = descripcion
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 20)
    .replace(/-$/, '')
  const ext = url.split('.').pop()?.split('?')[0] ?? 'jpg'
  return `${ddmm}_${slug}.${ext}`
}

// ─── Excel builder ────────────────────────────────────────────────────────────

type Fila = (string | number | null)[]

async function construirExcel(
  mes: number,
  año: number,
  gastosProyectos: GastoContador[],
  gastosOperacionales: GastoContador[],
  inversiones: InversionContador[],
): Promise<Uint8Array> {
  const mesLabel = `${MESES_ES[mes - 1]} ${año}`
  const ahora = new Date().toLocaleString('es-CL')

  const filas: Fila[] = []

  // Encabezado
  filas.push(['Casa Hiedra — Resumen para contador'])
  filas.push([`Período: ${mesLabel}`])
  filas.push([`Generado: ${ahora}`])
  filas.push([]) // fila vacía

  // Encabezados de columnas
  filas.push([
    'Fecha','Tipo','Descripción','Proyecto',
    'Documento','RUT Emisor','Razón Social',
    'Bruto','Neto','IVA','Crédito Fiscal','Retención BH','Tratamiento',
  ])

  function filaGasto(g: GastoContador, tipo?: string): Fila {
    return [
      formatFechaExcel(g.fecha),
      tipo ?? g.tipo,
      g.descripcion,
      g.proyecto ?? '',
      g.tipo_documento ? (DOC_LABELS[g.tipo_documento] ?? g.tipo_documento) : '',
      g.rut_emisor ?? '',
      g.razon_social_emisor ?? '',
      g.monto,
      g.monto_neto,
      g.iva,
      g.credito_fiscal,
      g.retencion,
      '',
    ]
  }

  function filaInversion(inv: InversionContador): Fila {
    return [
      formatFechaExcel(inv.fecha),
      CATEGORIAS_INVERSION[inv.categoria as keyof typeof CATEGORIAS_INVERSION] ?? inv.categoria,
      inv.descripcion,
      '',
      inv.tipo_documento ? (DOC_LABELS[inv.tipo_documento] ?? inv.tipo_documento) : '',
      inv.rut_emisor ?? '',
      inv.razon_social_emisor ?? '',
      inv.monto,
      inv.monto_neto,
      inv.iva,
      inv.credito_fiscal,
      0,
      inv.tratamiento_contable === 'activo_fijo' ? 'Activo fijo' : 'Gasto directo',
    ]
  }

  function subtotal(label: string, filasList: Fila[]): Fila {
    const rows = filasList.filter(f => f.length >= 13)
    const sum = (col: number) => rows.reduce((acc, f) => acc + (Number(f[col]) || 0), 0)
    return [
      '', label, '', '', '', '', '',
      sum(7), sum(8), sum(9), sum(10), sum(11), '',
    ]
  }

  // Gastos proyectos
  if (gastosProyectos.length > 0) {
    gastosProyectos.forEach(g => filas.push(filaGasto(g)))
    filas.push([])
    filas.push(subtotal('SUBTOTAL GASTOS PROYECTOS', gastosProyectos.map(g => filaGasto(g))))
    filas.push([])
  }

  // Gastos operacionales
  if (gastosOperacionales.length > 0) {
    gastosOperacionales.forEach(g => filas.push(filaGasto(g)))
    filas.push([])
    filas.push(subtotal('SUBTOTAL GASTOS OPERACIONALES', gastosOperacionales.map(g => filaGasto(g))))
    filas.push([])
  }

  // Inversiones
  if (inversiones.length > 0) {
    inversiones.forEach(inv => filas.push(filaInversion(inv)))
    filas.push([])
    filas.push(subtotal('SUBTOTAL INVERSIONES', inversiones.map(inv => filaInversion(inv))))
    filas.push([])
  }

  // Total general
  const todasFilas = [
    ...gastosProyectos.map(g => filaGasto(g)),
    ...gastosOperacionales.map(g => filaGasto(g)),
    ...inversiones.map(inv => filaInversion(inv)),
  ]
  filas.push(subtotal('TOTAL PERÍODO', todasFilas))

  // Construir workbook con ExcelJS
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`Resumen ${mesLabel}`)

  // Agregar filas al worksheet
  filas.forEach(fila => {
    ws.addRow(fila)
  })

  // Definir anchos de columna
  ws.columns = [
    { width: 12 }, // Fecha
    { width: 22 }, // Tipo
    { width: 38 }, // Descripción
    { width: 22 }, // Proyecto
    { width: 18 }, // Documento
    { width: 14 }, // RUT
    { width: 28 }, // Razón Social
    { width: 14 }, // Bruto
    { width: 14 }, // Neto
    { width: 12 }, // IVA
    { width: 14 }, // Crédito Fiscal
    { width: 14 }, // Retención
    { width: 16 }, // Tratamiento
  ]

  // Serializar a Uint8Array (compatible con jszip)
  const buffer = await wb.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}

// ─── Fetch comprobantes ────────────────────────────────────────────────────────

type ComprobanteFetch = {
  url: string
  carpeta: string
  nombre: string
}

async function fetchComprobante(item: ComprobanteFetch, zip: JSZip): Promise<void> {
  try {
    const response = await fetch(item.url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    zip.folder(item.carpeta)?.file(item.nombre, blob)
  } catch (e) {
    console.warn(`No se pudo descargar comprobante: ${item.url}`, e)
  }
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function generarZIPContador(mes: number, año: number): Promise<void> {
  // 1. Obtener datos
  const { gastosProyectos, gastosOperacionales, inversiones } = await getResumenContador(mes, año)

  // 2. Construir Excel
  const excelBuffer = await construirExcel(mes, año, gastosProyectos, gastosOperacionales, inversiones)

  // 3. Crear ZIP
  const zip = new JSZip()
  zip.file('indice.xlsx', excelBuffer)

  // 4. Recopilar comprobantes
  const comprobantes: ComprobanteFetch[] = []

  for (const g of gastosProyectos) {
    if (g.comprobante_url) {
      comprobantes.push({
        url: g.comprobante_url,
        carpeta: 'comprobantes/gastos_proyecto',
        nombre: nombreArchivo(g.fecha, g.descripcion, g.comprobante_url),
      })
    }
  }

  for (const g of gastosOperacionales) {
    if (g.comprobante_url) {
      comprobantes.push({
        url: g.comprobante_url,
        carpeta: 'comprobantes/gastos_operacional',
        nombre: nombreArchivo(g.fecha, g.descripcion, g.comprobante_url),
      })
    }
  }

  for (const inv of inversiones) {
    if (inv.comprobante_url) {
      comprobantes.push({
        url: inv.comprobante_url,
        carpeta: 'comprobantes/inversiones',
        nombre: nombreArchivo(inv.fecha, inv.descripcion, inv.comprobante_url),
      })
    }
  }

  // 5. Fetch en paralelo (sin detener si alguno falla)
  await Promise.allSettled(comprobantes.map(c => fetchComprobante(c, zip)))

  // 6. Generar y descargar
  const content = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url
  a.download = `contador_${año}-${String(mes).padStart(2, '0')}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
