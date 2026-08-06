'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { reproducir, sfxEnabled, setSfxEnabled } from '@/lib/sfx'
import { momento } from '@/lib/momentos'
import type { Prospecto, EtapaProspecto } from '@/types'
import {
  ETAPA_PROSPECTO_LABELS,
  ETAPAS_PIPELINE_ACTIVAS,
  ETAPAS_CAJON,
  ORIGENES_PROSPECTO,
  SCORES_PROSPECTO,
} from '@/types'
import { moverEtapa } from '@/app/actions/crm'

import TarjetaProspecto, { Tag } from '@/components/crm/TarjetaProspecto'
import QuickContacto from '@/components/crm/QuickContacto'
import RepartirProspectos from '@/components/crm/RepartirProspectos'
import ProspectosDeHoy from '@/components/crm/ProspectosDeHoy'
import type { MetricasCrm } from '@/app/actions/crm'

interface Props {
  prospectos: Prospecto[]
  metricas: MetricasCrm
  pendientesIds: string[]
  totalBandeja: number
  usuarioId: string
}

type Vista = 'kanban' | 'tabla'

export default function PipelineCRM({ prospectos, metricas, pendientesIds, totalBandeja, usuarioId }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [vista, setVista] = useState<Vista>('kanban')
  const [cajonAbierto, setCajonAbierto] = useState(false)
  const pendientesSet = useMemo(() => new Set(pendientesIds), [pendientesIds])

  // filtros
  const [fResponsable, setFResponsable] = useState('')
  const [fOrigen, setFOrigen] = useState('')
  const [fScore, setFScore] = useState('')

  // drag & drop
  const [draggedId, setDraggedId] = useState<string | null>(null)
  // id de la tarjeta que acaba de cambiar de etapa, para que aterrice
  const [recienMovido, setRecienMovido] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<EtapaProspecto | null>(null)
  // confirmación inline al mover a 'confirmado'
  const [pendiente, setPendiente] = useState<{ id: string; etapa: EtapaProspecto } | null>(null)
  // registro rápido de contacto desde el pipeline
  const [contactoPara, setContactoPara] = useState<Prospecto | null>(null)
  // gamificación: preferencia de sonido
  const [sfxOn, setSfxOn] = useState(true)
  useEffect(() => { setSfxOn(sfxEnabled()) }, [])
  const toggleSfx = () => { const v = !sfxOn; setSfxEnabled(v); setSfxOn(v); if (v) reproducir('prog-avance') }

  const responsables = useMemo(() => {
    const set = new Map<string, string>()
    for (const p of prospectos) {
      if (p.responsable) set.set(p.responsable.id, p.responsable.nombre)
    }
    return Array.from(set.entries())
  }, [prospectos])

  const filtrados = useMemo(() => {
    return prospectos.filter(p => {
      if (fResponsable && p.responsable?.id !== fResponsable) return false
      if (fOrigen && p.origen !== fOrigen) return false
      if (fScore && p.score !== fScore) return false
      return true
    })
  }, [prospectos, fResponsable, fOrigen, fScore])

  const porEtapa = useMemo(() => {
    const map = new Map<EtapaProspecto, Prospecto[]>()
    for (const e of [...ETAPAS_PIPELINE_ACTIVAS, ...ETAPAS_CAJON]) map.set(e, [])
    for (const p of filtrados) {
      const arr = map.get(p.etapa)
      if (arr) arr.push(p)
    }
    return map
  }, [filtrados])

  const ejecutarMovimiento = (id: string, etapa: EtapaProspecto) => {
    startTransition(async () => {
      const res = await moverEtapa(id, etapa)
      if (res.error) momento('error', { mensaje: res.error })
      else {
        const mensaje = `Movido a ${ETAPA_PROSPECTO_LABELS[etapa]}`
        if (etapa === 'confirmado') momento('crm.cierre', { mensaje })
        else if (etapa === 'descartado') momento('crm.retroceso', { mensaje })
        else momento('crm.avance', { mensaje })
        setRecienMovido(id)
        window.setTimeout(() => setRecienMovido(null), 700)
        router.refresh()
      }
    })
  }

  const onDrop = (etapa: EtapaProspecto) => {
    setDragOver(null)
    const id = draggedId
    setDraggedId(null)
    if (!id) return
    const actual = prospectos.find(p => p.id === id)
    if (!actual || actual.etapa === etapa) return
    // Mover a 'confirmado' dispara handoff (F5) → pedir confirmación inline
    if (etapa === 'confirmado') {
      setPendiente({ id, etapa })
      return
    }
    ejecutarMovimiento(id, etapa)
  }

  // Prospectos sin dueño: se calculan sobre TODOS, no sobre los filtrados —
  // el reparto es un pendiente global, no depende de la vista actual.
  const huerfanos = useMemo(() => prospectos.filter(p => !p.responsable), [prospectos])

  const limpiarFiltros = () => { setFResponsable(''); setFOrigen(''); setFScore('') }
  const hayFiltros = fResponsable || fOrigen || fScore

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">Módulo CH-10</p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">CRM</h1>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={toggleSfx}
            title={sfxOn ? 'Silenciar sonidos' : 'Activar sonidos'}
            className={`border border-ch-border font-body text-[10px] tracking-[0.35em] uppercase px-4 py-3 transition-colors ${sfxOn ? 'text-ch-green hover:text-ch-green-light' : 'text-ch-muted hover:text-ch-cream'}`}
          >
            {sfxOn ? 'Sonido' : 'Silencio'}
          </button>
          <Link
            href="/crm/biblioteca"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors"
          >
            Biblioteca
          </Link>
          <Link
            href="/crm/aprobaciones"
            className="relative border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors"
          >
            Bandeja
            {totalBandeja > 0 && (
              <span className="absolute -top-2 -right-2 bg-ch-gold text-ch-black font-body text-[10px] font-medium w-5 h-5 flex items-center justify-center ch-badge-pop">
                {totalBandeja}
              </span>
            )}
          </Link>
          <Link
            href="/crm/nuevo"
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors"
          >
            + Nuevo
          </Link>
        </div>
      </div>

      <ProspectosDeHoy prospectos={prospectos} usuarioId={usuarioId} />

      <RepartirProspectos huerfanos={huerfanos} responsables={responsables} />

      {/* Banda de métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <MetricaCard
          label="En pipeline"
          valor={`${metricas.totalPipeline}`}
          sub="prospectos activos"
        />
        <MetricaCard
          label="Por contactar"
          valor={`${metricas.porContactar}`}
          sub="en etapa prospecto"
          acento={metricas.porContactar > 0 ? 'gold' : undefined}
        />
        <MetricaCard
          label="En conversación"
          valor={`${metricas.enConversacion}`}
          sub="con diálogo abierto"
        />
        <MetricaCard
          label="Confirmados"
          valor={`${metricas.totalGanados}`}
          sub="ganados"
          acento={metricas.totalGanados > 0 ? 'green' : undefined}
        />
      </div>

      {/* Toolbar: vista + filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex border border-ch-border">
          {(['kanban', 'tabla'] as Vista[]).map(v => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`font-body text-[10px] tracking-[0.3em] uppercase px-4 py-2 transition-colors ${
                vista === v ? 'bg-ch-surface text-ch-cream' : 'text-ch-muted hover:text-ch-cream'
              }`}
            >
              {v === 'kanban' ? 'Kanban' : 'Tabla'}
            </button>
          ))}
        </div>

        {vista === 'kanban' && (
          <button
            onClick={() => setCajonAbierto(!cajonAbierto)}
            className={`border font-body text-[10px] tracking-[0.3em] uppercase px-4 py-2 transition-colors ${cajonAbierto ? 'border-ch-muted text-ch-cream' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}
          >
            {cajonAbierto ? 'Ocultar cajón' : 'Nurture / Descartados'}
          </button>
        )}

        <div className="flex flex-wrap gap-2 ml-auto">
          <select value={fResponsable} onChange={e => setFResponsable(e.target.value)} className="input-ch text-xs py-2">
            <option value="">Responsable · todos</option>
            {responsables.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
          <select value={fOrigen} onChange={e => setFOrigen(e.target.value)} className="input-ch text-xs py-2">
            <option value="">Origen · todos</option>
            {ORIGENES_PROSPECTO.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
          </select>
          <select value={fScore} onChange={e => setFScore(e.target.value)} className="input-ch text-xs py-2">
            <option value="">Prioridad · todas</option>
            {SCORES_PROSPECTO.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
          {hayFiltros && (
            <button onClick={limpiarFiltros} className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream px-2 transition-colors">
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Confirmación inline */}
      {pendiente && (
        <div className="mb-6 border border-ch-gold bg-ch-gold/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-sm text-ch-cream">
            Mover <strong>{prospectos.find(p => p.id === pendiente.id)?.empresa}</strong> a <strong>Confirmado</strong>.
            En F5 esto generará un brief para cotización.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { ejecutarMovimiento(pendiente.id, pendiente.etapa); setPendiente(null) }}
              className="bg-ch-gold hover:bg-ch-gold-light text-ch-black font-body text-[10px] tracking-[0.3em] uppercase px-5 py-2 transition-colors"
            >
              Confirmar
            </button>
            <button
              onClick={() => setPendiente(null)}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.3em] uppercase px-5 py-2 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {vista === 'kanban' ? (
        <KanbanView
          porEtapa={porEtapa}
          dragOver={dragOver}
          setDragOver={setDragOver}
          onDragStartCard={setDraggedId}
          onDrop={onDrop}
          recienMovido={recienMovido}
          cajonAbierto={cajonAbierto}
          pendientesSet={pendientesSet}
          onAddContacto={setContactoPara}
        />
      ) : (
        <TablaView prospectos={filtrados} />
      )}

      {contactoPara && (
        <QuickContacto
          prospecto={contactoPara}
          onClose={() => setContactoPara(null)}
          onSaved={() => { setContactoPara(null); router.refresh() }}
        />
      )}
    </>
  )
}

function MetricaCard({ label, valor, sub, acento }: { label: string; valor: string; sub: string; acento?: 'green' | 'gold' }) {
  const color = acento === 'green' ? 'text-ch-green' : acento === 'gold' ? 'text-ch-gold' : 'text-ch-cream'
  return (
    <div className="border border-ch-border bg-ch-surface/30 p-4">
      <p className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-subtle mb-2">{label}</p>
      <p className={`font-display italic text-3xl leading-none ${color}`}>{valor}</p>
      <p className="font-body text-[11px] text-ch-muted mt-2">{sub}</p>
    </div>
  )
}

function KanbanView({
  porEtapa, dragOver, setDragOver, onDragStartCard, onDrop, cajonAbierto, pendientesSet, onAddContacto, recienMovido,
}: {
  porEtapa: Map<EtapaProspecto, Prospecto[]>
  dragOver: EtapaProspecto | null
  setDragOver: (e: EtapaProspecto | null) => void
  onDragStartCard: (id: string) => void
  onDrop: (e: EtapaProspecto) => void
  cajonAbierto: boolean
  pendientesSet: Set<string>
  onAddContacto: (p: Prospecto) => void
  recienMovido: string | null
}) {
  const columnas: EtapaProspecto[] = cajonAbierto
    ? [...ETAPAS_PIPELINE_ACTIVAS, ...ETAPAS_CAJON]
    : ETAPAS_PIPELINE_ACTIVAS

  return (
    // Una sola fila: llena el ancho cuando cabe (flex-1 + min-w-full), scrollea
    // horizontal cuando no caben (overflow-x-auto). Responsivo.
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-full">
        {columnas.map(etapa => {
          const cards = porEtapa.get(etapa) ?? []
          const esCajon = ETAPAS_CAJON.includes(etapa)
          const ancho = esCajon
            ? 'w-64 shrink-0'
            : etapa === 'confirmado' ? 'flex-[0.6] min-w-[150px]' : 'flex-1 min-w-[220px]'
          return (
            <div
              key={etapa}
              onDragOver={e => { e.preventDefault(); setDragOver(etapa) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => onDrop(etapa)}
              className={`${ancho} border bg-ch-black/20 ${dragOver === etapa ? 'border-ch-green' : 'border-ch-border'} transition-colors`}
            >
              <div className="px-3 py-3 border-b border-ch-border flex items-center justify-between">
                <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-muted">
                  {ETAPA_PROSPECTO_LABELS[etapa]}
                </span>
                <span className="font-body text-[10px] text-ch-subtle">{cards.length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-[120px]">
                {cards.map(p => (
                  <TarjetaProspecto
                    key={p.id}
                    prospecto={p}
                    draggable
                    onDragStart={() => onDragStartCard(p.id)}
                    pendiente={pendientesSet.has(p.id)}
                    onAddContacto={esCajon ? undefined : onAddContacto}
                    recienMovido={recienMovido === p.id}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TablaView({ prospectos }: { prospectos: Prospecto[] }) {
  if (prospectos.length === 0) {
    return (
      <div className="border border-ch-border p-10 text-center">
        <p className="font-body text-sm text-ch-muted">No hay prospectos que coincidan con los filtros.</p>
      </div>
    )
  }
  return (
    <div className="border border-ch-border overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-ch-border">
            {['Empresa', 'Contacto', 'Etapa', 'Producto', 'Prioridad', 'Responsable'].map(h => (
              <th key={h} className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle px-4 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {prospectos.map(p => (
            <tr key={p.id} className="border-b border-ch-border/50 hover:bg-ch-surface/30 transition-colors">
              <td className="px-4 py-3">
                <Link href={`/crm/${p.id}`} className="font-display italic text-base text-ch-cream hover:text-white transition-colors">
                  {p.empresa}
                </Link>
              </td>
              <td className="px-4 py-3 font-body text-xs text-ch-muted">{p.nombre_contacto ?? '—'}</td>
              <td className="px-4 py-3"><Tag className="border-ch-border text-ch-muted">{ETAPA_PROSPECTO_LABELS[p.etapa]}</Tag></td>
              <td className="px-4 py-3 font-body text-xs text-ch-muted capitalize">{p.producto_objetivo && p.producto_objetivo !== 'sin_definir' ? p.producto_objetivo : '—'}</td>
              <td className="px-4 py-3 font-body text-xs text-ch-muted capitalize">{p.score ?? '—'}</td>
              <td className="px-4 py-3 font-body text-xs text-ch-muted">{p.responsable?.nombre ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
