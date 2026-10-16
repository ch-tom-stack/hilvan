import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { prepararImportacion } from '@/lib/sii-cli'

export const runtime = 'nodejs'

// POST /api/agent/sii-importar (JSON)
//   { periodo: "2026-06", compras?: {resumen, detalle}, ventas?: {resumen, detalle},
//     bhe?: <bte list --recibidas>, herramienta?: "sii-cli 0.10.0" }
//
// Recibe lo que lee la CLI `sii` en el Mac (lo manda el trabajador del Mac o `npm run sii:importar`) y lo
// guarda en sii_documentos (upsert idempotente, respaldo fiel para el contador).
// Por cada lado registra en sii_importaciones si llegó COMPLETO o INCOMPLETO
// (con el motivo): hilvan_sii_sync / hilvan_sii_sync_ventas leen de ahí y
// responden error si el lado no está completo. No toca gastos ni cotizaciones.
//
// La clave tributaria NUNCA pasa por acá. SII_RUT (opcional) protege contra
// importar los datos de otro contribuyente.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Validar TODO antes de la primera escritura.
  const prep = prepararImportacion(body, process.env.SII_RUT || null)
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: 400 })

  const admin = createAdminClient()
  const ahora = new Date().toISOString()
  const resultado: Record<string, { estado: string; documentos: number; guardados: number; errores: string[] }> = {}

  for (const lado of prep.lados) {
    const filas = lado.filas.map((f) => ({ ...f, sincronizado_at: ahora }))
    if (filas.length) {
      const { error } = await admin
        .from('sii_documentos')
        .upsert(filas, { onConflict: 'fuente,rut_emisor,folio,dte' })
      if (error) {
        // Sin documentos guardados el lado NO se marca: el sync seguirá diciendo
        // que falta importar (o conserva la importación anterior).
        return NextResponse.json(
          { error: `No se pudieron guardar los documentos de ${lado.lado}: ${error.message}`, resultado },
          { status: 500 },
        )
      }
    }
    const { error } = await admin.from('sii_importaciones').upsert(
      {
        periodo: prep.periodo,
        lado: lado.lado,
        estado: lado.estado,
        documentos: lado.documentos,
        errores: lado.errores,
        herramienta: prep.herramienta,
        importado_at: ahora,
      },
      { onConflict: 'periodo,lado' },
    )
    if (error) {
      return NextResponse.json(
        { error: `Documentos de ${lado.lado} guardados, pero no se pudo registrar la importación: ${error.message}`, resultado },
        { status: 500 },
      )
    }
    resultado[lado.lado] = { estado: lado.estado, documentos: lado.documentos, guardados: filas.length, errores: lado.errores }
  }

  return NextResponse.json({ periodo: prep.periodo, resultado })
}
