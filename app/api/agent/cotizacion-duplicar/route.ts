import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { resolverPerfilAgente } from '@/lib/agent-perfil'

export const runtime = 'nodejs'

// POST /api/agent/cotizacion-duplicar (JSON)
// Replica copiarCotizacion / nuevaVersion / nuevaVariante de la UI, pero vía
// agente (admin + auditoría). Una sola herramienta con `modo`:
//   - 'copia'    → grupo NUEVO (número nuevo). Como "Duplicar" en la UI.
//   - 'version'  → MISMO grupo, version = max(versiones del grupo) + 1.
//   - 'variante' → MISMO grupo, misma version, siguiente letra libre (o la dada).
// Copia cabecera + departamentos (con precio_manual de bundle) → subgrupos
// (con precio_manual) → ítems, replicando el shape de copiarItem.
//
// REVERSIBLE: registra herramienta 'cotizacion-duplicar' con la nueva
// cotizacion_id y (solo en 'copia') el grupo_id creado → deshacer borra la
// cotización completa en cascada y, si creó grupo, también el grupo.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const cotizacion_id = String(body?.cotizacion_id ?? '').trim()
  const modo = String(body?.modo ?? '').trim()
  if (!cotizacion_id) {
    return NextResponse.json({ error: 'Se requiere cotizacion_id' }, { status: 400 })
  }
  if (!['copia', 'version', 'variante'].includes(modo)) {
    return NextResponse.json(
      { error: "modo debe ser 'copia', 'version' o 'variante'" },
      { status: 400 },
    )
  }
  const nombreOverride =
    typeof body?.nombre === 'string' && body.nombre.trim() ? body.nombre.trim() : undefined
  const varianteOverride =
    typeof body?.variante === 'string' && body.variante.trim()
      ? body.variante.trim().toUpperCase()
      : undefined

  const admin = createAdminClient()

  // ── 1) Cargar la cotización original COMPLETA ─────────────────────────────
  const { data: original, error: oErr } = await admin
    .from('cotizaciones')
    .select(`*,
      departamentos:cotizacion_departamentos(*,
        subgrupos:cotizacion_subgrupos(*, items:cotizacion_items(*)),
        items:cotizacion_items(*))`)
    .eq('id', cotizacion_id)
    .single()
  if (oErr || !original) {
    return NextResponse.json({ error: 'No existe esa cotización' }, { status: 404 })
  }

  const perfil = await resolverPerfilAgente(admin)
  if (!perfil.ok) {
    return NextResponse.json({ error: perfil.error }, { status: 400 })
  }
  const createdBy = perfil.id

  // ── 2) Determinar grupo destino + version + variante según modo ───────────
  let grupoIdDestino = original.grupo_id as string
  let grupoCreadoId: string | null = null
  let version = original.version as number
  let variante: string | null = original.variante ?? null

  if (modo === 'copia') {
    const { data: numeroData, error: numErr } = await admin.rpc('siguiente_numero_grupo')
    if (numErr) return NextResponse.json({ error: numErr.message }, { status: 500 })
    const { data: nuevoGrupo, error: gErr } = await admin
      .from('cotizacion_grupos')
      .insert({
        numero_base: numeroData,
        cliente_id: original.cliente_id,
        proyecto_id: original.proyecto_id,
        created_by: createdBy,
      })
      .select('id, numero_base')
      .single()
    if (gErr || !nuevoGrupo) {
      return NextResponse.json({ error: gErr?.message ?? 'No se pudo crear el grupo' }, { status: 500 })
    }
    grupoIdDestino = nuevoGrupo.id
    grupoCreadoId = nuevoGrupo.id
  } else if (modo === 'version') {
    const { data: existentes } = await admin
      .from('cotizaciones')
      .select('version')
      .eq('grupo_id', original.grupo_id)
    const maxVersion = Math.max(0, ...(existentes ?? []).map((c: any) => c.version ?? 0))
    version = maxVersion + 1
    variante = null
  } else {
    // variante
    const { data: variantes } = await admin
      .from('cotizaciones')
      .select('variante')
      .eq('grupo_id', original.grupo_id)
      .eq('version', original.version)
      .not('variante', 'is', null)
    const letrasUsadas = (variantes ?? []).map((v: any) => v.variante).filter(Boolean)
    if (varianteOverride) {
      if (letrasUsadas.includes(varianteOverride)) {
        return NextResponse.json(
          { error: `La variante "${varianteOverride}" ya existe en esta versión` },
          { status: 400 },
        )
      }
      variante = varianteOverride
    } else {
      variante =
        'BCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(l => !letrasUsadas.includes(l)) ?? 'B'
    }
  }

  // Helper de aborto: si ya creamos grupo/cotización, registra acción reversible.
  async function abortar(msg: string, cotizacionId: string | null) {
    await registrarAccion({
      herramienta: 'cotizacion-duplicar',
      payload: { grupo_id: grupoCreadoId ?? undefined, cotizacion_id: cotizacionId, parcial: true, error: msg },
      resultado_tabla: 'cotizaciones',
      resultado_id: cotizacionId,
      ok: true,
    })
    return NextResponse.json({ error: msg, cotizacion_id: cotizacionId }, { status: 500 })
  }

  // ── 3) Crear la cotización nueva (cabecera) ───────────────────────────────
  const { data: nueva, error: nErr } = await admin
    .from('cotizaciones')
    .insert({
      grupo_id: grupoIdDestino,
      version,
      variante,
      copiada_de: cotizacion_id,
      nombre: nombreOverride ?? original.nombre,
      cliente_id: original.cliente_id,
      cliente_nombre_libre: original.cliente_nombre_libre,
      cliente_email_libre: original.cliente_email_libre,
      proyecto_id: original.proyecto_id,
      con_iva: original.con_iva,
      formato_pdf: original.formato_pdf,
      descuento_global: original.descuento_global,
      descuento_global_tipo: original.descuento_global_tipo,
      descripcion: original.descripcion,
      notas_internas: original.notas_internas,
      notas_cliente: original.notas_cliente,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (nErr || !nueva) {
    return abortar(nErr?.message ?? 'No se pudo crear la cotización', null)
  }
  const nuevaId = nueva.id as string

  // ── 4) Copiar departamentos → subgrupos → ítems (con precio_manual) ───────
  async function insertarItem(item: any, departamento_id: string, subgrupo_id: string | null) {
    const { error } = await admin.from('cotizacion_items').insert({
      cotizacion_id: nuevaId,
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

  const deps = [...(original.departamentos ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  for (const dep of deps) {
    const { data: depRow, error: depErr } = await admin
      .from('cotizacion_departamentos')
      .insert({ cotizacion_id: nuevaId, nombre: dep.nombre, orden: dep.orden, precio_manual: dep.precio_manual })
      .select('id')
      .single()
    if (depErr || !depRow) return abortar(depErr?.message ?? 'Error creando departamento', nuevaId)
    const depId = depRow.id as string

    for (const sg of dep.subgrupos ?? []) {
      const { data: sgRow, error: sgErr } = await admin
        .from('cotizacion_subgrupos')
        .insert({
          cotizacion_id: nuevaId,
          departamento_id: depId,
          nombre: sg.nombre,
          orden: sg.orden,
          precio_manual: sg.precio_manual,
        })
        .select('id')
        .single()
      if (sgErr || !sgRow) return abortar(sgErr?.message ?? 'Error creando subgrupo', nuevaId)
      const sgId = sgRow.id as string
      for (const item of sg.items ?? []) {
        const err = await insertarItem(item, depId, sgId)
        if (err) return abortar(err, nuevaId)
      }
    }

    // Ítems directos del departamento (sin subgrupo).
    for (const item of (dep.items ?? []).filter((i: any) => i.subgrupo_id === null)) {
      const err = await insertarItem(item, depId, null)
      if (err) return abortar(err, nuevaId)
    }
  }

  // ── Auditoría OK (reversible) ─────────────────────────────────────────────
  await registrarAccion({
    herramienta: 'cotizacion-duplicar',
    payload: { grupo_id: grupoCreadoId ?? undefined, cotizacion_id: nuevaId, modo },
    resultado_tabla: 'cotizaciones',
    resultado_id: nuevaId,
    ok: true,
  })

  return NextResponse.json({
    cotizacion_id: nuevaId,
    modo,
    version,
    variante,
    grupo_nuevo: grupoCreadoId != null,
    url: `/cotizaciones/${nuevaId}`,
  })
}
