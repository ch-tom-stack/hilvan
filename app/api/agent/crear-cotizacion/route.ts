import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { resolverPerfilAgente } from '@/lib/agent-perfil'
import {
  validarCotizacion,
  DEPARTAMENTOS_DEFAULT,
  type ItemNormalizado,
} from '@/lib/agent-cotizacion'

export const runtime = 'nodejs'

// POST /api/agent/crear-cotizacion (JSON)
// Crea una cotización COMPLETA idéntica a la de un usuario en la UI y 100%
// editable después (replica el shape de copiarItem/crearCotizacion):
//   - cotizacion_grupos (numero_base vía RPC siguiente_numero_grupo) + created_by
//   - cotizaciones v1 (toda la cabecera) + created_by
//   - cotizacion_departamentos → cotizacion_subgrupos → cotizacion_items
// Si no vienen departamentos, crea los 8 por defecto (como "Nueva cotización").
//
// VALIDA TODO antes de la primera escritura (400 sin escribir si algo falla).
// Si falla a mitad, registra acción REVERSIBLE (ok:true) con grupo_id+cotizacion_id
// y devuelve 500 → el usuario puede deshacer lo creado.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // ── 1) Validar TODO antes de tocar la DB ──────────────────────────────────
  const validacion = validarCotizacion(body)
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.error }, { status: 400 })
  }
  const { cabecera, departamentos, usarDepartamentosDefault } = validacion.data

  const admin = createAdminClient()

  // ── created_by: atribuir a un perfil real (admin preferido) para paridad y
  //    editabilidad. Si no hay perfil, no se puede continuar. ─────────────────
  const perfil = await resolverPerfilAgente(admin)
  if (!perfil.ok) {
    return NextResponse.json({ error: perfil.error }, { status: 400 })
  }
  const createdBy = perfil.id

  // Verificar existencia de cliente/proyecto si se entregaron ids (evita FK rota).
  if (cabecera.cliente_id) {
    const { data: cli, error } = await admin
      .from('clientes')
      .select('id')
      .eq('id', cabecera.cliente_id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!cli) {
      return NextResponse.json({ error: 'cliente_id no encontrado' }, { status: 400 })
    }
  }
  if (cabecera.proyecto_id) {
    const { data: proy, error } = await admin
      .from('proyectos')
      .select('id')
      .eq('id', cabecera.proyecto_id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!proy) {
      return NextResponse.json({ error: 'proyecto_id no encontrado' }, { status: 400 })
    }
  }

  // ── 2) Número de grupo (RPC) ──────────────────────────────────────────────
  const { data: numeroData, error: numeroError } = await admin.rpc('siguiente_numero_grupo')
  if (numeroError) {
    return NextResponse.json({ error: numeroError.message }, { status: 500 })
  }

  // ── 3) Crear grupo ────────────────────────────────────────────────────────
  const { data: grupo, error: grupoError } = await admin
    .from('cotizacion_grupos')
    .insert({
      numero_base: numeroData,
      cliente_id: cabecera.cliente_id,
      proyecto_id: cabecera.proyecto_id,
      created_by: createdBy,
    })
    .select('id, numero_base')
    .single()
  if (grupoError || !grupo) {
    return NextResponse.json(
      { error: grupoError?.message ?? 'No se pudo crear el grupo' },
      { status: 500 },
    )
  }
  const grupoId = grupo.id as string

  // Helper de aborto: el grupo (y quizá la cotización) YA existen. Registramos
  // acción reversible con lo creado y devolvemos 500 con los ids.
  async function abortar(msg: string, cotizacionId: string | null) {
    await registrarAccion({
      herramienta: 'crear-cotizacion',
      payload: { grupo_id: grupoId, cotizacion_id: cotizacionId, parcial: true, error: msg },
      resultado_tabla: 'cotizaciones',
      resultado_id: cotizacionId,
      ok: true,
    })
    return NextResponse.json(
      { error: msg, grupo_id: grupoId, cotizacion_id: cotizacionId },
      { status: 500 },
    )
  }

  // ── 4) Crear cotización v1 (toda la cabecera) ─────────────────────────────
  const { data: cotizacion, error: cotError } = await admin
    .from('cotizaciones')
    .insert({
      grupo_id: grupoId,
      version: 1,
      variante: null,
      nombre: cabecera.nombre,
      cliente_id: cabecera.cliente_id,
      cliente_nombre_libre: cabecera.cliente_nombre_libre,
      cliente_email_libre: cabecera.cliente_email_libre,
      proyecto_id: cabecera.proyecto_id,
      con_iva: cabecera.con_iva,
      formato_pdf: cabecera.formato_pdf,
      descuento_global: cabecera.descuento_global,
      descuento_global_tipo: cabecera.descuento_global_tipo,
      descripcion: cabecera.descripcion,
      notas_internas: cabecera.notas_internas,
      notas_cliente: cabecera.notas_cliente,
      fecha_factura_emitida: cabecera.fecha_factura_emitida,
      numero_factura: cabecera.numero_factura,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (cotError || !cotizacion) {
    return abortar(cotError?.message ?? 'No se pudo crear la cotización', null)
  }
  const cotizacionId = cotizacion.id as string

  // ── 5) Departamentos → subgrupos → ítems ──────────────────────────────────
  // Insert de un ítem replicando EXACTAMENTE el shape de copiarItem.
  async function insertarItem(
    item: ItemNormalizado,
    departamento_id: string,
    subgrupo_id: string | null,
  ): Promise<string | null> {
    const { error } = await admin.from('cotizacion_items').insert({
      cotizacion_id: cotizacionId,
      departamento_id,
      subgrupo_id,
      tipo: item.tipo,
      equipo_id: item.equipo_id,
      tarifa_id: item.tarifa_id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      con_boleta: item.con_boleta,
      tasa_boleta: item.tasa_boleta,
      precio_neto_proveedor: item.precio_neto_proveedor,
      precio_bruto: item.precio_bruto,
      precio_cliente_personalizado: item.precio_cliente_personalizado,
      precio_cliente: item.precio_cliente,
      cantidad: item.cantidad,
      dias: item.dias,
      unidad: item.unidad,
      incluido: item.incluido,
      descuento_item: item.descuento_item,
      descuento_item_tipo: item.descuento_item_tipo,
      orden: item.orden,
    })
    return error ? error.message : null
  }

  if (usarDepartamentosDefault) {
    // Mismos 8 departamentos por defecto que "Nueva cotización" en la UI.
    const { error: depError } = await admin.from('cotizacion_departamentos').insert(
      DEPARTAMENTOS_DEFAULT.map((nombre, i) => ({
        cotizacion_id: cotizacionId,
        nombre,
        orden: i,
      })),
    )
    if (depError) return abortar(depError.message, cotizacionId)
  } else {
    for (const dep of departamentos) {
      const { data: depRow, error: depError } = await admin
        .from('cotizacion_departamentos')
        .insert({ cotizacion_id: cotizacionId, nombre: dep.nombre, orden: dep.orden })
        .select('id')
        .single()
      if (depError || !depRow) {
        return abortar(depError?.message ?? 'Error creando departamento', cotizacionId)
      }
      const depId = depRow.id as string

      // Subgrupos y sus ítems.
      for (const sg of dep.subgrupos) {
        const { data: sgRow, error: sgError } = await admin
          .from('cotizacion_subgrupos')
          .insert({
            cotizacion_id: cotizacionId,
            departamento_id: depId,
            nombre: sg.nombre,
            orden: sg.orden,
          })
          .select('id')
          .single()
        if (sgError || !sgRow) {
          return abortar(sgError?.message ?? 'Error creando subgrupo', cotizacionId)
        }
        const sgId = sgRow.id as string
        for (const item of sg.items) {
          const err = await insertarItem(item, depId, sgId)
          if (err) return abortar(err, cotizacionId)
        }
      }

      // Ítems directos del departamento (sin subgrupo).
      for (const item of dep.items) {
        const err = await insertarItem(item, depId, null)
        if (err) return abortar(err, cotizacionId)
      }
    }
  }

  // ── Auditoría OK (reversible: borra la cotización completa en cascada) ─────
  await registrarAccion({
    herramienta: 'crear-cotizacion',
    payload: { grupo_id: grupoId, cotizacion_id: cotizacionId },
    resultado_tabla: 'cotizaciones',
    resultado_id: cotizacionId,
    ok: true,
  })

  return NextResponse.json({
    cotizacion_id: cotizacionId,
    numero: grupo.numero_base,
    url: `/cotizaciones/${cotizacionId}`,
  })
}
