import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { codigoBanco, nombreBanco } from '@/lib/bancos'
import { limpiarCuenta, limpiarRut, rutConPuntos, rutValido } from '@/lib/pagos-masivos'
import { guardarCuentas } from '@/lib/pagos-masivos-io'

export const runtime = 'nodejs'

// GET /api/agent/cuentas-bancarias?q=&sin_colaborador=true
// El directorio de cuentas de destino (se llena solo con los avisos de
// Santander). sin_colaborador=true deja solo las personas/empresas a las que ya
// se les pagó pero que no están en colaboradores: la lista para darlas de alta.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const params = new URL(req.url).searchParams
  const q = params.get('q')?.trim() ?? ''
  const admin = createAdminClient()

  let query = admin.from('cuentas_bancarias')
    .select('id, rut, nombre, banco_codigo, tipo_cuenta, numero_cuenta, email, colaborador_id, fuente, confirmada, veces, ultima_vez, colaborador:colaboradores(nombre)')
    .order('ultima_vez', { ascending: false, nullsFirst: false })
    .limit(200)
  if (params.get('sin_colaborador') === 'true') query = query.is('colaborador_id', null)
  if (q) {
    const rut = limpiarRut(q)
    query = rut ? query.eq('rut', rut) : query.ilike('nombre', `%${q}%`)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json((data ?? []).map((c: any) => ({
    id: c.id,
    rut: rutConPuntos(c.rut),
    nombre: c.nombre,
    banco: nombreBanco(c.banco_codigo),
    banco_codigo: c.banco_codigo,
    tipo_cuenta: c.tipo_cuenta,
    numero_cuenta: c.numero_cuenta,
    email: c.email,
    colaborador: c.colaborador_id ? { id: c.colaborador_id, nombre: c.colaborador?.nombre ?? null } : null,
    confirmada_por_banco: c.confirmada,
    veces_pagada: c.veces,
    ultima_vez: c.ultima_vez,
    fuente: c.fuente,
  })))
}

// POST /api/agent/cuentas-bancarias { rut, nombre, banco, numero_cuenta, tipo_cuenta?, email? }
// Agrega a mano una cuenta (ej. la que un colaborador mandó por correo). Queda
// sin confirmar hasta que el banco le transfiera. Reversible con hilvan_deshacer.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const rut = limpiarRut(body?.rut)
  if (!rut || !rutValido(rut)) return NextResponse.json({ error: `RUT inválido (${body?.rut ?? ''})` }, { status: 400 })
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return NextResponse.json({ error: 'Falta nombre' }, { status: 400 })
  const banco_codigo = codigoBanco(String(body?.banco ?? ''))
  if (!banco_codigo) return NextResponse.json({ error: `Banco no reconocido (${body?.banco ?? ''}). Usa el nombre o el código CMF de 3 dígitos.` }, { status: 400 })
  const numero_cuenta = limpiarCuenta(body?.numero_cuenta)
  if (!numero_cuenta) return NextResponse.json({ error: 'Falta numero_cuenta (solo dígitos)' }, { status: 400 })
  const tipo = ['corriente', 'vista', 'ahorro'].includes(body?.tipo_cuenta) ? body.tipo_cuenta : null
  const email = typeof body?.email === 'string' && body.email.includes('@') ? body.email.trim() : null

  const admin = createAdminClient()
  const { data: ya } = await admin.from('cuentas_bancarias').select('id').eq('rut', rut).eq('banco_codigo', banco_codigo).eq('numero_cuenta', numero_cuenta).maybeSingle()
  if (ya) return NextResponse.json({ ok: true, ya_existia: true, id: ya.id })

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  const r = await guardarCuentas(admin, [{ rut, nombre, banco_codigo, numero_cuenta, tipo_cuenta: tipo, email }], { fecha: hoy, fuente: 'manual', confirmada: false })
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })
  const { data: fila } = await admin.from('cuentas_bancarias').select('id').eq('rut', rut).eq('banco_codigo', banco_codigo).eq('numero_cuenta', numero_cuenta).single()

  await registrarAccion({ herramienta: 'cuenta-bancaria', payload: { rut, banco_codigo, numero_cuenta }, resultado_tabla: 'cuentas_bancarias', resultado_id: fila?.id ?? null, ok: true })
  return NextResponse.json({ ok: true, id: fila?.id, rut: rutConPuntos(rut), banco: nombreBanco(banco_codigo), numero_cuenta, confirmada_por_banco: false })
}
