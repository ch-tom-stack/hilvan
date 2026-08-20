'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CrmBorrador, CrmContacto } from '@/types'
import { guardarBorrador, eliminarBorrador, type BorradorInput } from '@/app/actions/crm'
import { toastOk, toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'

interface Props {
  prospectoId: string
  borradores: CrmBorrador[]
  /** Para poner los destinatarios sobre el borrador, listos para copiar. */
  contactos: CrmContacto[]
  /**
   * Si ya hay cadena de correo con este prospecto. Cuando la hay, el correo NO
   * se compone nuevo: se contesta dentro de la cadena, o se parte la
   * conversación en dos y el cliente ve dos hilos sueltos del mismo tema.
   * Lo decide `hayCadenaDeCorreo` (lib/crm-conversacion.ts).
   */
  enCadena?: boolean
}

type FormState = { id?: string; asunto: string; cuerpo: string; linksText: string; adjuntosText: string; estado: string }

const VACIO: FormState = { asunto: '', cuerpo: '', linksText: '', adjuntosText: '', estado: 'borrador' }
const ESTADO_STYLE: Record<string, string> = {
  borrador: 'border-ch-border text-ch-subtle',
  listo:    'border-ch-green text-ch-green',
  enviado:  'border-ch-gold text-ch-gold',
}

/**
 * Cuál es EL borrador: el que se va a mandar.
 *
 * `listo` gana sobre `borrador`, y lo enviado es historia. Antes se listaban
 * todos con el mismo peso y el más viejo podía quedar arriba: para saber cuál
 * mandar había que leerlos todos.
 */
const PRIORIDAD: Record<string, number> = { listo: 0, borrador: 1, enviado: 2 }

function ordenar(bs: CrmBorrador[]): CrmBorrador[] {
  return [...bs].sort((a, b) => {
    const pa = PRIORIDAD[a.estado ?? 'borrador'] ?? 1
    const pb = PRIORIDAD[b.estado ?? 'borrador'] ?? 1
    if (pa !== pb) return pa - pb
    const fa = a.updated_at ?? a.created_at
    const fb = b.updated_at ?? b.created_at
    return fa < fb ? 1 : -1
  })
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

/** Botón de copiar con acuse. Sin el acuse no se sabe si el click hizo algo. */
function Copiar({ texto, label = 'Copiar', className = '' }: { texto: string; label?: string; className?: string }) {
  const [copiado, setCopiado] = useState(false)
  if (!texto.trim()) return null
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto)
          setCopiado(true)
          window.setTimeout(() => setCopiado(false), 1600)
        } catch {
          toastError('El navegador no dejó copiar. Selecciona el texto a mano.')
        }
      }}
      className={`font-body text-[9px] tracking-[0.2em] uppercase transition-colors shrink-0 ${
        copiado ? 'text-ch-green' : 'text-ch-subtle hover:text-ch-cream'
      } ${className}`}
    >
      {copiado ? 'Copiado' : label}
    </button>
  )
}

export default function BorradorRespuesta({ prospectoId, borradores, contactos, enCadena }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState<boolean>(false)
  const [borrar, setBorrar] = useState<string | null>(null)
  const [verOtros, setVerOtros] = useState(false)
  const [form, setForm] = useState<FormState>(VACIO)

  const set = (patch: Partial<FormState>) => setForm(p => ({ ...p, ...patch }))
  const abrirNuevo = () => { setForm(VACIO); setAbierto(true) }
  const abrirEditar = (b: CrmBorrador) => { setForm(aForm(b)); setAbierto(true) }
  const cerrar = () => { setAbierto(false); setForm(VACIO) }

  const ordenados = ordenar(borradores)
  const vigente = ordenados[0] ?? null
  const otros = ordenados.slice(1)

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
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted">Borrador de respuesta</h2>
        <div className="flex items-center gap-4">
          {otros.length > 0 && (
            <button onClick={() => setVerOtros(v => !v)}
              className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors">
              {verOtros ? 'Ocultar' : `Otros ${otros.length}`}
            </button>
          )}
          {!abierto && (
            <button onClick={abrirNuevo}
              className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-green hover:text-ch-green-light transition-colors">
              + Nuevo
            </button>
          )}
        </div>
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
            <textarea value={form.cuerpo} onChange={e => set({ cuerpo: e.target.value })} rows={12} className="input-ch w-full resize-y"
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
          <div className="flex items-end gap-3 flex-wrap">
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

      {!vigente && !abierto ? (
        <p className="font-body text-sm text-ch-subtle">Sin borradores. El operador IA o tú pueden rellenar uno.</p>
      ) : vigente && (
        <Vigente
          b={vigente}
          contactos={contactos}
          enCadena={enCadena}
          ocupado={isPending}
          confirmandoBorrar={borrar === vigente.id}
          onEditar={() => abrirEditar(vigente)}
          onPedirBorrar={() => setBorrar(vigente.id)}
          onCancelarBorrar={() => setBorrar(null)}
          onBorrar={() => eliminar(vigente.id)}
        />
      )}

      {verOtros && otros.length > 0 && (
        <div className="mt-5 pt-4 border-t border-ch-border space-y-3">
          <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle">Versiones anteriores</p>
          {otros.map(b => (
            <div key={b.id} className="border-l border-ch-border pl-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`font-body text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 border ${ESTADO_STYLE[b.estado ?? 'borrador'] ?? ESTADO_STYLE.borrador}`}>
                  {b.estado ?? 'borrador'}
                </span>
                {b.autor === 'ia' && <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle">IA</span>}
                <span className="flex-1" />
                <button onClick={() => abrirEditar(b)}
                  className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream transition-colors">Editar</button>
                {borrar === b.id ? (
                  <>
                    <button onClick={() => eliminar(b.id)} disabled={isPending}
                      className="font-body text-[9px] tracking-[0.2em] uppercase text-red-400 hover:text-red-300 disabled:opacity-50">Eliminar</button>
                    <button onClick={() => setBorrar(null)}
                      className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream">Cancelar</button>
                  </>
                ) : (
                  <button onClick={() => setBorrar(b.id)}
                    className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-red-400 transition-colors">Eliminar</button>
                )}
              </div>
              {b.asunto && <p className="font-body text-sm text-ch-cream">{b.asunto}</p>}
              {b.cuerpo && <p className="font-body text-xs text-ch-muted whitespace-pre-wrap mt-1 line-clamp-3">{b.cuerpo}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── El borrador vigente ──────────────────────────────────────────────────────

function Vigente({
  b, contactos, enCadena, ocupado, confirmandoBorrar,
  onEditar, onPedirBorrar, onCancelarBorrar, onBorrar,
}: {
  b: CrmBorrador
  contactos: CrmContacto[]
  enCadena?: boolean
  ocupado: boolean
  confirmandoBorrar: boolean
  onEditar: () => void
  onPedirBorrar: () => void
  onCancelarBorrar: () => void
  onBorrar: () => void
}) {
  // A quién va: el contacto del borrador si lo tiene; si no, todos los que
  // tengan correo. Están arriba porque es el primer campo que se pega en Gmail.
  const destino = b.contacto_id
    ? contactos.filter(c => c.id === b.contacto_id && c.email)
    : contactos.filter(c => c.email)
  const correos = destino.map(c => c.email!).join(', ')

  return (
    <div className="border border-ch-border bg-ch-black/20">
      {/* Para: — lo primero que se pega, así que va primero. */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-ch-border flex-wrap">
        <span className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle shrink-0">Para</span>
        <span className="font-body text-sm text-ch-cream min-w-0 break-all">
          {correos || <span className="text-ch-subtle">Sin correo en el árbol de contactos</span>}
        </span>
        <span className="flex-1" />
        {enCadena ? (
          // Copiar el correo llevaría a componer uno nuevo, y eso parte la
          // conversación en dos hilos sueltos del mismo tema. Se bloquea a
          // propósito: lo correcto es responder dentro de la cadena que existe.
          <span
            title="Ya hay una cadena de correo abierta con este contacto. Responde dentro de ella para no partir la conversación en dos."
            className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-gold border border-ch-gold/40 px-2 py-1 shrink-0 cursor-not-allowed"
          >
            Contestar en la cadena
          </span>
        ) : (
          <Copiar texto={correos} label="Copiar correo" />
        )}
      </div>

      {/* Asunto */}
      <div className="flex items-start gap-3 px-4 py-2.5 border-b border-ch-border">
        <span className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle shrink-0 mt-1">Asunto</span>
        <p className="font-body text-sm text-ch-cream flex-1 min-w-0">{b.asunto || <span className="text-ch-subtle">—</span>}</p>
        <Copiar texto={b.asunto ?? ''} className="mt-1" />
      </div>

      {/* Cuerpo COMPLETO. Antes se recortaba a cuatro líneas y había que abrir
          el editor para leerlo, que es justo lo contrario de lo que hace falta
          cuando lo único que se quiere es copiarlo y mandarlo. */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle">Cuerpo</span>
          <span className="flex-1" />
          <span className={`font-body text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 border ${ESTADO_STYLE[b.estado ?? 'borrador'] ?? ESTADO_STYLE.borrador}`}>
            {b.estado ?? 'borrador'}
          </span>
          {b.autor === 'ia' && <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle">IA</span>}
          <Copiar texto={b.cuerpo ?? ''} />
        </div>
        {b.cuerpo
          ? <p className="font-body text-sm text-ch-cream whitespace-pre-wrap leading-relaxed">{b.cuerpo}</p>
          : <p className="font-body text-sm text-ch-subtle">Sin cuerpo todavía.</p>}

        {(b.links ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
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
                className="font-body text-[11px] text-ch-gold hover:text-ch-gold-light break-all">{l}</a>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-ch-border flex-wrap">
        <Copiar texto={[b.asunto, b.cuerpo].filter(Boolean).join('\n\n')} label="Copiar todo" />
        <span className="flex-1" />
        <button onClick={onEditar}
          className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream transition-colors">Editar</button>
        {confirmandoBorrar ? (
          <>
            <button onClick={onBorrar} disabled={ocupado}
              className="font-body text-[9px] tracking-[0.2em] uppercase text-red-400 hover:text-red-300 disabled:opacity-50">Eliminar</button>
            <button onClick={onCancelarBorrar}
              className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream">Cancelar</button>
          </>
        ) : (
          <button onClick={onPedirBorrar}
            className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-red-400 transition-colors">Eliminar</button>
        )}
      </div>
    </div>
  )
}
