// lib/agent-crono.ts — lo que comparten los endpoints /api/agent/crono* :
// cargar un crono con sus hitos desde el admin client y serializarlo con la
// forma que lee el agente (etapas como {desde, hasta}, hitos ordenados, url).

import type { SupabaseClient } from '@supabase/supabase-js'
import { avisosCrono, evaluarCompuertas, hitosOrdenados, hoyIso, lecturaEtapas, mapaFeriados, proximoHitoClave, rangoCrono, rangosEtapas } from '@/lib/crono'
import type { Crono, CronoCompuerta, CronoHito, Feriado } from '@/types'

const APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com').replace(/\/$/, '')

export function urlCrono(id: string): string {
  return `${APP}/cronos/${id}`
}

export const SELECT_CRONO_AGENTE = `*, proyecto:proyectos(id, nombre, cliente:clientes(id, nombre, empresa)), hitos:crono_hitos(*), compuertas:crono_compuertas(*)`

export async function cargarCrono(admin: SupabaseClient, id: string): Promise<Crono | null> {
  const { data, error } = await admin.from('cronos').select(SELECT_CRONO_AGENTE).eq('id', id).single()
  if (error || !data) return null
  const c = data as unknown as Crono
  return { ...c, hitos: hitosOrdenados((c.hitos ?? []) as CronoHito[]), compuertas: ((c.compuertas ?? []) as CronoCompuerta[]).slice().sort((a, b) => a.orden - b.orden) }
}

export async function cargarFeriados(admin: SupabaseClient): Promise<Feriado[]> {
  const { data } = await admin.from('feriados').select('fecha, nombre').order('fecha')
  return (data ?? []) as Feriado[]
}

export function serializarHito(h: CronoHito) {
  return {
    id: h.id,
    tipo: h.tipo,
    titulo: h.titulo,
    fecha: h.fecha,
    fecha_fin: h.fecha_fin,
    etapa: h.etapa,
    monto: h.monto,
    notas: h.notas,
    responsable: h.responsable ?? null,
    destacado: !!h.destacado,
    hecho: h.hecho,
    rodaje_id: h.rodaje_id,
  }
}

export function serializarCrono(c: Crono, feriados: Feriado[] = []) {
  const etapas = rangosEtapas(c)
  const hitos = (c.hitos ?? []) as CronoHito[]
  const rango = rangoCrono(etapas, hitos)
  const prox = proximoHitoClave(hitos, hoyIso())
  const fer = mapaFeriados(feriados)
  const lectura = lecturaEtapas(etapas, fer, rango?.hasta).map(({ id, nombre, corridos, habiles, peso }) => ({ etapa: id, nombre, dias: corridos, habiles, peso: Math.round(peso * 100) }))
  const compuertas = evaluarCompuertas((c.compuertas ?? []) as CronoCompuerta[], hitos).map((g) => ({
    destino: g.destino,
    nombre: g.nombre,
    lista: g.lista,
    faltan: g.faltan,
    checks: g.checks.map((x) => ({ id: x.id, texto: x.texto, ok: x.ok, automatica: x.automatica, hito_id: x.hito_id, responsable: x.responsable })),
  }))
  const avisos = avisosCrono(etapas, hitos, fer)
  return {
    id: c.id,
    nombre: c.nombre,
    estado: c.estado,
    proyecto_id: c.proyecto_id,
    proyecto: c.proyecto ? { id: c.proyecto.id, nombre: c.proyecto.nombre, cliente: c.proyecto.cliente?.nombre ?? null } : null,
    cliente: c.cliente,
    responsable: c.responsable,
    notas: c.notas,
    etapas,
    rango,
    proximo_hito_clave: prox ? serializarHito(prox) : null,
    lectura,
    avisos,
    compuertas,
    hitos: hitos.map(serializarHito),
    updated_at: c.updated_at,
    url: urlCrono(c.id),
  }
}
