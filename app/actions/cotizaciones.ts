'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type {
  Cotizacion,
  CotizacionItem,
  Cliente,
  Proyecto,
} from '@/types'

// ============================================================
// HELPERS INTERNOS
// ============================================================

async function cargarCotizacionCompleta(id: string) {
  const supabase = await createClient()

  const { data: cotizacion, error } = await supabase
    .from('cotizaciones')
    .select(`
      *,
      grupo:cotizacion_grupos(
        *,
        cliente:clientes(*),
        proyecto:proyectos(*)
      ),
      cliente:clientes(*),
      proyecto:proyectos(*),
      departamentos:cotizacion_departamentos(
        *,
        subgrupos:cotizacion_subgrupos(
          *,
          items:cotizacion_items(*)
        ),
        items:cotizacion_items(*)
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)

  // Filtrar ítems directos del departamento (sin subgrupo) en el cliente
  if (cotizacion.departamentos) {
    for (const dep of cotizacion.departamentos) {
      dep.items = (dep.items ?? []).filter(
        (item: any) => item.subgrupo_id === null
      )
    }
    cotizacion.departamentos.sort((a: any, b: any) => a.orden - b.orden)
    for (const dep of cotizacion.departamentos) {
      dep.subgrupos?.sort((a: any, b: any) => a.orden - b.orden)
      dep.items?.sort((a: any, b: any) => a.orden - b.orden)
      for (const sg of dep.subgrupos ?? []) {
        sg.items?.sort((a: any, b: any) => a.orden - b.orden)
      }
    }
  }

  return cotizacion
}

async function copiarItem(
  supabase: any,
  item: any,
  cotizacion_id: string,
  departamento_id: string,
  subgrupo_id: string | null
) {
  const { error } = await supabase.from('cotizacion_items').insert({
    cotizacion_id,
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
  if (error) throw new Error(error.message)
}

// ============================================================
// LEER
// ============================================================

export async function getCotizacionesGrupos() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizacion_grupos')
    .select(`
      *,
      cliente:clientes(*),
      proyecto:proyectos(*),
      cotizaciones(
        id, version, variante, nombre, estado, updated_at, created_by
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function getCotizacion(id: string) {
  return cargarCotizacionCompleta(id)
}

export async function getCotizacionPorToken(token: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(`
      *,
      grupo:cotizacion_grupos(*),
      cliente:clientes(*),
      departamentos:cotizacion_departamentos(
        *,
        subgrupos:cotizacion_subgrupos(
          *,
          items:cotizacion_items(*)
        ),
        items:cotizacion_items(*)
      )
    `)
    .eq('token', token)
    .single()

  if (error) return null

  // Filtrar ítems directos
  if (data.departamentos) {
    for (const dep of data.departamentos) {
      dep.items = (dep.items ?? []).filter(
        (item: any) => item.subgrupo_id === null
      )
    }
  }

  return data
}

export async function getClientes() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre')
  if (error) throw new Error(error.message)
  return data as Cliente[]
}

export async function getProyectos() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proyectos')
    .select('*, cliente:clientes(*)')
    .order('nombre')
  if (error) throw new Error(error.message)
  return data as Proyecto[]
}

export async function getTarifasBase() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tarifas_base')
    .select('*')
    .eq('activo', true)
    .order('tipo')
    .order('nombre')
  if (error) throw new Error(error.message)
  return data
}

export async function getEquiposConRental() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipos')
    .select('*, categoria:categorias_equipo(*)')
    .not('precio_jornada', 'is', null)
    .order('nombre')
  if (error) throw new Error(error.message)
  return data
}

// ============================================================
// CREAR COTIZACIÓN NUEVA
// ============================================================

export async function crearCotizacion(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const nombre = formData.get('nombre') as string
  const cliente_id = (formData.get('cliente_id') as string) || null
  const cliente_nombre_libre =
    (formData.get('cliente_nombre_libre') as string) || null
  const proyecto_id = (formData.get('proyecto_id') as string) || null

  // 1. Número de grupo
  const { data: numeroData, error: numeroError } = await supabase.rpc(
    'siguiente_numero_grupo'
  )
  if (numeroError) throw new Error(numeroError.message)

  // 2. Crear grupo
  const { data: grupo, error: grupoError } = await supabase
    .from('cotizacion_grupos')
    .insert({
      numero_base: numeroData,
      cliente_id: cliente_id || null,
      proyecto_id: proyecto_id || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (grupoError) throw new Error(grupoError.message)

  // 3. Crear cotización v1
  const { data: cotizacion, error: cotError } = await supabase
    .from('cotizaciones')
    .insert({
      grupo_id: grupo.id,
      version: 1,
      variante: null,
      nombre,
      cliente_id: cliente_id || null,
      cliente_nombre_libre: cliente_nombre_libre || null,
      proyecto_id: proyecto_id || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (cotError) throw new Error(cotError.message)

  // 4. Departamentos por defecto
  const departamentosDefault = [
    'Dirección',
    'Fotografía',
    'Sonido',
    'Arte',
    'Cast',
    'Locación / Estudio',
    'Post-producción',
    'Otros / Varios',
  ]

  const { error: depError } = await supabase
    .from('cotizacion_departamentos')
    .insert(
      departamentosDefault.map((nombre, i) => ({
        cotizacion_id: cotizacion.id,
        nombre,
        orden: i,
      }))
    )

  if (depError) throw new Error(depError.message)

  revalidatePath('/cotizaciones')
  redirect(`/cotizaciones/${cotizacion.id}`)
}

// ============================================================
// COPIAR COTIZACIÓN (núcleo compartido)
// ============================================================

export async function copiarCotizacion(
  cotizacionId: string,
  overrides: {
    version?: number
    variante?: string | null
    grupo_id?: string | 'nuevo'
    nombre?: string
  } = {}
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const original = await cargarCotizacionCompleta(cotizacionId)

  // Determinar grupo destino
  let grupo_id = overrides.grupo_id ?? original.grupo_id

  if (overrides.grupo_id === 'nuevo') {
    const { data: numeroData, error: numeroError } = await supabase.rpc(
      'siguiente_numero_grupo'
    )
    if (numeroError) throw new Error(numeroError.message)

    const { data: nuevoGrupo, error: gErr } = await supabase
      .from('cotizacion_grupos')
      .insert({
        numero_base: numeroData,
        cliente_id: original.cliente_id,
        proyecto_id: original.proyecto_id,
        created_by: user.id,
      })
      .select()
      .single()

    if (gErr) throw new Error(gErr.message)
    grupo_id = nuevoGrupo.id
  }

  // Crear cotización nueva
  const { data: nueva, error: nuevaError } = await supabase
    .from('cotizaciones')
    .insert({
      grupo_id,
      version: overrides.version ?? original.version,
      variante:
        overrides.variante !== undefined
          ? overrides.variante
          : original.variante,
      copiada_de: cotizacionId,
      nombre: overrides.nombre ?? original.nombre,
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
      created_by: user.id,
    })
    .select()
    .single()

  if (nuevaError) throw new Error(nuevaError.message)

  // Copiar departamentos → subgrupos → ítems
  for (const dep of original.departamentos ?? []) {
    const { data: nuevaDep, error: depErr } = await supabase
      .from('cotizacion_departamentos')
      .insert({
        cotizacion_id: nueva.id,
        nombre: dep.nombre,
        orden: dep.orden,
      })
      .select()
      .single()

    if (depErr) throw new Error(depErr.message)

    // Subgrupos
    for (const sg of dep.subgrupos ?? []) {
      const { data: nuevaSg, error: sgErr } = await supabase
        .from('cotizacion_subgrupos')
        .insert({
          cotizacion_id: nueva.id,
          departamento_id: nuevaDep.id,
          nombre: sg.nombre,
          orden: sg.orden,
        })
        .select()
        .single()

      if (sgErr) throw new Error(sgErr.message)

      for (const item of sg.items ?? []) {
        await copiarItem(supabase, item, nueva.id, nuevaDep.id, nuevaSg.id)
      }
    }

    // Ítems directos del departamento
    for (const item of dep.items ?? []) {
      await copiarItem(supabase, item, nueva.id, nuevaDep.id, null)
    }
  }

  revalidatePath('/cotizaciones')
  redirect(`/cotizaciones/${nueva.id}`)
}

// ============================================================
// NUEVA VERSIÓN
// ============================================================

export async function nuevaVersion(cotizacionId: string) {
  const supabase = await createClient()

  const { data: original, error } = await supabase
    .from('cotizaciones')
    .select('grupo_id, version')
    .eq('id', cotizacionId)
    .single()

  if (error) throw new Error(error.message)

  const { data: existentes } = await supabase
    .from('cotizaciones')
    .select('version')
    .eq('grupo_id', original.grupo_id)

  const maxVersion = Math.max(
    0,
    ...(existentes ?? []).map((c: any) => c.version)
  )

  return copiarCotizacion(cotizacionId, {
    version: maxVersion + 1,
    variante: null,
  })
}

// ============================================================
// NUEVA VARIANTE
// ============================================================

export async function nuevaVariante(cotizacionId: string) {
  const supabase = await createClient()

  const { data: original, error } = await supabase
    .from('cotizaciones')
    .select('grupo_id, version')
    .eq('id', cotizacionId)
    .single()

  if (error) throw new Error(error.message)

  const { data: variantes } = await supabase
    .from('cotizaciones')
    .select('variante')
    .eq('grupo_id', original.grupo_id)
    .eq('version', original.version)
    .not('variante', 'is', null)

  const letrasUsadas = (variantes ?? [])
    .map((v: any) => v.variante)
    .filter(Boolean)

  const siguienteLetra =
    'BCDEFGHIJKLMNOPQRSTUVWXYZ'
      .split('')
      .find(l => !letrasUsadas.includes(l)) ?? 'B'

  return copiarCotizacion(cotizacionId, {
    version: original.version,
    variante: siguienteLetra,
  })
}

// ============================================================
// DUPLICAR COMO COTIZACIÓN INDEPENDIENTE
// ============================================================

export async function duplicarCotizacion(cotizacionId: string) {
  return copiarCotizacion(cotizacionId, { grupo_id: 'nuevo' })
}

// ============================================================
// ACTUALIZAR METADATOS
// ============================================================

export async function actualizarCotizacion(
  id: string,
  campos: Partial<Cotizacion>
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizaciones')
    .update(campos)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${id}`)
}

// ============================================================
// ENVIAR AL CLIENTE
// ============================================================

export async function enviarCotizacion(id: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizaciones')
    .update({
      estado: 'enviada',
      token: crypto.randomUUID(),
      fecha_envio: new Date().toISOString(),
    })
    .eq('id', id)
    .select('token')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${id}`)
  return data.token as string
}

// ============================================================
// RESPUESTA DEL CLIENTE (anon)
// ============================================================

export async function responderCotizacion(
  token: string,
  respuesta: 'aprobada' | 'rechazada',
  comentario?: string
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizaciones')
    .update({
      estado: respuesta,
      comentario_cliente: comentario ?? null,
      fecha_respuesta_cliente: new Date().toISOString(),
    })
    .eq('token', token)
    .eq('estado', 'enviada')

  if (error) throw new Error(error.message)
  revalidatePath(`/cotizacion/${token}`)
}

// ============================================================
// DEPARTAMENTOS
// ============================================================

export async function agregarDepartamento(
  cotizacion_id: string,
  nombre: string,
  orden: number
) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizacion_departamentos')
    .insert({ cotizacion_id, nombre, orden })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${cotizacion_id}`)
  return data
}

export async function actualizarDepartamento(
  id: string,
  cotizacion_id: string,
  campos: { nombre?: string; orden?: number }
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizacion_departamentos')
    .update(campos)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${cotizacion_id}`)
}

export async function eliminarDepartamento(
  id: string,
  cotizacion_id: string
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizacion_departamentos')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${cotizacion_id}`)
}

// ============================================================
// SUB-GRUPOS
// ============================================================

export async function agregarSubgrupo(
  cotizacion_id: string,
  departamento_id: string,
  nombre: string,
  orden: number
) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizacion_subgrupos')
    .insert({ cotizacion_id, departamento_id, nombre, orden })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${cotizacion_id}`)
  return data
}

export async function actualizarSubgrupo(
  id: string,
  cotizacion_id: string,
  campos: { nombre?: string; orden?: number }
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizacion_subgrupos')
    .update(campos)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${cotizacion_id}`)
}

export async function eliminarSubgrupo(id: string, cotizacion_id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizacion_subgrupos')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${cotizacion_id}`)
}

// ============================================================
// ÍTEMS
// ============================================================

export async function agregarItem(
  item: Omit<
    CotizacionItem,
    'id' | 'created_at' | 'subtotal_cliente' | 'costo_real' | 'margen'
  >
) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizacion_items')
    .insert(item)
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${item.cotizacion_id}`)
  return data
}

export async function actualizarItem(
  id: string,
  cotizacion_id: string,
  campos: Partial<CotizacionItem>
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizacion_items')
    .update(campos)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${cotizacion_id}`)
}

export async function eliminarItem(id: string, cotizacion_id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizacion_items')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/cotizaciones/${cotizacion_id}`)
}

export async function reordenarItems(
  cotizacion_id: string,
  items: Array<{ id: string; orden: number }>
) {
  const supabase = await createClient()
  await Promise.all(
    items.map(({ id, orden }) =>
      supabase.from('cotizacion_items').update({ orden }).eq('id', id)
    )
  )
  revalidatePath(`/cotizaciones/${cotizacion_id}`)
}

// ============================================================
// CLIENTES
// ============================================================

export async function crearCliente(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nombre: formData.get('nombre') as string,
      empresa: (formData.get('empresa') as string) || null,
      email: (formData.get('email') as string) || null,
      telefono: (formData.get('telefono') as string) || null,
      rut: (formData.get('rut') as string) || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/cotizaciones')
  return data as Cliente
}
