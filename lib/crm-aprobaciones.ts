// lib/crm-aprobaciones.ts
// Lógica compartida para APLICAR el efecto de una aprobación al aprobarla.
// La usan tanto el endpoint del agente (/api/agent/crm/resolver-aprobacion,
// con admin client) como la server action de la Bandeja (con session client),
// para que el comportamiento sea idéntico desde el chat y desde la UI.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Campos de texto del payload que se pueden corregir antes de aprobar.
 *
 * Lista blanca a propósito: la Bandeja edita datos propuestos por un agente, y
 * dejar tocar el payload entero permitiría inyectar claves que el aplicador no
 * espera. Acá sólo van campos que el usuario ve y entiende.
 *
 * La comparten la UI (para saber qué inputs mostrar) y la server action (para
 * saber qué acepta): una sola lista, imposible que se desincronicen.
 */
export const CAMPOS_CORREGIBLES: Record<string, string[]> = {
  prospecto_nuevo: ['empresa', 'nombre_contacto', 'email', 'telefono', 'producto_objetivo'],
  interaccion: ['resumen', 'proximo_paso'],
  correo_borrador: ['asunto', 'cuerpo'],
  brief_cotizacion: ['decisor', 'angulo', 'producto_objetivo'],
}

/** Etiqueta legible de cada campo corregible. */
export const LABEL_CAMPO: Record<string, string> = {
  empresa: 'Empresa', nombre_contacto: 'Contacto', email: 'Email', telefono: 'Teléfono',
  producto_objetivo: 'Producto', resumen: 'Resumen', proximo_paso: 'Próximo paso',
  asunto: 'Asunto', cuerpo: 'Cuerpo', decisor: 'Decisor', angulo: 'Ángulo',
}

export interface AprobacionRow {
  id: string
  tipo: string
  prospecto_id: string | null
  payload: any
  estado: string
}

export class AplicarError extends Error {}

/**
 * Aplica el efecto de una aprobación según su tipo. Devuelve un objeto `aplicado`
 * con el resultado (o null para tipos que no ejecutan nada en esta fase).
 * Lanza AplicarError si la propuesta está incompleta o falla la escritura.
 *
 *   prospecto_nuevo → crea el prospecto
 *   cambio_etapa    → mueve la etapa
 *   interaccion     → registra la interacción
 *   brief_cotizacion / correo_borrador → no ejecuta (derivación/Gmail = fases posteriores)
 */
export async function aplicarEfectoAprobacion(
  client: SupabaseClient,
  ap: AprobacionRow,
): Promise<Record<string, unknown> | null> {
  const payload: any = ap.payload ?? {}

  if (ap.tipo === 'prospecto_nuevo') {
    if (!payload.empresa) throw new AplicarError('La propuesta no tiene empresa')
    const { data, error } = await client
      .from('prospectos')
      .insert({
        empresa: payload.empresa,
        nombre_contacto: payload.nombre_contacto ?? null,
        email: payload.email ?? null,
        telefono: payload.telefono ?? null,
        origen: payload.origen ?? null,
        arquetipo: payload.arquetipo ?? null,
        responsable_id: payload.responsable_id || null,
        score: payload.score ?? null,
        decisor: payload.decisor ?? null,
        angulo: payload.angulo ?? null,
        producto_objetivo: payload.producto_objetivo ?? null,
        notas: payload.notas ?? null,
        etapa: payload.etapa || 'prospecto',
      })
      .select('id')
      .single()
    if (error) throw new AplicarError(error.message)

    // Archiva la lectura junto al prospecto recién creado. Antes el dossier
    // solo vivía en el Supabase del sitio y en Hilván quedaba el resumen en
    // texto plano; acá es el insumo del brief cuando el prospecto avanza.
    // No bloquea la aprobación: el prospecto ya existe y es lo que importa.
    if (payload.dossier || payload.url) {
      const { error: errLectura } = await client.from('crm_lecturas').insert({
        prospecto_id: data.id,
        url: payload.url ?? null,
        dossier: payload.dossier ?? null,
        producto_derivado: payload.producto_objetivo ?? null,
        fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }),
      })
      if (errLectura) console.error('[crm] no se pudo archivar la lectura:', errLectura.message)
    }

    return { prospecto_id: data.id }
  }

  if (ap.tipo === 'cambio_etapa') {
    const target = ap.prospecto_id || payload.prospecto_id
    if (!target || !payload.etapa) throw new AplicarError('Propuesta de cambio_etapa incompleta')
    const { error } = await client.from('prospectos').update({ etapa: payload.etapa }).eq('id', target)
    if (error) throw new AplicarError(error.message)
    return { prospecto_id: target, etapa: payload.etapa }
  }

  if (ap.tipo === 'interaccion') {
    const target = ap.prospecto_id || payload.prospecto_id
    if (!target) throw new AplicarError('Propuesta de interacción sin prospecto')
    const { data, error } = await client
      .from('crm_interacciones')
      .insert({
        prospecto_id: target,
        fecha: payload.fecha ?? null,
        tipo: payload.tipo ?? null,
        resumen: payload.resumen ?? null,
        proximo_paso: payload.proximo_paso ?? null,
        fecha_proximo: payload.fecha_proximo ?? null,
        gmail_thread: payload.gmail_thread ?? null,
      })
      .select('id')
      .single()
    if (error) throw new AplicarError(error.message)
    return { interaccion_id: data.id }
  }

  if (ap.tipo === 'reasignacion') {
    // Cambiar de dueño es lo único que las reglas de reparto no dejan hacer
    // solo: pasa por acá justamente para que lo autorice quien ve la carga
    // completa del equipo, y no el interesado.
    const prospectoId = ap.prospecto_id || payload.prospecto_id
    if (!prospectoId) throw new AplicarError('La solicitud no dice de qué prospecto')
    if (!payload.hacia_id) throw new AplicarError('La solicitud no dice hacia quién')

    const { data: destino } = await client
      .from('profiles').select('id').eq('id', payload.hacia_id).maybeSingle()
    if (!destino) throw new AplicarError('La persona de destino ya no existe')

    const { error } = await client
      .from('prospectos').update({ responsable_id: payload.hacia_id }).eq('id', prospectoId)
    if (error) throw new AplicarError(error.message)

    // El hilo abierto sigue a su nuevo dueño: el emisor de la conversación
    // cambió, y dejarlo apuntando al anterior haría que la bitácora atribuyera
    // mal los mensajes que vengan.
    await client
      .from('crm_hilos')
      .update({ responsable_id: payload.hacia_id })
      .eq('prospecto_id', prospectoId)
      .is('cerrado_at', null)

    return { prospecto_id: prospectoId, responsable_id: payload.hacia_id }
  }

  if (ap.tipo === 'brief_cotizacion') {
    // Handoff (F5): al aprobar el brief, garantizamos que exista un cliente en
    // CH-7 y lo linkeamos al prospecto. NO se crea la cotización: se entrega el
    // brief + cliente_id para que el flujo de cotizaciones lo trabaje.
    const prospectoId = ap.prospecto_id || payload.prospecto_id
    if (!prospectoId) return { brief: payload, cliente_id: null }

    const { data: p } = await client
      .from('prospectos')
      .select('id, empresa, cliente_id')
      .eq('id', prospectoId)
      .maybeSingle()
    if (!p) throw new AplicarError('El prospecto del brief ya no existe')

    let clienteId: string | null = p.cliente_id ?? null
    if (!clienteId && p.empresa) {
      // Dedup: ¿ya existe un cliente con esa empresa/nombre?
      const { data: porEmpresa } = await client.from('clientes').select('id').ilike('empresa', p.empresa).limit(1).maybeSingle()
      const { data: porNombre } = porEmpresa ? { data: null } : await client.from('clientes').select('id').ilike('nombre', p.empresa).limit(1).maybeSingle()
      const existente = porEmpresa ?? porNombre
      if (existente) {
        clienteId = existente.id
      } else {
        const { data: nuevo, error } = await client
          .from('clientes')
          .insert({ nombre: p.empresa, empresa: p.empresa })
          .select('id')
          .single()
        if (error) throw new AplicarError(error.message)
        clienteId = nuevo.id
      }
      await client.from('prospectos').update({ cliente_id: clienteId }).eq('id', prospectoId)
    }

    return { prospecto_id: prospectoId, cliente_id: clienteId, brief: payload }
  }

  // correo_borrador: solo se marca aprobado en esta fase (Gmail draft = posterior).
  return null
}
