'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { aplicarRespuesta, leerPregunta, type PreguntaAbierta } from '@/lib/crm-preguntas-io'
import { esRespuesta } from '@/lib/crm-preguntas'

// "¿En qué quedó?" — página pública /q/<token>. No hay sesión: el token del
// correo ES la autorización, igual que en el portal de rendiciones. Se valida
// en cada llamada (existe, no venció, no está usado) dentro de lib/crm-preguntas-io.

export async function getPregunta(token: string): Promise<PreguntaAbierta | null> {
  return leerPregunta(createAdminClient(), token)
}

export async function responderPregunta(input: {
  token: string
  respuesta: string
  detalle?: string
  hasta?: string
  canal?: string
}): Promise<{ ok: true; empresa: string } | { ok: false; error: string }> {
  if (!esRespuesta(input.respuesta)) return { ok: false, error: 'Respuesta inválida' }
  const canal = input.canal === 'llamada' || input.canal === 'reunion' || input.canal === 'mensaje' ? input.canal : null

  const res = await aplicarRespuesta(createAdminClient(), input.token, {
    respuesta: input.respuesta, detalle: input.detalle, hasta: input.hasta, canal,
  })
  if (res.ok) revalidatePath('/crm')
  return res
}
