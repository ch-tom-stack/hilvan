import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { _getNomina } from '@/app/actions/financiero-config'
import { nombreBanco } from '@/lib/bancos'
import { limpiarCuenta, limpiarRut, rutConPuntos } from '@/lib/pagos-masivos'
import { cerrarPagos, crearLote, gastosPorPagar, leerLotes, prepararLote, resolverCuentas, type Lote, type PedidoLote } from '@/lib/pagos-masivos-io'

export const runtime = 'nodejs'

function urlLote(id: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com').replace(/\/$/, '')
  return `${base}/financiero/masivas?lote=${id}`
}

function resumenLote(l: Lote) {
  return {
    id: l.id, nombre: l.nombre, fecha: l.fecha, estado: l.estado, total: l.total, pagado: l.pagado,
    url: urlLote(l.id),
    pagos: l.items.map(i => ({
      item_id: i.id, rut: rutConPuntos(i.rut), nombre: i.nombre, monto: i.monto, glosa: i.glosa,
      banco: i.banco_codigo ? nombreBanco(i.banco_codigo) : null, cuenta: i.numero_cuenta,
      estado: i.estado, pagado_en: i.pagado_en, movimiento_id: i.movimiento_id,
      origen: i.origen_tabla ? { tabla: i.origen_tabla, id: i.origen_id } : null,
      ...(i.errores.length ? { errores: i.errores } : {}),
      ...(i.avisos.length ? { avisos: i.avisos } : {}),
    })),
  }
}

// GET /api/agent/pago-lote?id=&estado=           → lotes (corre el cierre antes)
// GET /api/agent/pago-lote?candidatos=true       → lo que se puede pagar: nómina + gastos sin pagar
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized
  const params = new URL(req.url).searchParams
  const admin = createAdminClient()

  if (params.get('candidatos') === 'true') {
    const [nomina, gastos] = await Promise.all([_getNomina(), gastosPorPagar(admin)])
    const cuentas = await resolverCuentas(admin, [...nomina.map(p => p.rut ?? ''), ...gastos.map(g => g.rut ?? '')])
    const conCuenta = (rut: string | null | undefined) => {
      const c = rut ? cuentas.get(limpiarRut(rut)) : undefined
      return c?.origen ? `${nombreBanco(c.banco_codigo)} ${c.numero_cuenta}${c.origen === 'ficha' ? ' (ficha, sin confirmar)' : ''}` : null
    }
    return NextResponse.json({
      nomina: nomina.map(p => ({ nombre: p.nombre, rut: p.rut ?? null, monto: p.monto, tipo: p.tipo, cuenta: conCuenta(p.rut) })),
      gastos: gastos.map(g => ({ ...g, cuenta: conCuenta(g.rut) })),
    })
  }

  const cierre = await cerrarPagos(admin)
  try {
    const lotes = await leerLotes(admin, { id: params.get('id') || undefined, estado: params.get('estado') || undefined, limite: 20 })
    return NextResponse.json({ cierre, lotes: lotes.map(resumenLote) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// POST /api/agent/pago-lote
// Arma un lote de transferencia masiva. Body: { nombre?, fecha?, nomina?: bool,
// gastos?: [{tabla, id}], pagos?: [{rut, monto, glosa?, nombre?, email?}],
// notas?, solo_revisar?: bool }. Con solo_revisar no escribe: devuelve cómo
// quedaría (cuentas, montos netos, errores y avisos). El lote nace en borrador;
// la planilla se descarga desde la url (sesión de Hilván). Reversible con
// hilvan_deshacer mientras ningún pago haya llegado al banco.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const pedido: PedidoLote = {
    nombre: typeof body?.nombre === 'string' ? body.nombre : undefined,
    fecha: typeof body?.fecha === 'string' ? body.fecha : undefined,
    nomina: body?.nomina === true,
    gastos: Array.isArray(body?.gastos) ? body.gastos.filter((g: any) => (g?.tabla === 'rendicion_gastos' || g?.tabla === 'rendicion_mensual_gastos') && typeof g?.id === 'string') : [],
    pagos: Array.isArray(body?.pagos) ? body.pagos : [],
    notas: typeof body?.notas === 'string' ? body.notas : undefined,
  }
  if (!pedido.nomina && !pedido.gastos?.length && !pedido.pagos?.length) {
    return NextResponse.json({ error: 'Nada que pagar: pasa nomina=true, gastos o pagos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const prep = await prepararLote(admin, pedido, await _getNomina())
  const vista = {
    nombre: prep.nombre, fecha: prep.fecha,
    total: prep.items.reduce((s, i) => s + i.monto, 0),
    pagos: prep.items.map(i => ({
      rut: rutConPuntos(i.rut), nombre: i.nombre, monto: i.monto, glosa: i.glosa,
      banco: i.banco_codigo ? nombreBanco(i.banco_codigo) : null, cuenta: limpiarCuenta(i.numero_cuenta),
      origen: { tabla: i.origen_tabla, id: i.origen_id },
      ...(i.errores.length ? { errores: i.errores } : {}),
      ...(i.avisos.length ? { avisos: i.avisos } : {}),
    })),
    ...(prep.rechazados.length ? { rechazados: prep.rechazados } : {}),
  }
  if (body?.solo_revisar === true) return NextResponse.json({ solo_revisar: true, ...vista })

  const r = await crearLote(admin, prep, 'Agente IA', pedido.notas)
  if ('error' in r) return NextResponse.json({ error: r.error, ...vista }, { status: 400 })

  await registrarAccion({
    herramienta: 'pago-lote', payload: { lote_id: r.lote.id, items: r.items.length },
    resultado_tabla: 'pagos_lotes', resultado_id: r.lote.id, ok: true,
  })
  const [lote] = await leerLotes(admin, { id: r.lote.id })
  return NextResponse.json({ ok: true, ...resumenLote(lote), ...(prep.rechazados.length ? { rechazados: prep.rechazados } : {}) })
}

// PATCH /api/agent/pago-lote { item_id, accion: 'anular' | 'reactivar' | 'editar', monto?, glosa?, cuenta_id? }
// Corrige un pago de un lote que no ha llegado al banco. cuenta_id (de
// hilvan_cuentas_bancarias, del mismo RUT) le pone la cuenta a un pago que no
// tenía. Reversible con hilvan_deshacer.
export async function PATCH(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const admin = createAdminClient()
  const { data: item } = await admin.from('pagos_lote_items').select('*').eq('id', body?.item_id ?? '').maybeSingle()
  if (!item) return NextResponse.json({ error: 'item_id no existe' }, { status: 404 })
  if (item.estado === 'pagado') return NextResponse.json({ error: 'Ese pago ya llegó al banco: no se modifica' }, { status: 400 })

  const cambios: Record<string, unknown> = {}
  if (body.accion === 'anular') cambios.estado = 'anulado'
  else if (body.accion === 'reactivar') cambios.estado = 'pendiente'
  else if (body.accion === 'editar') {
    if (body.monto != null) {
      const m = Number(body.monto)
      if (!Number.isInteger(m) || m <= 0) return NextResponse.json({ error: 'monto: entero > 0' }, { status: 400 })
      cambios.monto = m
    }
    if (body.glosa != null) cambios.glosa = String(body.glosa).trim() || null
    if (body.cuenta_id) {
      const { data: c } = await admin.from('cuentas_bancarias').select('*').eq('id', body.cuenta_id).maybeSingle()
      if (!c || c.rut !== item.rut) return NextResponse.json({ error: 'cuenta_id no existe o es de otro RUT' }, { status: 400 })
      cambios.banco_codigo = c.banco_codigo
      cambios.numero_cuenta = c.numero_cuenta
      if (!item.email && c.email) cambios.email = c.email
    }
  } else return NextResponse.json({ error: "accion: 'anular' | 'reactivar' | 'editar'" }, { status: 400 })
  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 })

  const previo = Object.fromEntries(Object.keys(cambios).map(k => [k, item[k] ?? null]))
  const { error } = await admin.from('pagos_lote_items').update(cambios).eq('id', item.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await registrarAccion({ herramienta: 'pago-lote-item', payload: { previo }, resultado_tabla: 'pagos_lote_items', resultado_id: item.id, ok: true })
  const [lote] = await leerLotes(admin, { id: item.lote_id })
  return NextResponse.json({ ok: true, ...resumenLote(lote) })
}
