// lib/agent-crm.ts
// Helpers compartidos por los endpoints /api/agent/crm/*.
// La capa agente usa createAdminClient() (sin sesión), por eso replica aquí la
// normalización que la UI hace en app/actions/crm.ts.

import { ETAPA_PROSPECTO_LABELS, type EtapaProspecto } from '@/types'

/** string vacío / undefined / null → null; resto trim(). */
export function strA(v: unknown): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function esEtapaValida(e: unknown): e is EtapaProspecto {
  return typeof e === 'string' && e in ETAPA_PROSPECTO_LABELS
}

/** Fecha de hoy en Chile, formato YYYY-MM-DD (sin correrse por UTC). */
export function hoyChile(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

export const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Normaliza el cuerpo de un prospecto (crear/proponer) a columnas de la tabla. */
export function normalizarProspectoBody(body: any) {
  return {
    empresa: typeof body?.empresa === 'string' ? body.empresa.trim() : '',
    nombre_contacto: strA(body?.nombre_contacto),
    email: strA(body?.email),
    telefono: strA(body?.telefono),
    origen: strA(body?.origen),
    arquetipo: strA(body?.arquetipo),
    responsable_id: strA(body?.responsable_id),
    score: strA(body?.score),
    decisor: strA(body?.decisor),
    angulo: strA(body?.angulo),
    producto_objetivo: strA(body?.producto_objetivo),
  }
}

// Marca de auditoría del digest matinal. Vive acá y no en app/actions/crm.ts
// porque ese archivo es 'use server': ahí TODO export debe ser una función
// async, y una constante invalida el módulo entero (el build de Next falla con
// "the module has no exports at all", aunque tsc pase).
export const HERRAMIENTA_DIGEST = 'crm-digest-matinal'
