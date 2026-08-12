'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CrmInteraccion, CrmHilo, CrmContacto } from '@/types'
import { TIPOS_INTERACCION, MOTIVOS_CIERRE_HILO } from '@/types'
import {
  registrarInteraccion, registrarToque, eliminarInteraccion,
  registrarRespuesta, abrirHilo, cerrarHilo, reabrirHilo,
  type InteraccionInput,
} from '@/app/actions/crm'
import type { RespuestaInput } from '@/lib/crm-conversacion'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { revisarMedallasSuave } from '@/lib/medallas-cliente'
import { formatFecha, parseFechaLocal } from '@/lib/fechas'

function hoyISO(): string {
  // Fecha local de Chile en formato YYYY-MM-DD (sin correrse por UTC)
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

function estaVencida(fecha?: string | null): boolean {
  if (!fecha) return false
  return parseFechaLocal(fecha).getTime() < parseFechaLocal(hoyISO()).getTime()
}

// Mismos cuatro canales que la tarjeta del Kanban: el toque se registra igual
// desde el tablero que desde la ficha.
const CANALES_RAPIDOS: { tipo: string; label: string }[] = [
  { tipo: 'correo',  label: 'Correo'  },
  { tipo: 'llamada', label: 'Llamada' },
  { tipo: 'mensaje', label: 'Mensaje' },
  { tipo: 'reunion', label: 'Reunión' },
]

interface Props {
  prospectoId: string
  interacciones: CrmInteraccion[]
  hilos: CrmHilo[]
  contactos: CrmContacto[]
  /** id → nombre, para poner cara a quién envió cada mensaje. */
  personas: Record<string, string>
}

/**
 * La bitácora es una conversación, no un registro de actividad.
 *
 * Antes cada fila era un toque nuestro y que el otro lado contestara era un
 * checkbox: se sabía QUE respondieron, nunca QUÉ. Ahora hay dos lados —lo que
 * enviamos y lo que nos escribieron— agrupados en hilos, porque hablar con
 * Marcela en marzo y con su reemplazo en agosto son dos conversaciones y
 * mezclarlas hace ilegible la historia.
 */
export default function Bitacora({ prospectoId, interacciones, hilos, contactos, personas }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState(false)
  const [respondiendo, setRespondiendo] = useState<string | null>(null)
  const [borrar, setBorrar] = useState<string | null>(null)
  const [nuevaLinea, setNuevaLinea] = useState(false)

  const nombreContacto = (id?: string | null) =>
    contactos.find(c => c.id === id)?.nombre ?? null

  const tocarRapido = (tipo: string) => {
    momento('crm.contacto', { mensaje: '' })
    startTransition(async () => {
      const res = await registrarToque(prospectoId, tipo)
      if (res.error) { momento('error', { mensaje: res.error }); return }
      router.refresh()
    })
  }

  const [form, setForm] = useState<InteraccionInput>({
    fecha: hoyISO(), tipo: 'correo', resumen: '', cuerpo: '',
    respondido: false, proximo_paso: '', fecha_proximo: '',
  })
  const set = (patch: Partial<InteraccionInput>) => setForm(p => ({ ...p, ...patch }))

  const eliminar = (id: string) => {
    startTransition(async () => {
      try {
        const res = await eliminarInteraccion(id, prospectoId)
        if (res.error) { toastError(res.error); return }
        momento('eliminado', { mensaje: 'Contacto eliminado' })
        setBorrar(null)
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al eliminar')
      }
    })
  }

  const submit = () => {
    if (!form.resumen?.trim()) { toastError('Escribe un resumen de la interacción'); return }
    startTransition(async () => {
      try {
        const res = await registrarInteraccion(prospectoId, form)
        if (res.error) { toastError(res.error); return }
        revisarMedallasSuave()
        momento('crm.contacto', { mensaje: 'Interacción registrada' })
        setForm({ fecha: hoyISO(), tipo: 'correo', resumen: '', cuerpo: '', respondido: false, proximo_paso: '', fecha_proximo: '' })
        setAbierto(false)
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al registrar')
      }
    })
  }

  const guardarRespuesta = (input: RespuestaInput) => {
    startTransition(async () => {
      try {
        const res = await registrarRespuesta(prospectoId, input)
        if (res.error) { toastError(res.error); return }
        momento('crm.contacto', { mensaje: 'Respuesta registrada' })
        setRespondiendo(null)
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al registrar la respuesta')
      }
    })
  }

  const accionHilo = (fn: () => Promise<{ ok?: true; error?: string }>, msg: string) => {
    startTransition(async () => {
      try {
        const res = await fn()
        if (res.error) { toastError(res.error); return }
        momento('crm.contacto', { mensaje: msg })
        setNuevaLinea(false)
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error')
      }
    })
  }

  // Agrupación por hilo. Las interacciones anteriores a los hilos (hilo_id
  // null) se muestran juntas al final: son historia real y esconderlas sería
  // peor que mostrarlas sin contexto.
  const porHilo = new Map<string, CrmInteraccion[]>()
  for (const i of interacciones) {
    const k = i.hilo_id ?? '__sin_hilo__'
    porHilo.set(k, [...(porHilo.get(k) ?? []), i])
  }
  const sueltas = porHilo.get('__sin_hilo__') ?? []
  const hayAlgo = interacciones.length > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted">Bitácora</h2>
        <div className="flex items-center gap-4">
          {hayAlgo && (
            <button onClick={() => setNuevaLinea(!nuevaLinea)}
              className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors">
              {nuevaLinea ? 'Cancelar' : 'Nueva línea'}
            </button>
          )}
          <button onClick={() => setAbierto(!abierto)}
            className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-green hover:text-ch-green-light transition-colors">
            {abierto ? 'Cancelar' : '+ Registrar'}
          </button>
        </div>
      </div>

      {nuevaLinea && (
        <NuevaLinea
          contactos={contactos}
          ocupado={isPending}
          onAbrir={(contacto_id, titulo, motivo_cierre) =>
            accionHilo(() => abrirHilo(prospectoId, { contacto_id, titulo, motivo_cierre }), 'Línea nueva abierta')}
        />
      )}

      {abierto && (
        <div className="border border-ch-border bg-ch-surface/30 p-4 mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => set({ fecha: e.target.value })} className="input-ch w-full" />
            </div>
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Tipo</label>
              <select value={form.tipo} onChange={e => set({ tipo: e.target.value })} className="input-ch w-full capitalize">
                {TIPOS_INTERACCION.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
          </div>
          {contactos.length > 0 && (
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">A quién</label>
              <select value={form.contacto_id ?? ''} onChange={e => set({ contacto_id: e.target.value })} className="input-ch w-full">
                <option value="">—</option>
                {contactos.map(c => <option key={c.id} value={c.id}>{c.nombre ?? c.email ?? 'Sin nombre'}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Resumen</label>
            <textarea value={form.resumen} onChange={e => set({ resumen: e.target.value })} rows={2} className="input-ch w-full resize-none"
              placeholder="Qué pasó en este toque" />
          </div>
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Correo enviado</label>
            <textarea value={form.cuerpo} onChange={e => set({ cuerpo: e.target.value })} rows={4} className="input-ch w-full resize-none"
              placeholder="Pega acá el correo que enviaste (opcional)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Próximo paso</label>
              <input value={form.proximo_paso} onChange={e => set({ proximo_paso: e.target.value })} className="input-ch w-full"
                placeholder="Qué sigue" />
            </div>
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Fecha próximo paso</label>
              <input type="date" value={form.fecha_proximo} onChange={e => set({ fecha_proximo: e.target.value })} className="input-ch w-full" />
            </div>
          </div>
          <button onClick={submit} disabled={isPending || !form.resumen?.trim()}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-2.5 transition-colors disabled:opacity-50">
            {isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}

      {!hayAlgo ? (
        // El estado vacío más visto de toda la app: con 1 contacto en la base
        // aparece en 29 de 30 fichas. Debe enseñar y ofrecer la acción, no
        // limitarse a informar la nada.
        <div className="border border-dashed border-ch-border p-5 ch-fade-up">
          <p className="font-display italic text-xl text-ch-cream mb-1.5">Sin contactos registrados</p>
          <p className="font-body text-xs text-ch-muted leading-relaxed mb-4 max-w-md">
            Cada toque que anotas alimenta la Biblioteca: es lo que después dice
            a qué contacto suelen cerrar los prospectos y cuáles se están
            enfriando. Registra el primero con un click.
          </p>
          <div className="flex flex-wrap gap-2">
            {CANALES_RAPIDOS.map(c => (
              <button key={c.tipo} type="button" disabled={isPending} onClick={() => tocarRapido(c.tipo)}
                className="border border-ch-border text-ch-muted hover:text-ch-green hover:border-ch-green/50 font-body text-[10px] tracking-[0.2em] uppercase px-3.5 py-2 transition-colors disabled:opacity-40 ch-press">
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {hilos.map(h => {
            const msgs = porHilo.get(h.id) ?? []
            if (msgs.length === 0 && h.cerrado_at) return null
            return (
              <Hilo
                key={h.id} hilo={h} mensajes={msgs} contactos={contactos} personas={personas}
                ocupado={isPending} respondiendo={respondiendo} borrar={borrar}
                nombreContacto={nombreContacto}
                onResponder={setRespondiendo} onGuardarRespuesta={guardarRespuesta}
                onBorrar={setBorrar} onEliminar={eliminar}
                onCerrar={(motivo) => accionHilo(() => cerrarHilo(h.id, prospectoId, motivo), 'Línea cerrada')}
                onReabrir={() => accionHilo(() => reabrirHilo(h.id, prospectoId), 'Línea reabierta')}
              />
            )
          })}

          {sueltas.length > 0 && (
            <section>
              <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle mb-3 pb-2 border-b border-ch-border">
                Antes de los hilos
              </p>
              <Mensajes
                mensajes={sueltas} personas={personas} contactos={contactos}
                ocupado={isPending} respondiendo={respondiendo} borrar={borrar}
                nombreContacto={nombreContacto}
                onResponder={setRespondiendo} onGuardarRespuesta={guardarRespuesta}
                onBorrar={setBorrar} onEliminar={eliminar}
              />
            </section>
          )}
        </div>
      )}
    </div>
  )
}

// ── Una línea de conversación ────────────────────────────────────────────────

function Hilo({
  hilo, mensajes, contactos, personas, ocupado, respondiendo, borrar,
  nombreContacto, onResponder, onGuardarRespuesta, onBorrar, onEliminar, onCerrar, onReabrir,
}: {
  hilo: CrmHilo
  mensajes: CrmInteraccion[]
  contactos: CrmContacto[]
  personas: Record<string, string>
  ocupado: boolean
  respondiendo: string | null
  borrar: string | null
  nombreContacto: (id?: string | null) => string | null
  onResponder: (id: string | null) => void
  onGuardarRespuesta: (input: RespuestaInput) => void
  onBorrar: (id: string | null) => void
  onEliminar: (id: string) => void
  onCerrar: (motivo: string) => void
  onReabrir: () => void
}) {
  const [cerrando, setCerrando] = useState(false)
  const cerrado = Boolean(hilo.cerrado_at)
  const con = nombreContacto(hilo.contacto_id)
  const por = hilo.responsable_id ? personas[hilo.responsable_id] : null

  return (
    <section className={cerrado ? 'opacity-60' : undefined}>
      <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-ch-border flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <span className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle">
            {hilo.titulo || (con ? `Con ${con}` : 'Conversación')}
          </span>
          {por && <span className="font-body text-[10px] text-ch-subtle">· lleva {por}</span>}
          {cerrado && (
            <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-muted border border-ch-border px-2 py-0.5">
              Cerrada{hilo.motivo_cierre ? ` · ${MOTIVOS_CIERRE_HILO[hilo.motivo_cierre] ?? hilo.motivo_cierre}` : ''}
            </span>
          )}
        </div>
        {cerrado ? (
          <button onClick={onReabrir} disabled={ocupado}
            className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream disabled:opacity-50">
            Reabrir
          </button>
        ) : cerrando ? (
          <span className="flex items-center gap-2 flex-wrap">
            {Object.entries(MOTIVOS_CIERRE_HILO).map(([k, label]) => (
              <button key={k} onClick={() => { setCerrando(false); onCerrar(k) }} disabled={ocupado}
                className="font-body text-[9px] tracking-[0.15em] uppercase text-ch-gold hover:text-ch-gold-light disabled:opacity-50">
                {label}
              </button>
            ))}
            <button onClick={() => setCerrando(false)}
              className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream">✕</button>
          </span>
        ) : (
          <button onClick={() => setCerrando(true)} disabled={ocupado}
            className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream disabled:opacity-50">
            Cerrar línea
          </button>
        )}
      </div>

      {mensajes.length === 0 ? (
        <p className="font-body text-xs text-ch-subtle">Sin mensajes en esta línea todavía.</p>
      ) : (
        <Mensajes
          mensajes={mensajes} personas={personas} contactos={contactos}
          ocupado={ocupado} respondiendo={respondiendo} borrar={borrar}
          nombreContacto={nombreContacto}
          onResponder={onResponder} onGuardarRespuesta={onGuardarRespuesta}
          onBorrar={onBorrar} onEliminar={onEliminar}
        />
      )}
    </section>
  )
}

// ── Los mensajes, en orden de conversación ───────────────────────────────────

function Mensajes({
  mensajes, personas, contactos, ocupado, respondiendo, borrar,
  nombreContacto, onResponder, onGuardarRespuesta, onBorrar, onEliminar,
}: {
  mensajes: CrmInteraccion[]
  personas: Record<string, string>
  contactos: CrmContacto[]
  ocupado: boolean
  respondiendo: string | null
  borrar: string | null
  nombreContacto: (id?: string | null) => string | null
  onResponder: (id: string | null) => void
  onGuardarRespuesta: (input: RespuestaInput) => void
  onBorrar: (id: string | null) => void
  onEliminar: (id: string) => void
}) {
  // Ascendente: una conversación se lee de arriba hacia abajo.
  const orden = [...mensajes].sort((a, b) => {
    const fa = a.fecha ?? a.created_at, fb = b.fecha ?? b.created_at
    return fa < fb ? -1 : fa > fb ? 1 : a.created_at < b.created_at ? -1 : 1
  })

  return (
    <ol className="flex flex-col gap-3">
      {orden.map(i => {
        const recibido = i.direccion === 'recibido'
        const vencida = estaVencida(i.fecha_proximo)
        const quien = recibido
          ? (nombreContacto(i.contacto_id) ?? 'La contraparte')
          : (i.enviado_por_id ? personas[i.enviado_por_id] : null) ?? i.enviado_por ?? 'Casa Hiedra'

        return (
          <li key={i.id}
            className={`border p-3 max-w-[88%] ${
              recibido
                ? 'self-start border-ch-border bg-ch-surface/40'
                : 'self-end border-ch-green/30 bg-ch-green/[0.06]'
            }`}>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`font-body text-[10px] tracking-[0.15em] uppercase ${recibido ? 'text-ch-gold' : 'text-ch-green'}`}>
                {quien}
              </span>
              {i.tipo && (
                <span className="font-body text-[9px] tracking-[0.15em] uppercase text-ch-subtle capitalize">{i.tipo}</span>
              )}
              <span className="font-body text-[10px] text-ch-subtle">{formatFecha(i.fecha)}</span>
              <span className="flex-1" />
              {!recibido && (
                <button onClick={() => onResponder(respondiendo === i.id ? null : i.id)} disabled={ocupado}
                  className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream disabled:opacity-50">
                  {respondiendo === i.id ? 'Cancelar' : 'Responder'}
                </button>
              )}
              {borrar === i.id ? (
                <span className="flex items-center gap-2 shrink-0">
                  <button onClick={() => onEliminar(i.id)} disabled={ocupado}
                    className="font-body text-[9px] tracking-[0.2em] uppercase text-red-400 hover:text-red-300 disabled:opacity-50">
                    Eliminar
                  </button>
                  <button onClick={() => onBorrar(null)}
                    className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream">Cancelar</button>
                </span>
              ) : (
                <button onClick={() => onBorrar(i.id)} title="Eliminar"
                  className="shrink-0 font-body text-xs text-ch-subtle hover:text-red-400 transition-colors leading-none">✕</button>
              )}
            </div>

            {i.resumen && <p className="font-body text-sm text-ch-cream mb-1">{i.resumen}</p>}
            {i.cuerpo && (
              <details className="mb-1">
                <summary className="font-body text-[10px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream cursor-pointer">
                  {recibido ? 'Ver mensaje' : 'Ver correo enviado'}
                </summary>
                <p className="font-body text-xs text-ch-muted whitespace-pre-wrap mt-1 border-l border-ch-border pl-3">{i.cuerpo}</p>
              </details>
            )}
            {i.proximo_paso && (
              <p className="font-body text-xs text-ch-muted">
                <span className="text-ch-subtle">Próximo: </span>{i.proximo_paso}
                {i.fecha_proximo && (
                  <span className={`ml-1 ${vencida ? 'text-ch-gold font-medium' : 'text-ch-subtle'}`}>
                    · {formatFecha(i.fecha_proximo)}{vencida ? ' (vencido)' : ''}
                  </span>
                )}
              </p>
            )}

            {respondiendo === i.id && (
              <FormRespuesta
                contactos={contactos} ocupado={ocupado}
                onGuardar={(input) => onGuardarRespuesta({ ...input, responde_a: i.id, hilo_id: i.hilo_id ?? undefined })}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function FormRespuesta({
  contactos, ocupado, onGuardar,
}: {
  contactos: CrmContacto[]
  ocupado: boolean
  onGuardar: (input: RespuestaInput) => void
}) {
  const [fecha, setFecha] = useState(hoyISO())
  const [contactoId, setContactoId] = useState('')
  const [resumen, setResumen] = useState('')
  const [cuerpo, setCuerpo] = useState('')

  return (
    <div className="mt-3 pt-3 border-t border-ch-border/60 space-y-2.5">
      <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-gold">Qué respondieron</p>
      <div className="grid grid-cols-2 gap-2.5">
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input-ch w-full" />
        <select value={contactoId} onChange={e => setContactoId(e.target.value)} className="input-ch w-full">
          <option value="">Quién contestó…</option>
          {contactos.map(c => <option key={c.id} value={c.id}>{c.nombre ?? c.email ?? 'Sin nombre'}</option>)}
        </select>
      </div>
      <input value={resumen} onChange={e => setResumen(e.target.value)} className="input-ch w-full"
        placeholder="En una línea: qué dijeron" />
      <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={3} className="input-ch w-full resize-none"
        placeholder="Pega la respuesta completa (opcional)" />
      <button
        onClick={() => onGuardar({ fecha, contacto_id: contactoId || undefined, resumen, cuerpo })}
        disabled={ocupado || !resumen.trim()}
        className="bg-ch-gold hover:bg-ch-gold-light text-ch-black font-body font-medium text-[10px] tracking-[0.3em] uppercase px-5 py-2 transition-colors disabled:opacity-50">
        {ocupado ? 'Guardando…' : 'Guardar respuesta'}
      </button>
    </div>
  )
}

function NuevaLinea({
  contactos, ocupado, onAbrir,
}: {
  contactos: CrmContacto[]
  ocupado: boolean
  onAbrir: (contactoId: string | undefined, titulo: string, motivo: string) => void
}) {
  const [contactoId, setContactoId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [motivo, setMotivo] = useState('cambio_contacto')

  return (
    <div className="border border-ch-border bg-ch-surface/30 p-4 mb-5 space-y-3">
      <p className="font-body text-xs text-ch-muted leading-relaxed">
        Abrir una línea nueva cierra la actual y <span className="text-ch-cream">reinicia la cadencia</span>:
        los correos sin respuesta del interlocutor anterior dejan de contar, para
        que el prospecto no arranque agotado con la persona nueva.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Con quién</label>
          <select value={contactoId} onChange={e => setContactoId(e.target.value)} className="input-ch w-full">
            <option value="">—</option>
            {contactos.map(c => <option key={c.id} value={c.id}>{c.nombre ?? c.email ?? 'Sin nombre'}</option>)}
          </select>
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Por qué se cierra la anterior</label>
          <select value={motivo} onChange={e => setMotivo(e.target.value)} className="input-ch w-full">
            {Object.entries(MOTIVOS_CIERRE_HILO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
      <input value={titulo} onChange={e => setTitulo(e.target.value)} className="input-ch w-full"
        placeholder="Título de la línea (opcional)" />
      <button onClick={() => onAbrir(contactoId || undefined, titulo, motivo)} disabled={ocupado}
        className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-2.5 transition-colors disabled:opacity-50">
        {ocupado ? 'Abriendo…' : 'Abrir línea'}
      </button>
    </div>
  )
}
