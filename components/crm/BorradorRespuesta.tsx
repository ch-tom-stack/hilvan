'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CrmBorrador } from '@/types'
import { guardarBorrador, eliminarBorrador, type BorradorInput } from '@/app/actions/crm'
import { toastOk, toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'

interface Props {
  prospectoId: string
  borradores: CrmBorrador[]
}

type FormState = { id?: string; asunto: string; cuerpo: string; linksText: string; adjuntosText: string; estado: string }

const VACIO: FormState = { asunto: '', cuerpo: '', linksText: '', adjuntosText: '', estado: 'borrador' }
const ESTADO_STYLE: Record<string, string> = {
  borrador: 'border-ch-border text-ch-subtle',
  listo:    'border-ch-green text-ch-green',
  enviado:  'border-ch-gold text-ch-gold',
}

function aForm(b: CrmBorrador): FormState {
  return {
    id: b.id,
    asunto: b.asunto ?? '',
    cuerpo: b.cuerpo ?? '',
    linksText: (b.links ?? []).join('\n'),
    adjuntosText: (b.adjuntos ?? []).join('\n'),
    estado: b.estado ?? 'borrador',
  }
}

export default function BorradorRespuesta({ prospectoId, borradores }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState<boolean>(false)
  const [borrar, setBorrar] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(VACIO)

  const set = (patch: Partial<FormState>) => setForm(p => ({ ...p, ...patch }))
  const abrirNuevo = () => { setForm(VACIO); setAbierto(true) }
  const abrirEditar = (b: CrmBorrador) => { setForm(aForm(b)); setAbierto(true) }
  const cerrar = () => { setAbierto(false); setForm(VACIO) }

  const guardar = () => {
    if (!form.asunto.trim() && !form.cuerpo.trim()) {
      toastError('El borrador necesita al menos asunto o cuerpo')
      return
    }
    const input: BorradorInput = {
      id: form.id,
      asunto: form.asunto,
      cuerpo: form.cuerpo,
      links: form.linksText.split(/[\n]/).map(s => s.trim()).filter(Boolean),
      adjuntos: form.adjuntosText.split(/[\n]/).map(s => s.trim()).filter(Boolean),
      estado: form.estado,
    }
    startTransition(async () => {
      try {
        const res = await guardarBorrador(prospectoId, input)
        if (res.error) { toastError(res.error); return }
        momento('guardado', { mensaje: 'Borrador guardado' })
        cerrar()
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al guardar')
      }
    })
  }

  const eliminar = (id: string) => {
    startTransition(async () => {
      try {
        const res = await eliminarBorrador(id, prospectoId)
        if (res.error) { toastError(res.error); return }
        toastOk('Borrador eliminado')
        setBorrar(null)
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al eliminar')
      }
    })
  }

  return (
    <div className="border border-ch-border bg-ch-surface/30 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted">Borrador de respuesta</h2>
        {!abierto && (
          <button onClick={abrirNuevo}
            className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-green hover:text-ch-green-light transition-colors">
            + Nuevo
          </button>
        )}
      </div>

      {abierto && (
        <div className="border border-ch-border bg-ch-black/20 p-4 mb-4 space-y-3">
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Asunto</label>
            <input value={form.asunto} onChange={e => set({ asunto: e.target.value })} className="input-ch w-full"
              placeholder="Asunto del correo" />
          </div>
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Cuerpo</label>
            <textarea value={form.cuerpo} onChange={e => set({ cuerpo: e.target.value })} rows={7} className="input-ch w-full resize-none"
              placeholder="Redacta la respuesta (el operador IA puede rellenar esto)" />
          </div>
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Links de material (uno por línea)</label>
            <textarea value={form.linksText} onChange={e => set({ linksText: e.target.value })} rows={2} className="input-ch w-full resize-none"
              placeholder="Links a reel, portafolio, casos…" />
          </div>
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Paquetes / PDF (uno por línea)</label>
            <textarea value={form.adjuntosText} onChange={e => set({ adjuntosText: e.target.value })} rows={2} className="input-ch w-full resize-none"
              placeholder="Links a paquetes en PDF" />
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Estado</label>
              <select value={form.estado} onChange={e => set({ estado: e.target.value })} className="input-ch capitalize">
                <option value="borrador">Borrador</option>
                <option value="listo">Listo para enviar</option>
                <option value="enviado">Enviado</option>
              </select>
            </div>
            <button onClick={guardar} disabled={isPending}
              className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-2.5 transition-colors disabled:opacity-50">
              {isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={cerrar}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {borradores.length === 0 && !abierto ? (
        <p className="font-body text-sm text-ch-subtle">Sin borradores. El operador IA o tú pueden rellenar uno.</p>
      ) : (
        <div className="space-y-3">
          {borradores.map(b => (
            <div key={b.id} className="border-l border-ch-border pl-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-body text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 border ${ESTADO_STYLE[b.estado ?? 'borrador'] ?? ESTADO_STYLE.borrador}`}>
                      {b.estado ?? 'borrador'}
                    </span>
                    {b.autor === 'ia' && <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle">IA</span>}
                  </div>
                  {b.asunto && <p className="font-body text-sm text-ch-cream">{b.asunto}</p>}
                  {b.cuerpo && <p className="font-body text-xs text-ch-muted whitespace-pre-wrap mt-1 line-clamp-4">{b.cuerpo}</p>}
                  {(b.links ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(b.links ?? []).map((l, i) => (
                        <a key={i} href={l} target="_blank" rel="noopener noreferrer"
                          className="font-body text-[11px] text-ch-green hover:text-ch-green-light break-all">{l}</a>
                      ))}
                    </div>
                  )}
                  {(b.adjuntos ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(b.adjuntos ?? []).map((l, i) => (
                        <a key={i} href={l} target="_blank" rel="noopener noreferrer"
                          className="font-body text-[11px] text-ch-gold hover:text-ch-gold-light break-all">📎 {l}</a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {borrar === b.id ? (
                    <div className="flex gap-2">
                      <button onClick={() => eliminar(b.id)} disabled={isPending}
                        className="font-body text-[9px] tracking-[0.2em] uppercase text-red-400 hover:text-red-300 disabled:opacity-50">Eliminar</button>
                      <button onClick={() => setBorrar(null)}
                        className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream">Cancelar</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => abrirEditar(b)}
                        className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream transition-colors">Editar</button>
                      <button onClick={() => setBorrar(b.id)}
                        className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-red-400 transition-colors">Eliminar</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
