import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularCascada, minutosAHora } from '@/lib/rodaje-helpers'
import type { RodajeBloque } from '@/types'

export const runtime = 'nodejs'

// GET /api/agent/rodaje?id=
// Detalle de un rodaje sembrado: metadata + departamentos + equipo + bloques
// (con hora calculada vía cascada) + nº de citaciones. Para inspeccionar lo creado.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const id = new URL(req.url).searchParams.get('id')?.trim() ?? ''
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: rodaje, error } = await admin
    .from('rodajes')
    .select(`
      id, nombre, fecha, estado, proyecto_id, cotizacion_id,
      locacion_nombre, hora_llamado_general,
      cotizacion:cotizaciones(grupo:cotizacion_grupos(numero_base))
    `)
    .eq('id', id)
    .single()

  if (error || !rodaje) {
    return NextResponse.json({ error: 'Rodaje no encontrado' }, { status: 404 })
  }

  const [
    { data: departamentos },
    { data: equipo },
    { data: bloquesRaw },
    { count: citaciones },
  ] = await Promise.all([
    admin
      .from('rodaje_departamentos')
      .select('id, nombre, hora_llamado, orden')
      .eq('rodaje_id', id)
      .order('orden'),
    admin
      .from('rodaje_equipo_tecnico')
      .select('id, nombre, rol, departamento_id, es_jefe_departamento, hora_llamado_individual, hora_salida_individual')
      .eq('rodaje_id', id),
    admin
      .from('rodaje_bloques')
      .select('*')
      .eq('rodaje_id', id)
      .order('orden'),
    admin
      .from('rodaje_citaciones')
      .select('id', { count: 'exact', head: true })
      .eq('rodaje_id', id),
  ])

  // Mapa departamento_id → nombre para enriquecer el equipo
  const deptoNombre = new Map(
    (departamentos ?? []).map((d: any) => [d.id as string, d.nombre as string]),
  )

  const cascada = calcularCascada((bloquesRaw ?? []) as RodajeBloque[])
  const cascadaPorId = new Map(cascada.map((c) => [c.id, c]))

  const bloques = (bloquesRaw ?? []).map((b: any) => {
    const c = cascadaPorId.get(b.id as string)
    return {
      id: b.id as string,
      orden: b.orden as number,
      titulo: b.titulo as string,
      tipo: b.tipo as string,
      scenes_label: (b.scenes_label as string | null) ?? null,
      duracion_min: (b.duracion_min as number | null) ?? null,
      hora_inicio: c?.inicio_min !== undefined ? minutosAHora(c.inicio_min) : null,
      hora_fin: c?.fin_min !== undefined ? minutosAHora(c.fin_min) : null,
    }
  })

  return NextResponse.json({
    id: rodaje.id,
    nombre: rodaje.nombre,
    fecha: rodaje.fecha ?? null,
    estado: rodaje.estado,
    proyecto_id: rodaje.proyecto_id ?? null,
    cotizacion_id: rodaje.cotizacion_id ?? null,
    cotizacion_numero: (rodaje.cotizacion as any)?.grupo?.numero_base ?? null,
    locacion_nombre: rodaje.locacion_nombre ?? null,
    hora_llamado_general: rodaje.hora_llamado_general ?? null,
    departamentos: (departamentos ?? []).map((d: any) => ({
      id: d.id,
      nombre: d.nombre,
      hora_llamado: d.hora_llamado ?? null,
      orden: d.orden,
    })),
    equipo: (equipo ?? []).map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      rol: p.rol ?? null,
      departamento: p.departamento_id ? deptoNombre.get(p.departamento_id) ?? null : null,
      es_jefe_departamento: p.es_jefe_departamento ?? false,
      llamado: (p.hora_llamado_individual as string | null)?.slice(0, 5) ?? null,
      salida: (p.hora_salida_individual as string | null)?.slice(0, 5) ?? null,
    })),
    bloques,
    citaciones: citaciones ?? 0,
  })
}
