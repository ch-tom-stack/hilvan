import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { bancoFicha, codigoBanco } from '@/lib/bancos'
import { limpiarCuenta, limpiarRut, rutConPuntos, rutValido } from '@/lib/pagos-masivos'

export const runtime = 'nodejs'

const TIPOS_DOC = ['boleta', 'bet', 'factura', 'sin_documento', 'contratado']
const TIPOS_CUENTA = ['corriente', 'vista', 'ahorro']
const CAMPOS = 'id, nombre, rut, email, telefono, tipo_persona, razon_social, tipo_documento, banco, tipo_cuenta, numero_cuenta, rol_habitual, especialidades'

// POST /api/agent/colaborador-guardar
// Crea un colaborador o completa uno existente (se busca por RUT). Pensado para
// dar de alta a quienes ya aparecen en el directorio de cuentas: con cuenta_id
// (de hilvan_cuentas_bancarias) copia banco, tipo y número de cuenta, y el
// nombre si no se manda otro. Solo escribe los campos que vienen.
// Body: { rut, nombre?, email?, telefono?, tipo_persona?, razon_social?,
//         tipo_documento?, rol_habitual?, especialidades?, cuenta_id? |
//         (banco?, tipo_cuenta?, numero_cuenta?) }
// Reversible con hilvan_deshacer: crear → borra (si nada lo referencia aún);
// editar → restaura lo previo.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const rut = limpiarRut(body?.rut)
  if (!rut || !rutValido(rut)) return NextResponse.json({ error: `RUT inválido (${body?.rut ?? ''})` }, { status: 400 })

  const admin = createAdminClient()

  // ── Validar todo antes de escribir ─────────────────────────────────────────
  const cambios: Record<string, unknown> = {}
  const texto = (k: string) => {
    if (body?.[k] == null) return
    if (typeof body[k] !== 'string') throw new Error(`${k} debe ser texto`)
    cambios[k] = body[k].trim() || null
  }
  let cuenta: any = null
  try {
    ;['nombre', 'email', 'telefono', 'razon_social', 'rol_habitual'].forEach(texto)
    if (body?.tipo_persona != null) {
      if (!['natural', 'empresa'].includes(body.tipo_persona)) throw new Error("tipo_persona: 'natural' | 'empresa'")
      cambios.tipo_persona = body.tipo_persona
    }
    if (body?.tipo_documento != null) {
      if (!TIPOS_DOC.includes(body.tipo_documento)) throw new Error(`tipo_documento: ${TIPOS_DOC.join(' | ')}`)
      cambios.tipo_documento = body.tipo_documento
    }
    if (body?.especialidades != null) {
      if (!Array.isArray(body.especialidades) || body.especialidades.some((e: unknown) => typeof e !== 'string')) throw new Error('especialidades: lista de textos')
      cambios.especialidades = body.especialidades
    }
    if (body?.cuenta_id) {
      const { data } = await admin.from('cuentas_bancarias').select('*').eq('id', body.cuenta_id).maybeSingle()
      if (!data) throw new Error('cuenta_id no existe')
      if (data.rut !== rut) throw new Error(`la cuenta ${body.cuenta_id} es de otro RUT (${rutConPuntos(data.rut)})`)
      cuenta = data
      cambios.banco = bancoFicha(data.banco_codigo)
      cambios.numero_cuenta = data.numero_cuenta
      if (data.tipo_cuenta && TIPOS_CUENTA.includes(data.tipo_cuenta)) cambios.tipo_cuenta = data.tipo_cuenta
      if (!cambios.nombre) cambios.nombre_sugerido = data.nombre
      if (!cambios.email && data.email) cambios.email = data.email
    } else {
      if (body?.banco != null) {
        const codigo = codigoBanco(String(body.banco))
        if (!codigo) throw new Error(`banco no reconocido (${body.banco})`)
        cambios.banco = bancoFicha(codigo)
      }
      if (body?.numero_cuenta != null) {
        const n = limpiarCuenta(body.numero_cuenta)
        if (!n) throw new Error('numero_cuenta inválido')
        cambios.numero_cuenta = n
      }
      if (body?.tipo_cuenta != null) {
        if (!TIPOS_CUENTA.includes(body.tipo_cuenta)) throw new Error(`tipo_cuenta: ${TIPOS_CUENTA.join(' | ')}`)
        cambios.tipo_cuenta = body.tipo_cuenta
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }

  // ¿Ya existe? (el RUT en colaboradores puede venir con o sin puntos)
  const { data: todos, error: eBus } = await admin.from('colaboradores').select(CAMPOS).not('rut', 'is', null)
  if (eBus) return NextResponse.json({ error: eBus.message }, { status: 500 })
  const existente = (todos ?? []).find((c: any) => limpiarRut(c.rut) === rut) as any

  const nombreSugerido = cambios.nombre_sugerido as string | undefined
  delete cambios.nombre_sugerido

  let colaborador: any
  if (existente) {
    const previo: Record<string, unknown> = {}
    for (const k of Object.keys(cambios)) previo[k] = existente[k] ?? null
    const reales = Object.fromEntries(Object.entries(cambios).filter(([k, v]) => JSON.stringify(existente[k] ?? null) !== JSON.stringify(v)))
    if (Object.keys(reales).length === 0) {
      if (cuenta && !cuenta.colaborador_id) await admin.from('cuentas_bancarias').update({ colaborador_id: existente.id }).eq('rut', rut)
      return NextResponse.json({ ok: true, sin_cambios: true, colaborador: existente })
    }
    const { data, error } = await admin.from('colaboradores').update({ ...reales, updated_at: new Date().toISOString() }).eq('id', existente.id).select(CAMPOS).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    colaborador = data
    await admin.from('cuentas_bancarias').update({ colaborador_id: existente.id }).eq('rut', rut)
    await registrarAccion({
      herramienta: 'colaborador-guardar',
      payload: { modo: 'editar', previo: Object.fromEntries(Object.keys(reales).map(k => [k, previo[k]])) },
      resultado_tabla: 'colaboradores', resultado_id: existente.id, ok: true,
    })
    return NextResponse.json({ ok: true, editado: true, campos: Object.keys(reales), colaborador })
  }

  const nombre = (cambios.nombre as string | null) || nombreSugerido
  if (!nombre) return NextResponse.json({ error: 'Falta nombre (o un cuenta_id de donde tomarlo)' }, { status: 400 })
  const { data, error } = await admin.from('colaboradores')
    .insert({ ...cambios, nombre, rut: rutConPuntos(rut) })
    .select(CAMPOS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  colaborador = data
  await admin.from('cuentas_bancarias').update({ colaborador_id: data.id }).eq('rut', rut)
  await registrarAccion({
    herramienta: 'colaborador-guardar', payload: { modo: 'crear', rut },
    resultado_tabla: 'colaboradores', resultado_id: data.id, ok: true,
  })
  return NextResponse.json({ ok: true, creado: true, colaborador })
}
