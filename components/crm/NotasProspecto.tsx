'use client'

import { useState, useTransition, useEffect } from 'react'
import type { CrmNota, CrmLectura } from '@/types'
import { TIPOS_NOTA, TIPO_NOTA_LABELS } from '@/types'
import { crearNota, actualizarNota, eliminarNota, bloquearNota } from '@/app/actions/crm'
import { useRouter } from 'next/navigation'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { formatFecha } from '@/lib/fechas'
import LecturaDossier from '@/components/crm/LecturaDossier'

interface Props {
  prospectoId: string
  notas: CrmNota[]
  /** La Lectura con dossier archivado. NO es una nota: se lee de crm_lecturas. */
  lectura?: CrmLectura | null
  personas: Record<string, string>
}

/**
 * Las notas del prospecto, sueltas y expandibles.
 *
 * Antes era un solo textarea de tres líneas para todo. La gente ya lo usaba
 * como si fueran varias notas —prefijos a mano, párrafos separados, una de
 * 2.137 caracteres— así que esto no inventa un flujo: le da forma al que ya
 * existía.
 *
 * La Lectura con dossier no vive acá: se muestra leyendo `crm_lecturas`, para
 * que no haya dos versiones del mismo documento. Por eso tampoco se puede
 * editar — no es una nota, es el dossier.
 */
export default function NotasProspecto({ prospectoId, notas, lectura, personas }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [creando, setCreando] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [borrar, setBorrar] = useState<string | null>(null)

  const refrescar = (msg: string) => {
    momento('guardado', { mensaje: msg })
    router.refresh()
  }

  const nota = notas.find(n => n.id === expandida) ?? null

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted">Notas</h2>
        <button
          onClick={() => setCreando(c => !c)}
          className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-green hover:text-ch-green-light transition-colors"
        >
          {creando ? 'Cancelar' : '+ Nota'}
        </button>
      </div>

      {creando && (
        <Editor
          ocupado={isPending}
          onGuardar={(tipo, titulo, cuerpo, bloqueada) =>
            startTransition(async () => {
              try {
                const res = await crearNota(prospectoId, { tipo, titulo, cuerpo, bloqueada })
                if (res.error) { toastError(res.error); return }
                setCreando(false)
                refrescar('Nota guardada')
              } catch (e) {
                toastError(e instanceof Error ? e.message : 'Error al guardar')
              }
            })}
        />
      )}

      <div className="space-y-3">
        {/* El dossier va primero: es el contexto con el que se leen las demás. */}
        {lectura && (
          <div className="border border-ch-border bg-ch-surface/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-gold">La Lectura</span>
              <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle border border-ch-border px-1.5 py-0.5">
                Solo lectura
              </span>
            </div>
            <LecturaDossier lectura={lectura} />
          </div>
        )}

        {notas.length === 0 && !lectura ? (
          <div className="border border-dashed border-ch-border p-5">
            <p className="font-display italic text-lg text-ch-cream mb-1">Sin notas</p>
            <p className="font-body text-xs text-ch-muted max-w-md leading-relaxed">
              Lo que sepas de esta marca y no esté en la bitácora: por qué encaja,
              qué les importa, qué no repetir. Cada cosa en su propia nota.
            </p>
          </div>
        ) : (
          notas.map(n => (
            <Tarjeta
              key={n.id}
              nota={n}
              autor={n.autor_id ? personas[n.autor_id] : null}
              ocupado={isPending}
              confirmandoBorrar={borrar === n.id}
              onExpandir={() => setExpandida(n.id)}
              onPedirBorrar={() => setBorrar(n.id)}
              onCancelarBorrar={() => setBorrar(null)}
              onBorrar={() =>
                startTransition(async () => {
                  try {
                    const res = await eliminarNota(n.id, prospectoId)
                    if (res.error) { toastError(res.error); return }
                    setBorrar(null)
                    momento('eliminado', { mensaje: 'Nota eliminada' })
                    router.refresh()
                  } catch (e) {
                    toastError(e instanceof Error ? e.message : 'Error al eliminar')
                  }
                })}
            />
          ))
        )}
      </div>

      {nota && (
        <Maximizada
          nota={nota}
          autor={nota.autor_id ? personas[nota.autor_id] : null}
          ocupado={isPending}
          onCerrar={() => setExpandida(null)}
          onGuardar={(titulo, cuerpo) =>
            startTransition(async () => {
              try {
                const res = await actualizarNota(nota.id, prospectoId, { titulo, cuerpo })
                if (res.error) { toastError(res.error); return }
                setExpandida(null)
                refrescar('Nota guardada')
              } catch (e) {
                toastError(e instanceof Error ? e.message : 'Error al guardar')
              }
            })}
          onBloquear={() =>
            startTransition(async () => {
              try {
                const res = await bloquearNota(nota.id, prospectoId)
                if (res.error) { toastError(res.error); return }
                setExpandida(null)
                refrescar('Nota bloqueada')
              } catch (e) {
                toastError(e instanceof Error ? e.message : 'Error al bloquear')
              }
            })}
        />
      )}
    </div>
  )
}

// ── Tarjeta en la lista ──────────────────────────────────────────────────────

function Tarjeta({
  nota, autor, ocupado, confirmandoBorrar, onExpandir, onPedirBorrar, onCancelarBorrar, onBorrar,
}: {
  nota: CrmNota
  autor: string | null
  ocupado: boolean
  confirmandoBorrar: boolean
  onExpandir: () => void
  onPedirBorrar: () => void
  onCancelarBorrar: () => void
  onBorrar: () => void
}) {
  // Se recorta a algo legible: lo largo se lee expandido, que es el punto.
  const LARGO = 320
  const recortada = nota.cuerpo.length > LARGO

  return (
    <div className="border border-ch-border bg-ch-surface/20 p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`font-body text-[9px] tracking-[0.25em] uppercase ${
          nota.tipo === 'lectura' ? 'text-ch-gold' : nota.tipo === 'acuerdo' ? 'text-ch-green' : 'text-ch-subtle'
        }`}>
          {nota.titulo || TIPO_NOTA_LABELS[nota.tipo] || 'Nota'}
        </span>
        {nota.bloqueada && (
          <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle border border-ch-border px-1.5 py-0.5">
            Bloqueada
          </span>
        )}
        <span className="font-body text-[10px] text-ch-subtle">{formatFecha(nota.created_at)}</span>
        {autor && <span className="font-body text-[10px] text-ch-subtle">· {autor}</span>}
        <span className="flex-1" />
        <button onClick={onExpandir} disabled={ocupado}
          className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-muted hover:text-ch-cream transition-colors disabled:opacity-50">
          Maximizar
        </button>
        {confirmandoBorrar ? (
          <span className="flex items-center gap-2">
            <button onClick={onBorrar} disabled={ocupado}
              className="font-body text-[9px] tracking-[0.2em] uppercase text-red-400 hover:text-red-300 disabled:opacity-50">
              {nota.bloqueada ? 'Borrar igual' : 'Eliminar'}
            </button>
            <button onClick={onCancelarBorrar}
              className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream">
              Cancelar
            </button>
          </span>
        ) : (
          <button onClick={onPedirBorrar} title="Eliminar nota"
            className="font-body text-xs text-ch-subtle hover:text-red-400 transition-colors leading-none">✕</button>
        )}
      </div>

      <p className="font-body text-sm text-ch-cream whitespace-pre-wrap leading-relaxed">
        {recortada ? nota.cuerpo.slice(0, LARGO).trimEnd() + '…' : nota.cuerpo}
      </p>
      {recortada && (
        <button onClick={onExpandir}
          className="mt-2 font-body text-[10px] tracking-[0.2em] uppercase text-ch-gold hover:text-ch-gold-light transition-colors">
          Leer completa
        </button>
      )}
    </div>
  )
}

// ── Vista maximizada ─────────────────────────────────────────────────────────

function Maximizada({
  nota, autor, ocupado, onCerrar, onGuardar, onBloquear,
}: {
  nota: CrmNota
  autor: string | null
  ocupado: boolean
  onCerrar: () => void
  onGuardar: (titulo: string, cuerpo: string) => void
  onBloquear: () => void
}) {
  const [titulo, setTitulo] = useState(nota.titulo ?? '')
  const [cuerpo, setCuerpo] = useState(nota.cuerpo)
  const [confirmarCandado, setConfirmarCandado] = useState(false)
  const sucia = titulo !== (nota.titulo ?? '') || cuerpo !== nota.cuerpo

  // Esc cierra. Si hay cambios sin guardar, avisa antes: perder una nota larga
  // por apretar Esc sería exactamente el problema que esto vino a resolver.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (sucia && !window.confirm('Tienes cambios sin guardar. ¿Cerrar igual?')) return
      onCerrar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sucia, onCerrar])

  return (
    <div className="fixed inset-0 z-50 bg-ch-black/90 flex items-stretch justify-center p-4 lg:p-10"
      onClick={e => { if (e.target === e.currentTarget && !sucia) onCerrar() }}>
      <div className="bg-ch-dark border border-ch-border w-full max-w-4xl flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-ch-border flex-wrap">
          {nota.bloqueada ? (
            <span className="font-display italic text-2xl text-ch-cream">{nota.titulo || 'Nota'}</span>
          ) : (
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Título de la nota"
              className="font-display italic text-2xl text-ch-cream bg-transparent border-0 outline-none flex-1 min-w-0 placeholder:text-ch-subtle"
            />
          )}
          {nota.bloqueada && (
            <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-gold border border-ch-gold/40 px-2 py-0.5">
              Bloqueada
            </span>
          )}
          <span className="flex-1" />
          <span className="font-body text-[10px] text-ch-subtle">
            {formatFecha(nota.created_at)}{autor ? ` · ${autor}` : ''}
          </span>
          <button onClick={() => { if (!sucia || window.confirm('Tienes cambios sin guardar. ¿Cerrar igual?')) onCerrar() }}
            className="font-body text-sm text-ch-muted hover:text-ch-cream transition-colors leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {nota.bloqueada ? (
            <p className="font-body text-sm text-ch-cream whitespace-pre-wrap leading-relaxed">{nota.cuerpo}</p>
          ) : (
            <textarea
              value={cuerpo}
              onChange={e => setCuerpo(e.target.value)}
              autoFocus
              className="w-full h-full min-h-[50vh] bg-transparent border-0 outline-none resize-none font-body text-sm text-ch-cream leading-relaxed"
            />
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-4 border-t border-ch-border flex-wrap">
          {nota.bloqueada ? (
            <p className="font-body text-xs text-ch-muted">
              Se guardó como registro. Para corregirla, bórrala y escribe otra —
              así queda rastro.
            </p>
          ) : (
            <>
              <button onClick={() => onGuardar(titulo, cuerpo)} disabled={ocupado || !cuerpo.trim() || !sucia}
                className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-2.5 transition-colors disabled:opacity-40">
                {ocupado ? 'Guardando…' : 'Guardar'}
              </button>
              <span className="flex-1" />
              {confirmarCandado ? (
                <span className="flex items-center gap-3">
                  <span className="font-body text-xs text-ch-muted">Después no se podrá editar.</span>
                  <button onClick={onBloquear} disabled={ocupado || sucia}
                    className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-gold hover:text-ch-gold-light disabled:opacity-40">
                    Bloquear
                  </button>
                  <button onClick={() => setConfirmarCandado(false)}
                    className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-subtle hover:text-ch-cream">
                    Cancelar
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmarCandado(true)} disabled={ocupado || sucia}
                  title={sucia ? 'Guarda los cambios antes de bloquear' : 'Congelar como registro'}
                  className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-subtle hover:text-ch-cream transition-colors disabled:opacity-40">
                  Bloquear
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Editor de nota nueva ─────────────────────────────────────────────────────

function Editor({
  ocupado, onGuardar,
}: {
  ocupado: boolean
  onGuardar: (tipo: string, titulo: string, cuerpo: string, bloqueada: boolean) => void
}) {
  const [tipo, setTipo] = useState('nota')
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [bloqueada, setBloqueada] = useState(false)

  return (
    <div className="border border-ch-border bg-ch-surface/30 p-4 mb-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <select value={tipo} onChange={e => setTipo(e.target.value)} className="input-ch w-full">
          {TIPOS_NOTA.map(t => <option key={t} value={t}>{TIPO_NOTA_LABELS[t]}</option>)}
        </select>
        <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (opcional)"
          className="input-ch w-full col-span-2" />
      </div>
      <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={5}
        placeholder="Escribe la nota…" className="input-ch w-full resize-none" />
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={() => onGuardar(tipo, titulo, cuerpo, bloqueada)} disabled={ocupado || !cuerpo.trim()}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-2.5 transition-colors disabled:opacity-40">
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
        <label className="flex items-center gap-2 cursor-pointer font-body text-xs text-ch-muted">
          <input type="checkbox" checked={bloqueada} onChange={e => setBloqueada(e.target.checked)} />
          Guardar como registro (no se podrá editar)
        </label>
      </div>
    </div>
  )
}
