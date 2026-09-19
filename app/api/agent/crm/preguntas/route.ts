import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ETIQUETA_RESPUESTA, type RespuestaPregunta } from '@/lib/crm-preguntas'

export const runtime = 'nodejs'

// GET /api/agent/crm/preguntas?prospecto_id=
//
// "¿En qué quedó?": lo que el digest le preguntó al equipo sobre prospectos con
// reunión reciente o conversación callada. SOLO LECTURA — contestar es cosa de
// personas, desde el link de su correo.
//
// Al operador le sirve para dos cosas: una pregunta ABIERTA significa "el CRM
// probablemente está ciego acá, no asumas abandono"; una CONTESTADA trae lo que
// pasó fuera del correo.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const prospectoId = new URL(req.url).searchParams.get('prospecto_id')?.trim() || null
  const admin = createAdminClient()
  const desde = new Date(Date.now() - 21 * 86_400_000).toISOString()

  let q = admin
    .from('crm_preguntas')
    .select('prospecto_id, motivo, created_at, expires_at, respuesta, detalle, respondida_at, prospectos(empresa, etapa), profiles(nombre)')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(200)
  if (prospectoId) q = q.eq('prospecto_id', prospectoId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ahora = new Date()
  const filas = (data ?? []).map((f: any) => ({
    prospecto_id: f.prospecto_id,
    empresa: f.prospectos?.empresa ?? null,
    etapa: f.prospectos?.etapa ?? null,
    preguntado_a: f.profiles?.nombre ?? null,
    motivo: f.motivo,
    preguntado_el: f.created_at,
    respuesta: f.respuesta ? ETIQUETA_RESPUESTA[f.respuesta as RespuestaPregunta] : null,
    detalle: f.detalle,
    respondida_el: f.respondida_at,
    vencida: !f.respuesta && new Date(f.expires_at) < ahora,
  }))

  return NextResponse.json({
    abiertas: filas.filter(f => !f.respuesta && !f.vencida),
    contestadas: filas.filter(f => f.respuesta),
    sin_contestar_vencidas: filas.filter(f => f.vencida).length,
  })
}
