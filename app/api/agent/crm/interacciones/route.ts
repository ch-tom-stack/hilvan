import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/crm/interacciones?prospecto_id=UUID
// Bitácora de un prospecto. SOLO LECTURA.
//
// Existe porque el operador podía escribir toques pero no leer los que ya
// había escrito: sin esto, una rutina que corre semanal no puede saber qué
// ya registró y depende de que la base rechace el duplicado.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const prospectoId = (searchParams.get('prospecto_id') ?? '').trim()
  if (!prospectoId) return NextResponse.json({ error: 'Falta "prospecto_id"' }, { status: 400 })

  const admin = createAdminClient()

  const { data: prospecto } = await admin
    .from('prospectos')
    .select('id, empresa, etapa, email')
    .eq('id', prospectoId)
    .maybeSingle()
  if (!prospecto) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  // `*` a propósito, no una lista de columnas: nombrar `enviado_por` rompería
  // la lectura entera si el código se despliega antes que su migración.
  const { data, error } = await admin
    .from('crm_interacciones')
    .select('*')
    .eq('prospecto_id', prospectoId)
    .order('fecha', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const interacciones = data ?? []
  // `hilos` es lo que la reconciliación necesita para no duplicar: la lista de
  // gmail_thread ya registrados, lista para descartar antes de escribir.
  const hilos = interacciones.map(i => i.gmail_thread).filter(Boolean)

  return NextResponse.json({
    prospecto: {
      id: prospecto.id,
      empresa: prospecto.empresa,
      etapa: prospecto.etapa,
      email: prospecto.email,
    },
    total: interacciones.length,
    con_respuesta: interacciones.filter(i => i.respondido).length,
    ultima_fecha: interacciones[0]?.fecha ?? null,
    hilos_registrados: hilos,
    interacciones,
  })
}
