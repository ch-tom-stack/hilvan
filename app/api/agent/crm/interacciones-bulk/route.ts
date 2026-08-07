import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA, FORMATO_FECHA } from '@/lib/agent-crm'

export const runtime = 'nodejs'

const MAX = 200

interface Entrada {
  prospecto_id?: unknown
  fecha?: unknown
  tipo?: unknown
  resumen?: unknown
  respondido?: unknown
  proximo_paso?: unknown
  fecha_proximo?: unknown
  gmail_thread?: unknown
  enviado_por?: unknown
}

// POST /api/agent/crm/interacciones-bulk { interacciones: [...] }
//
// Registra muchos toques de una vez. Pensado para la reconciliación de correos:
// la primera corrida son ~40 toques y de a uno es lento y ensucia el log.
//
// Se valida TODO antes de la primera escritura (regla de la auditoría para
// operaciones multi-paso). Los duplicados por gmail_thread no son error: se
// omiten y se reportan, para que la rutina pueda correr dos veces sin daño.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const entradas: Entrada[] = Array.isArray(body?.interacciones) ? body.interacciones : []
  if (entradas.length === 0) return NextResponse.json({ error: 'Falta "interacciones" (array no vacío)' }, { status: 400 })
  if (entradas.length > MAX) return NextResponse.json({ error: `Máximo ${MAX} por llamada` }, { status: 400 })

  // ── 1. Validar todo antes de escribir nada ─────────────────────────────────
  const filas: Record<string, unknown>[] = []
  const errores: { i: number; error: string }[] = []

  for (let i = 0; i < entradas.length; i++) {
    const e = entradas[i]
    const prospectoId = strA(e?.prospecto_id)
    if (!prospectoId) { errores.push({ i, error: 'falta prospecto_id' }); continue }

    const resumen = strA(e?.resumen)
    const proximoPaso = strA(e?.proximo_paso)
    if (!resumen && !proximoPaso) { errores.push({ i, error: 'indica resumen o proximo_paso' }); continue }

    const fecha = strA(e?.fecha)
    const fechaProximo = strA(e?.fecha_proximo)
    if (fecha && !FORMATO_FECHA.test(fecha)) { errores.push({ i, error: 'fecha inválida (YYYY-MM-DD)' }); continue }
    if (fechaProximo && !FORMATO_FECHA.test(fechaProximo)) { errores.push({ i, error: 'fecha_proximo inválida (YYYY-MM-DD)' }); continue }

    const fila: Record<string, unknown> = {
      prospecto_id: prospectoId,
      fecha,
      tipo: strA(e?.tipo),
      resumen,
      respondido: e?.respondido === true,
      proximo_paso: proximoPaso,
      fecha_proximo: fechaProximo,
      gmail_thread: strA(e?.gmail_thread),
    }
    // Solo se manda si viene: así el insert no exige la columna antes de que
    // corra su migración (tolerancia al orden de despliegue).
    const enviadoPor = strA(e?.enviado_por)
    if (enviadoPor) fila.enviado_por = enviadoPor
    filas.push(fila)
  }

  if (errores.length > 0) {
    return NextResponse.json(
      { error: 'Hay entradas inválidas — no se escribió nada', errores },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // ── 2. Que todos los prospectos existan ────────────────────────────────────
  const ids = [...new Set(filas.map(f => f.prospecto_id as string))]
  const { data: existentes } = await admin.from('prospectos').select('id').in('id', ids)
  const vivos = new Set((existentes ?? []).map(p => p.id))
  const faltantes = ids.filter(id => !vivos.has(id))
  if (faltantes.length > 0) {
    return NextResponse.json(
      { error: 'Hay prospecto_id inexistentes — no se escribió nada', faltantes },
      { status: 404 },
    )
  }

  // ── 3. Descartar hilos ya registrados ──────────────────────────────────────
  // El índice único los rechazaría igual, pero filtrar acá permite informar
  // cuáles se omitieron en vez de fallar la tanda entera.
  const conHilo = filas.filter(f => f.gmail_thread)
  let omitidos: string[] = []
  if (conHilo.length > 0) {
    const { data: yaHay } = await admin
      .from('crm_interacciones')
      .select('prospecto_id, gmail_thread')
      .in('prospecto_id', ids)
      .not('gmail_thread', 'is', null)
    const clave = (p: unknown, h: unknown) => `${p}::${h}`
    const registrados = new Set((yaHay ?? []).map(r => clave(r.prospecto_id, r.gmail_thread)))
    omitidos = conHilo
      .filter(f => registrados.has(clave(f.prospecto_id, f.gmail_thread)))
      .map(f => f.gmail_thread as string)
    if (omitidos.length > 0) {
      const omitidosSet = new Set(omitidos)
      for (let i = filas.length - 1; i >= 0; i--) {
        const f = filas[i]
        if (f.gmail_thread && omitidosSet.has(f.gmail_thread as string) &&
            registrados.has(`${f.prospecto_id}::${f.gmail_thread}`)) {
          filas.splice(i, 1)
        }
      }
    }
  }

  if (filas.length === 0) {
    return NextResponse.json({ insertadas: 0, omitidas: omitidos.length, omitidos, mensaje: 'Todo ya estaba registrado' })
  }

  // ── 4. Escribir ────────────────────────────────────────────────────────────
  const { data, error } = await admin.from('crm_interacciones').insert(filas).select('id, prospecto_id')

  if (error) {
    await registrarAccion({ herramienta: 'crm-interacciones-bulk', payload: { n: filas.length }, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'crm-interacciones-bulk',
    payload: { n: filas.length, omitidas: omitidos.length },
    resultado_tabla: 'crm_interacciones',
    ok: true,
  })

  return NextResponse.json({
    insertadas: data?.length ?? 0,
    omitidas: omitidos.length,
    omitidos,
    ids: (data ?? []).map(d => d.id),
  })
}
