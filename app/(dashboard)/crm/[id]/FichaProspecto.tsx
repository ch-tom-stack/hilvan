'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Prospecto, CrmInteraccion, CrmHilo, CrmNota, CrmContacto, CrmBorrador, CrmLectura, CrmInsight, EtapaProspecto, ChecklistItem } from '@/types'
import { ETAPA_PROSPECTO_LABELS, ETAPAS_PIPELINE_ACTIVAS, ETAPAS_CAJON, CHECKLIST_PROSPECTO, CHECKLIST_LABELS, SCORES_PROSPECTO, TAMANOS_EMPRESA, TAMANO_LABELS, RUBROS_PROSPECTO, RUBRO_LABELS, TIPOS_CLIENTE, TIPO_CLIENTE_LABELS } from '@/types'
import { moverEtapa, eliminarProspecto, derivarBrief, toggleChecklist, asignarResponsable, asignarPrioridad, clasificarProspecto, solicitarAsignacion, marcarDatosDudosos, resolverDatosDudosos } from '@/app/actions/crm'
import { toastOk, toastError } from '@/lib/toast'
import Bitacora from '@/components/crm/Bitacora'
import NotasProspecto from '@/components/crm/NotasProspecto'
import ContactosProspecto from '@/components/crm/ContactosProspecto'
import BorradorRespuesta from '@/components/crm/BorradorRespuesta'
import ComoAbordarlo from '@/components/crm/ComoAbordarlo'
import { Tag } from '@/components/crm/TarjetaProspecto'
import { momento } from '@/lib/momentos'
import { useCambiado } from '@/components/ui/useCambiado'

interface Props {
  prospecto: Prospecto
  interacciones: CrmInteraccion[]
  hilos: CrmHilo[]
  notasProspecto: CrmNota[]
  contactos: CrmContacto[]
  borradores: CrmBorrador[]
  lecturas: CrmLectura[]
  insights: CrmInsight[]
  responsables: { id: string; nombre: string }[]
}

export default function FichaProspecto({ prospecto, interacciones, hilos, notasProspecto, contactos, borradores, lecturas, insights, responsables }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const p = prospecto

  const cambiarResponsable = (responsableId: string) => {
    startTransition(async () => {
      const res = await asignarResponsable(p.id, responsableId || null)
      if (res.error) { toastError(res.error); momento('error', { mensaje: res.error }); return }
      resp.marcar()
      momento('guardado', { mensaje: 'Responsable actualizado' })
      router.refresh()
    })
  }

  const pedirProspecto = () => {
    const motivo = window.prompt('¿Por qué lo quieres llevar tú? (opcional)') ?? undefined
    startTransition(async () => {
      try {
        const res = await solicitarAsignacion(p.id, { motivo })
        if (res.error) { toastError(res.error); return }
        momento('guardado', { mensaje: 'Solicitud enviada a la Bandeja' })
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al pedir el prospecto')
      }
    })
  }

  const marcarDuda = () => {
    const duda = window.prompt('¿Qué está mal en esta ficha? (ej: el contacto es de otra empresa)')
    if (!duda?.trim()) return
    startTransition(async () => {
      try {
        const res = await marcarDatosDudosos(p.id, duda)
        if (res.error) { toastError(res.error); return }
        momento('guardado', { mensaje: 'Marcado para verificar' })
        router.refresh()
      } catch (e) { toastError(e instanceof Error ? e.message : 'Error') }
    })
  }

  const resolverDuda = () => {
    const q = window.prompt('¿Qué verificaste? Queda registrado.')
    if (!q?.trim()) return
    startTransition(async () => {
      try {
        const res = await resolverDatosDudosos(p.id, q)
        if (res.error) { toastError(res.error); return }
        momento('guardado', { mensaje: 'Ficha verificada' })
        router.refresh()
      } catch (e) { toastError(e instanceof Error ? e.message : 'Error') }
    })
  }

  const clasificar = (tamano: string, rubro: string, tipoCliente: string) => {
    startTransition(async () => {
      const res = await clasificarProspecto(p.id, {
        tamano: tamano || null, rubro: rubro || null, tipo_cliente: tipoCliente || null,
      })
      if (res.error) { toastError(res.error); momento('error', { mensaje: res.error }); return }
      // Ambos, porque la clasificación es un solo dato en dos campos: marcar
      // sólo el que tocaste dejaría al otro sin acusar que también cambió.
      tam.marcar(); seg.marcar()
      momento('guardado', { mensaje: 'Clasificación guardada' })
      router.refresh()
    })
  }

  const cambiarPrioridad = (valor: string) => {
    startTransition(async () => {
      const res = await asignarPrioridad(p.id, valor)
      if (res.error) { toastError(res.error); momento('error', { mensaje: res.error }); return }
      prio.marcar()
      momento('guardado', { mensaje: 'Prioridad actualizada' })
      router.refresh()
    })
  }

  const cambiarEtapa = (etapa: EtapaProspecto) => {
    if (etapa === p.etapa) return
    startTransition(async () => {
      const res = await moverEtapa(p.id, etapa)
      if (res.error) { momento('error', { mensaje: res.error }); return }
      const mensaje = `Movido a ${ETAPA_PROSPECTO_LABELS[etapa]}`
      if (etapa === 'confirmado') momento('crm.cierre', { mensaje })
      else if (etapa === 'descartado') momento('crm.retroceso', { mensaje })
      else momento('crm.avance', { mensaje })
      router.refresh()
    })
  }

  const marcados = new Set((p.checklist ?? []) as ChecklistItem[])

  const { ref: refChecklist, marcar: marcarChecklist } = useCambiado<HTMLDivElement>()
  const resp = useCambiado<HTMLDivElement>()
  const prio = useCambiado<HTMLDivElement>()
  const tam  = useCambiado<HTMLDivElement>()
  const seg  = useCambiado<HTMLDivElement>()

  const toggle = (item: ChecklistItem) => {
    marcarChecklist()
    startTransition(async () => {
      const marcando = !marcados.has(item)
      const res = await toggleChecklist(p.id, item)
      if (res.error) { momento('error', { mensaje: res.error }); return }
      momento(marcando ? 'checklist.marcado' : 'checklist.desmarcado')
      router.refresh()
    })
  }

  const derivar = () => {
    startTransition(async () => {
      const res = await derivarBrief(p.id)
      if (res.error) { toastError(res.error); return }
      toastOk('Brief enviado a la Bandeja')
      router.refresh()
    })
  }

  const borrar = () => {
    startTransition(async () => {
      const res = await eliminarProspecto(p.id)
      if (res.error) { toastError(res.error); return }
      toastOk('Prospecto eliminado')
      router.push('/crm')
      router.refresh()
    })
  }

  const lectura = lecturas[0]

  return (
    <div className="p-6 lg:p-10 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <Link href="/crm" className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors mb-2 inline-block">
            ← CRM
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">{p.empresa}</h1>
            <Tag className="border-ch-gold text-ch-gold">{ETAPA_PROSPECTO_LABELS[p.etapa]}</Tag>
          </div>
        </div>
        <Link
          href={`/crm/${p.id}/editar`}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors flex-shrink-0"
        >
          Editar
        </Link>
      </div>

      {/* Antes que nada: si la ficha no es de fiar, todo lo que sigue hay que
          leerlo sabiéndolo — y sobre todo, no hay que escribirle. */}
      {p.datos_dudosos && (
        <div className="border border-red-400/40 bg-red-400/5 px-4 py-3 mb-8 flex items-start gap-3">
          <span className="w-2 h-2 bg-red-400 shrink-0 mt-1.5" aria-hidden />
          <div className="flex-1">
            <p className="font-body text-xs text-red-400 leading-relaxed">
              Datos por verificar — está fuera de la agenda y no se le escribe hasta resolverlo.
            </p>
            {p.duda && <p className="font-body text-xs text-ch-muted mt-1 leading-relaxed">{p.duda}</p>}
          </div>
          <button onClick={resolverDuda} disabled={isPending}
            className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-muted hover:text-ch-cream transition-colors disabled:opacity-50 shrink-0">
            Ya lo verifiqué
          </button>
        </div>
      )}

      {/* Datos rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 mb-8 pb-8 border-b border-ch-border">
        <div ref={resp.ref}>
          <p className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.3em] mb-1">Responsable</p>
          <select
            value={p.responsable?.id ?? ''}
            onChange={e => cambiarResponsable(e.target.value)}
            disabled={isPending}
            className="input-ch w-full text-sm py-1"
          >
            <option value="">Sin asignar</option>
            {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          {/* Cambiar el selector reasigna de inmediato; pedirlo abre una
              propuesta en la Bandeja. Las dos vías conviven porque no son la
              misma decisión: repartir es de quien ve la carga del equipo,
              pedir es de quien quiere el prospecto. */}
          <button
            type="button"
            onClick={pedirProspecto}
            disabled={isPending}
            className="mt-1.5 font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-green transition-colors disabled:opacity-50"
          >
            Pedir este prospecto
          </button>
          {!p.datos_dudosos && (
            <button
              type="button"
              onClick={marcarDuda}
              disabled={isPending}
              className="mt-1 block font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Datos erróneos
            </button>
          )}
        </div>
        <div ref={prio.ref}>
          <p className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.3em] mb-1">Prioridad</p>
          <select
            value={p.score ?? ''}
            onChange={e => cambiarPrioridad(e.target.value)}
            disabled={isPending}
            className="input-ch w-full text-sm py-1 capitalize"
          >
            <option value="">Sin definir</option>
            {SCORES_PROSPECTO.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
        </div>
        <div ref={tam.ref}>
          <p className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.3em] mb-1">Tamaño</p>
          <select
            value={p.tamano ?? ''}
            onChange={e => clasificar(e.target.value, p.rubro ?? '', p.tipo_cliente ?? '')}
            disabled={isPending}
            className="input-ch w-full text-sm py-1"
          >
            <option value="">Sin definir</option>
            {TAMANOS_EMPRESA.map(t => <option key={t} value={t}>{TAMANO_LABELS[t]}</option>)}
          </select>
        </div>
        {/* Dos preguntas distintas: de qué es la marca y con quién se trabaja.
            Antes era un solo eje que las mezclaba —y clasificaba el trabajo por
            el género de quien aparece o compra—. */}
        <div ref={seg.ref}>
          <p className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.3em] mb-1">Rubro</p>
          <select
            value={p.rubro ?? ''}
            onChange={e => clasificar(p.tamano ?? '', e.target.value, p.tipo_cliente ?? '')}
            disabled={isPending}
            className="input-ch w-full text-sm py-1"
          >
            <option value="">Sin clasificar</option>
            {RUBROS_PROSPECTO.map(r => <option key={r} value={r}>{RUBRO_LABELS[r]}</option>)}
          </select>
        </div>
        <div>
          <p className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.3em] mb-1">Tipo de cliente</p>
          <select
            value={p.tipo_cliente ?? ''}
            onChange={e => clasificar(p.tamano ?? '', p.rubro ?? '', e.target.value)}
            disabled={isPending}
            className="input-ch w-full text-sm py-1"
          >
            <option value="">Sin definir</option>
            {TIPOS_CLIENTE.map(c => <option key={c} value={c}>{TIPO_CLIENTE_LABELS[c]}</option>)}
          </select>
        </div>
        <Dato label="Producto objetivo" valor={p.producto_objetivo} capitalize />
        <Dato label="Arquetipo" valor={p.arquetipo?.replace('_', ' ')} capitalize />
        <Dato label="Origen" valor={p.origen} capitalize />
      </div>

      {/* Cómo llegó. Responde las tres preguntas que el equipo no podía
          contestar: qué hizo, dónde y de dónde venía. Sólo aparece si el dato
          existe — los prospectos anteriores a ago-2026 no lo tienen porque el
          sitio nunca lo mandó, y un bloque vacío sería peor que ninguno. */}
      {(p.lead_accion || p.lead_pagina || p.lead_campana) && (
        <div className="border border-ch-border bg-ch-surface/20 px-4 py-3 mb-8 flex flex-wrap gap-x-8 gap-y-2">
          <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-subtle self-center">Cómo llegó</span>
          {p.lead_accion && (
            <span className="font-body text-xs text-ch-cream">
              <span className="text-ch-subtle">Hizo: </span>{p.lead_accion.replace(/_/g, ' ')}
            </span>
          )}
          {p.lead_campana && (
            <span className="font-body text-xs text-ch-cream">
              <span className="text-ch-subtle">Venía de: </span>{p.lead_campana}
            </span>
          )}
          {p.lead_pagina && (
            <a href={p.lead_pagina} target="_blank" rel="noopener noreferrer"
              className="font-body text-xs text-ch-gold hover:text-ch-gold-light transition-colors truncate max-w-xs">
              {p.lead_pagina.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-8">
          {/* Lectura estratégica */}
          <div className="border border-ch-border bg-ch-surface/30 p-5">
            <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-4">Lectura estratégica</h2>
            {/* El dossier de La Lectura NO se muestra acá: vive entre las
                notas, que es donde se pidió. Repetirlo en dos paneles de la
                misma ficha obliga a comparar cuál está más al día. */}
            <div className="space-y-3">
              <Dato label="Ángulo de acercamiento" valor={p.angulo} />
              <Dato label="Decisor" valor={p.decisor} />
              {!lectura && (
                <p className="font-body text-xs text-ch-subtle">Sin Lectura vinculada todavía.</p>
              )}
            </div>
          </div>

          {/* Árbol de contactos */}
          <ContactosProspecto prospectoId={p.id} contactos={contactos} />

          {/* Casilla de borrador de respuesta */}
          <BorradorRespuesta prospectoId={p.id} borradores={borradores} />

          {/* Notas sueltas, con vista maximizada. La Lectura con dossier se
              muestra acá pero se lee de crm_lecturas: no es una nota. */}
          <NotasProspecto
            prospectoId={p.id}
            notas={notasProspecto}
            lectura={lectura}
            personas={Object.fromEntries(responsables.map(r => [r.id, r.nombre]))}
          />

          {/* Bitácora */}
          <Bitacora prospectoId={p.id} interacciones={interacciones} hilos={hilos} contactos={contactos}
            personas={Object.fromEntries(responsables.map(r => [r.id, r.nombre]))} />

          {/* Cómo abordarlo, al final y no arriba: hoy propone el próximo
              correo a partir de reglas que no están sirviendo, así que
              encabezar la ficha con eso le daba a una sugerencia floja el lugar
              de lo que sí es cierto —la conversación y lo que se sabe—.
              PENDIENTE: revisar cómo funciona (docs/crm/pendientes.md). */}
          <ComoAbordarlo insights={insights} interacciones={interacciones} origen={p.origen} />
        </div>

        {/* Columna lateral: acciones */}
        <div className="space-y-6">
          <div className="border border-ch-border bg-ch-surface/30 p-5">
            <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-3">Mover etapa</h2>
            <select
              value={p.etapa}
              onChange={e => cambiarEtapa(e.target.value as EtapaProspecto)}
              disabled={isPending}
              className="input-ch w-full"
            >
              {[...ETAPAS_PIPELINE_ACTIVAS, ...ETAPAS_CAJON].map(e => (
                <option key={e} value={e}>{ETAPA_PROSPECTO_LABELS[e]}</option>
              ))}
            </select>
          </div>

          {/* El panel entero acusa el cambio: marcar un hito modifica el
              estado del prospecto, y el borde confirma cuál cambió. */}
          <div ref={refChecklist} className="border border-ch-border bg-ch-surface/30 p-5">
            <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-3">Checklist</h2>
            <div className="space-y-2">
              {CHECKLIST_PROSPECTO.map(item => {
                const on = marcados.has(item)
                return (
                  <button
                    key={item}
                    onClick={() => toggle(item)}
                    disabled={isPending}
                    className={`w-full flex items-center gap-3 px-3 py-2 border transition-colors disabled:opacity-50 ${
                      on ? 'border-ch-green bg-ch-green/10 text-ch-green' : 'border-ch-border text-ch-muted hover:text-ch-cream'
                    }`}
                  >
                    <span className={`w-4 h-4 shrink-0 border flex items-center justify-center text-[10px] ${on ? 'border-ch-green' : 'border-ch-border'}`}>
                      {on ? '✓' : ''}
                    </span>
                    <span className="font-body text-xs">{CHECKLIST_LABELS[item]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border border-ch-border bg-ch-surface/30 p-5">
            <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-3">Handoff</h2>
            <button
              onClick={derivar}
              disabled={isPending}
              className="w-full bg-ch-gold hover:bg-ch-gold-light text-ch-black font-body font-medium text-[10px] tracking-[0.3em] uppercase px-4 py-3 transition-colors disabled:opacity-50"
            >
              Derivar brief a cotización
            </button>
            <p className="font-body text-[10px] text-ch-subtle mt-2">
              Genera el brief y lo deja en la Bandeja. Al aprobarlo se crea/linkea el cliente y se entrega al flujo de cotizaciones.
            </p>
          </div>

          {/* Eliminar (solo admin lo logrará; el server valida) */}
          <div className="pt-2">
            {confirmarBorrar ? (
              <div className="border border-red-900/50 bg-red-950/20 p-4">
                <p className="font-body text-xs text-ch-cream mb-3">¿Eliminar este prospecto y su bitácora?</p>
                <div className="flex gap-2">
                  <button onClick={borrar} disabled={isPending}
                    className="bg-red-900/60 hover:bg-red-900 text-ch-cream font-body text-[10px] tracking-[0.3em] uppercase px-4 py-2 transition-colors disabled:opacity-50">
                    {isPending ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                  <button onClick={() => setConfirmarBorrar(false)}
                    className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.3em] uppercase px-4 py-2 transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmarBorrar(true)}
                className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-subtle hover:text-red-400 transition-colors">
                Eliminar prospecto
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Dato({ label, valor, capitalize }: { label: string; valor?: string | null; capitalize?: boolean }) {
  return (
    <div>
      <p className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.3em] mb-1">{label}</p>
      <p className={`font-body text-sm text-ch-cream ${capitalize ? 'capitalize' : ''}`}>{valor || '—'}</p>
    </div>
  )
}
