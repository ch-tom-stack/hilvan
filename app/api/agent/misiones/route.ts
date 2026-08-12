import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { lunesDeLaSemana, hoyChile } from '@/lib/misiones'

export const runtime = 'nodejs'

interface MisionEntrada {
  persona?: string
  tipo?: string
  texto?: string
  guia?: string
  fuente_verificacion?: string
  verificado_en?: string
  fecha_objetivo?: string
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/agent/misiones?desde=YYYY-MM-DD
 *
 * Las misiones cargadas, para que el operador sepa qué ya eligió Tomás y no
 * vuelva a proponer lo mismo. Sin `desde`, la semana en curso.
 */
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const desde = new URL(req.url).searchParams.get('desde')?.trim()
  if (desde && !FECHA.test(desde)) {
    return NextResponse.json({ error: 'desde debe ser YYYY-MM-DD' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('misiones')
    .select('id, tipo, texto, guia, fuente_verificacion, verificado_en, fecha_objetivo, cumplida_en, persona:profiles!misiones_persona_id_fkey(nombre, email)')
    .gte('fecha_objetivo', desde || lunesDeLaSemana(hoyChile()))
    .order('fecha_objetivo')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    misiones: (data ?? []).map((m: any) => ({
      id: m.id,
      persona: m.persona?.nombre ?? m.persona?.email ?? '—',
      tipo: m.tipo,
      fecha_objetivo: m.fecha_objetivo,
      texto: m.texto,
      guia: m.guia,
      fuente_verificacion: m.fuente_verificacion,
      verificado_en: m.verificado_en,
      // Lo declara la persona, nunca el agente. Se expone solo como lectura.
      cumplida: !!m.cumplida_en,
    })),
  })
}

/**
 * POST /api/agent/misiones
 * { misiones: [...], reemplazar?: boolean }
 *
 * Carga las misiones que Tomás YA eligió. El agente propone opciones en su
 * reporte; acá llega la elegida — por eso no hay `recomendada` ni opciones.
 *
 * Valida TODO antes de escribir: una carga a medias deja la semana de alguien
 * incompleta y sin forma de saber qué falta.
 */
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: { misiones?: MisionEntrada[]; reemplazar?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const entradas = Array.isArray(body.misiones) ? body.misiones : []
  if (entradas.length === 0) {
    return NextResponse.json({ error: 'misiones vacío' }, { status: 400 })
  }
  if (entradas.length > 50) {
    return NextResponse.json({ error: 'máximo 50 por llamada' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: perfiles } = await admin.from('profiles').select('id, nombre, email, rol')
  if (!perfiles?.length) {
    return NextResponse.json({ error: 'No se pudieron leer los perfiles' }, { status: 500 })
  }

  // La atribución de quién la creó va a un admin real, como en crear-cotizacion.
  const creadaPor = perfiles.find(p => p.rol === 'admin')?.id ?? null

  // ── Validación completa, antes de la primera escritura ────────────────────
  const filas: any[] = []
  const errores: string[] = []

  entradas.forEach((m, i) => {
    const donde = `misiones[${i}]`

    const clave = (m.persona ?? '').trim().toLowerCase()
    const perfil = perfiles.find(
      p => p.nombre?.toLowerCase() === clave || p.email?.toLowerCase() === clave,
    )
    if (!clave) { errores.push(`${donde}: falta persona`); return }
    if (!perfil) { errores.push(`${donde}: no existe la persona "${m.persona}"`); return }

    const tipo = (m.tipo ?? '').trim()
    if (tipo !== 'diaria' && tipo !== 'semanal') {
      errores.push(`${donde}: tipo debe ser diaria o semanal`); return
    }

    const texto = (m.texto ?? '').trim()
    if (!texto) { errores.push(`${donde}: falta texto`); return }
    // El conteo no va en el enunciado: envejece y la misión pasa a mentir.
    if (/\b\d+\b/.test(texto) && /\btus?\b/i.test(texto)) {
      errores.push(
        `${donde}: el texto parece llevar un conteo ("${texto.slice(0, 48)}…"). ` +
        'El número va en fuente_verificacion con su fecha, no en la misión.',
      )
      return
    }

    let fecha = (m.fecha_objetivo ?? '').trim()
    if (!FECHA.test(fecha)) { errores.push(`${donde}: fecha_objetivo debe ser YYYY-MM-DD`); return }
    // La semanal se guarda siempre en el lunes de su semana, venga como venga.
    if (tipo === 'semanal') fecha = lunesDeLaSemana(fecha)

    const verificado = (m.verificado_en ?? '').trim()
    if (verificado && !FECHA.test(verificado)) {
      errores.push(`${donde}: verificado_en debe ser YYYY-MM-DD`); return
    }

    filas.push({
      persona_id: perfil.id,
      tipo,
      texto,
      guia: (m.guia ?? '').trim() || null,
      fuente_verificacion: (m.fuente_verificacion ?? '').trim() || null,
      verificado_en: verificado || null,
      fecha_objetivo: fecha,
      creada_por: creadaPor,
    })
  })

  if (errores.length > 0) {
    return NextResponse.json({ error: 'No se escribió nada', errores }, { status: 400 })
  }

  // ── Choques con lo ya cargado ─────────────────────────────────────────────
  const { data: existentes } = await admin
    .from('misiones')
    .select('id, persona_id, tipo, fecha_objetivo, texto, guia, fuente_verificacion, verificado_en')
    .in('persona_id', [...new Set(filas.map(f => f.persona_id))])

  const llave = (f: any) => `${f.persona_id}|${f.tipo}|${f.fecha_objetivo}`
  const previos = new Map((existentes ?? []).map(e => [llave(e), e]))
  const choques = filas.filter(f => previos.has(llave(f)))

  if (choques.length > 0 && !body.reemplazar) {
    return NextResponse.json({
      error: 'Ya hay misión cargada en esos espacios. Manda reemplazar:true para pisarlas.',
      choques: choques.map(c => ({
        persona: perfiles.find(p => p.id === c.persona_id)?.nombre,
        tipo: c.tipo,
        fecha_objetivo: c.fecha_objetivo,
      })),
    }, { status: 409 })
  }

  // ── Escritura ─────────────────────────────────────────────────────────────
  const creados: { tabla: string; id: string }[] = []
  const restaurar: any[] = []

  for (const f of filas) {
    const previo = previos.get(llave(f))
    if (previo) {
      restaurar.push(previo)
      const { error } = await admin.from('misiones').update(f).eq('id', previo.id)
      if (error) {
        const id = await registrarAccion({
          herramienta: 'misiones-crear', payload: { creados, restaurar },
          ok: true, error: error.message,
        })
        return NextResponse.json(
          { error: `Falló actualizando ${f.fecha_objetivo}: ${error.message}`, accion_id: id },
          { status: 500 },
        )
      }
    } else {
      const { data, error } = await admin.from('misiones').insert(f).select('id').single()
      if (error) {
        const id = await registrarAccion({
          herramienta: 'misiones-crear', payload: { creados, restaurar },
          ok: true, error: error.message,
        })
        return NextResponse.json(
          { error: `Falló creando ${f.fecha_objetivo}: ${error.message}`, accion_id: id },
          { status: 500 },
        )
      }
      creados.push({ tabla: 'misiones', id: data.id })
    }
  }

  const accion_id = await registrarAccion({
    herramienta: 'misiones-crear',
    payload: { creados, restaurar },
    resultado_tabla: null,
    resultado_id: null,
    ok: true,
  })

  return NextResponse.json({
    ok: true,
    creadas: creados.length,
    reemplazadas: restaurar.length,
    accion_id,
  })
}
