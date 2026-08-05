'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Prospecto, CrmInteraccion, CrmLectura, EtapaProspecto, ChecklistItem } from '@/types'
import { ETAPA_PROSPECTO_LABELS, ETAPAS_PIPELINE_ACTIVAS, ETAPAS_CAJON, CHECKLIST_PROSPECTO, CHECKLIST_LABELS } from '@/types'
import { moverEtapa, eliminarProspecto, derivarBrief, toggleChecklist } from '@/app/actions/crm'
import { toastOk, toastError } from '@/lib/toast'
import Bitacora from '@/components/crm/Bitacora'
import { Tag } from '@/components/crm/TarjetaProspecto'

interface Props {
  prospecto: Prospecto
  interacciones: CrmInteraccion[]
  lecturas: CrmLectura[]
}

export default function FichaProspecto({ prospecto, interacciones, lecturas }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const p = prospecto

  const cambiarEtapa = (etapa: EtapaProspecto) => {
    if (etapa === p.etapa) return
    startTransition(async () => {
      const res = await moverEtapa(p.id, etapa)
      if (res.error) { toastError(res.error); return }
      toastOk(`Movido a ${ETAPA_PROSPECTO_LABELS[etapa]}`)
      router.refresh()
    })
  }

  const marcados = new Set((p.checklist ?? []) as ChecklistItem[])

  const toggle = (item: ChecklistItem) => {
    startTransition(async () => {
      const res = await toggleChecklist(p.id, item)
      if (res.error) { toastError(res.error); return }
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

      {/* Datos rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 mb-8 pb-8 border-b border-ch-border">
        <Dato label="Responsable" valor={p.responsable?.nombre} />
        <Dato label="Score" valor={p.score} capitalize />
        <Dato label="Producto objetivo" valor={p.producto_objetivo} capitalize />
        <Dato label="Arquetipo" valor={p.arquetipo?.replace('_', ' ')} capitalize />
        <Dato label="Contacto" valor={p.nombre_contacto} />
        <Dato label="Email" valor={p.email} />
        <Dato label="Teléfono" valor={p.telefono} />
        <Dato label="Origen" valor={p.origen} capitalize />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-8">
          {/* Lectura estratégica */}
          <div className="border border-ch-border bg-ch-surface/30 p-5">
            <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-4">Lectura estratégica</h2>
            <div className="space-y-3">
              <Dato label="Ángulo de acercamiento" valor={p.angulo} />
              <Dato label="Decisor" valor={p.decisor} />
              {lectura ? (
                <div>
                  <p className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.3em] mb-1">La Lectura</p>
                  {lectura.url ? (
                    <a href={lectura.url} target="_blank" rel="noopener noreferrer"
                      className="font-body text-sm text-ch-green hover:text-ch-green-light transition-colors break-all">
                      {lectura.dossier_ref || lectura.url}
                    </a>
                  ) : (
                    <p className="font-body text-sm text-ch-cream">{lectura.dossier_ref || '—'}</p>
                  )}
                </div>
              ) : (
                <p className="font-body text-xs text-ch-subtle">Sin Lectura vinculada todavía.</p>
              )}
            </div>
          </div>

          {/* Notas */}
          {p.notas && (
            <div>
              <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-3">Notas</h2>
              <p className="font-body text-sm text-ch-cream whitespace-pre-wrap">{p.notas}</p>
            </div>
          )}

          {/* Bitácora */}
          <Bitacora prospectoId={p.id} interacciones={interacciones} />
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

          <div className="border border-ch-border bg-ch-surface/30 p-5">
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
