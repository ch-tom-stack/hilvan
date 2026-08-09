import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'
import {
  normalizarLinks,
  parDeCredenciales,
  FORMATOS_TRABAJO,
  ESCALAS_TRABAJO,
  type Trabajo,
} from '@/lib/repertorio'

export const runtime = 'nodejs'

const FORMATOS = new Set<string>(FORMATOS_TRABAJO)
const ESCALAS = new Set<string>(ESCALAS_TRABAJO)

// GET  /api/agent/crm/repertorio?rubro=&escala=&formato=&q=&credenciales_para=
// POST /api/agent/crm/repertorio { marca, rubro?, escala?, anio?, formato?, ... }
//
// El cuerpo de obra de Casa Hiedra. Existe para una consulta concreta: la regla
// de credenciales pide una marca grande y una chica del rubro del prospecto, y
// hasta ahora esas referencias eran seis nombres quemados a mano.

export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const rubro = strA(searchParams.get('rubro'))
  const escala = strA(searchParams.get('escala'))
  const formato = strA(searchParams.get('formato'))
  const q = strA(searchParams.get('q'))
  const credencialesPara = strA(searchParams.get('credenciales_para'))
  const incluirNoMostrables = searchParams.get('incluir_no_mostrables') === 'true'

  let query = createAdminClient().from('repertorio').select('*')
  if (rubro) query = query.ilike('rubro', rubro)
  if (escala) query = query.eq('escala', escala)
  if (formato) query = query.eq('formato', formato)
  if (q) query = query.ilike('marca', `%${q}%`)
  if (!incluirNoMostrables) query = query.eq('mostrable', true)

  const { data, error } = await query.order('anio', { ascending: false, nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const trabajos = (data ?? []) as Trabajo[]

  // Atajo para el momento de escribir el correo: no obliga al operador a
  // filtrar a mano ni a acordarse de la regla de las dos escalas.
  const credenciales = credencialesPara
    ? parDeCredenciales(trabajos, credencialesPara)
    : undefined

  return NextResponse.json({
    total: trabajos.length,
    trabajos,
    ...(credenciales ? { credenciales } : {}),
  })
}

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const marca = strA(body?.marca)
  if (!marca) return NextResponse.json({ error: 'Falta "marca"' }, { status: 400 })

  const escala = strA(body?.escala)?.toLowerCase() ?? null
  if (escala && !ESCALAS.has(escala)) {
    return NextResponse.json({ error: 'escala debe ser grande | chica' }, { status: 400 })
  }

  const formato = strA(body?.formato)?.toLowerCase() ?? null
  if (formato && !FORMATOS.has(formato)) {
    return NextResponse.json({ error: 'formato debe ser banco | lookbook | spot | otro' }, { status: 400 })
  }

  // Se valida antes de escribir: el año fuera de rango casi siempre es un typo
  // (2206) y guardarlo ensucia el orden por reciente.
  let anio: number | null = null
  if (body?.anio !== undefined && body?.anio !== null && body?.anio !== '') {
    const n = Number(body.anio)
    if (!Number.isFinite(n) || n < 1990 || n > 2100) {
      return NextResponse.json({ error: 'anio fuera de rango (1990–2100)' }, { status: 400 })
    }
    anio = Math.trunc(n)
  }

  const { links, descartados } = normalizarLinks(body?.links)

  const fila = {
    marca: marca.slice(0, 200),
    rubro: strA(body?.rubro)?.toLowerCase().slice(0, 80) ?? null,
    escala,
    anio,
    formato,
    descripcion: strA(body?.descripcion)?.slice(0, 2000) ?? null,
    links,
    mostrable: body?.mostrable !== false,
    notas: strA(body?.notas)?.slice(0, 2000) ?? null,
    updated_at: new Date().toISOString(),
  }

  const admin = createAdminClient()

  // Update explícito si viene id. Si no, se busca el mismo trabajo antes de
  // insertar: la rutina de actualización corre más de una vez y no debe
  // duplicar el catálogo. El match ignora mayúsculas ("Falabella" /
  // "falabella"), que es justo lo que el índice único de la tabla no cubre.
  let id = strA(body?.id)
  if (!id) {
    let busca = admin.from('repertorio').select('id').ilike('marca', fila.marca)
    busca = formato ? busca.eq('formato', formato) : busca.is('formato', null)
    busca = anio !== null ? busca.eq('anio', anio) : busca.is('anio', null)
    const { data: previo } = await busca.maybeSingle<{ id: string }>()
    if (previo) id = previo.id
  }

  const { data, error } = id
    ? await admin.from('repertorio').update(fila).eq('id', id).select('id').single<{ id: string }>()
    : await admin.from('repertorio').insert(fila).select('id').single<{ id: string }>()

  if (error || !data) {
    await registrarAccion({ herramienta: 'crm-repertorio', payload: body, ok: false, error: error?.message })
    return NextResponse.json({ error: error?.message ?? 'No se pudo guardar' }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'crm-repertorio',
    payload: { marca, formato, anio, links: links.length },
    resultado_tabla: 'repertorio',
    resultado_id: data.id,
    ok: true,
  })

  return NextResponse.json({
    id: data.id,
    marca: fila.marca,
    links: links.length,
    // Se informan en vez de fallar la escritura: un link malo no debe botar el
    // trabajo entero, pero tampoco desaparecer en silencio.
    ...(descartados.length ? { descartados, nota: 'links descartados por no ser http(s)' } : {}),
  })
}
