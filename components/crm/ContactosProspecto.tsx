'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CrmContacto } from '@/types'
import { crearContacto, actualizarContacto, eliminarContacto, type ContactoInput } from '@/app/actions/crm'
import { toastOk, toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { useCambiado } from '@/components/ui/useCambiado'

interface Props {
  prospectoId: string
  contactos: CrmContacto[]
}

type FormState = ContactoInput & { linksText: string }

const VACIO: FormState = { nombre: '', cargo: '', email: '', telefono: '', es_decisor: false, notas: '', linksText: '' }

function aFormState(c: CrmContacto): FormState {
  return {
    nombre: c.nombre ?? '',
    cargo: c.cargo ?? '',
    email: c.email ?? '',
    telefono: c.telefono ?? '',
    es_decisor: c.es_decisor ?? false,
    notas: c.notas ?? '',
    linksText: (c.links ?? []).join('\n'),
  }
}

export default function ContactosProspecto({ prospectoId, contactos }: Props) {
  const cam = useCambiado<HTMLDivElement>()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // 'nuevo' para alta, el id para edición, null cerrado
  const [editando, setEditando] = useState<string | null>(null)
  const [borrar, setBorrar] = useState<string | null>(null)
  // Id que se está yendo: la fila se desvanece antes de que el refresh la
  // saque del DOM, para que el borrado se vea y no sólo ocurra.
  const [saliendo, setSaliendo] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(VACIO)

  const set = (patch: Partial<FormState>) => setForm(p => ({ ...p, ...patch }))

  const abrirNuevo = () => { setForm(VACIO); setEditando('nuevo') }
  const abrirEditar = (c: CrmContacto) => { setForm(aFormState(c)); setEditando(c.id) }
  const cerrar = () => { setEditando(null); setForm(VACIO) }

  const guardar = () => {
    if (!form.nombre?.trim() && !form.email?.trim()) {
      toastError('El contacto necesita al menos nombre o correo')
      return
    }
    const input: ContactoInput = {
      nombre: form.nombre,
      cargo: form.cargo,
      email: form.email,
      telefono: form.telefono,
      es_decisor: form.es_decisor,
      notas: form.notas,
      links: form.linksText.split(/[\n,]/).map(s => s.trim()).filter(Boolean),
    }
    startTransition(async () => {
      try {
        const res = editando === 'nuevo'
          ? await crearContacto(prospectoId, input)
          : await actualizarContacto(editando as string, prospectoId, input)
        if (res.error) { toastError(res.error); return }
        momento('guardado', { mensaje: 'Contacto guardado' })
        cam.marcar()
        cerrar()
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al guardar')
      }
    })
  }

  const eliminar = (id: string) => {
    setSaliendo(id)
    startTransition(async () => {
      try {
        const res = await eliminarContacto(id, prospectoId)
        if (res.error) { toastError(res.error); return }
        toastOk('Contacto eliminado')
        setBorrar(null)
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al eliminar')
      } finally {
        window.setTimeout(() => setSaliendo(null), 340)
      }
    })
  }

  return (
    <div ref={cam.ref} className="border border-ch-border bg-ch-surface/30 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted">Contactos</h2>
        {editando === null && (
          <button onClick={abrirNuevo}
            className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-green hover:text-ch-green-light transition-colors">
            + Agregar
          </button>
        )}
      </div>

      {/* Formulario de alta/edición */}
      {editando !== null && (
        <div className="border border-ch-border bg-ch-black/20 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" value={form.nombre ?? ''} onChange={v => set({ nombre: v })} placeholder="Nombre" />
            <Field label="Cargo" value={form.cargo ?? ''} onChange={v => set({ cargo: v })} placeholder="Ej. Gerente de marketing" />
            <Field label="Correo" value={form.email ?? ''} onChange={v => set({ email: v })} placeholder="correo@empresa.cl" />
            <Field label="Teléfono" value={form.telefono ?? ''} onChange={v => set({ telefono: v })} placeholder="+56 9 …" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer font-body text-xs text-ch-cream">
            <input type="checkbox" checked={form.es_decisor} onChange={e => set({ es_decisor: e.target.checked })} />
            Es decisor
          </label>
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Notas</label>
            <textarea value={form.notas ?? ''} onChange={e => set({ notas: e.target.value })} rows={2} className="input-ch w-full resize-none"
              placeholder="Contexto de esta persona" />
          </div>
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Links (uno por línea)</label>
            <textarea value={form.linksText} onChange={e => set({ linksText: e.target.value })} rows={2} className="input-ch w-full resize-none"
              placeholder="LinkedIn, Instagram, sitio…" />
          </div>
          <div className="flex gap-2">
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

      {/* Lista */}
      {contactos.length === 0 && editando === null ? (
        <p className="font-body text-sm text-ch-subtle">Sin contactos todavía.</p>
      ) : (
        <div className="space-y-3">
          {contactos.map((c, i) => (
            <div
              key={c.id}
              style={{ ['--i' as string]: i }}
              className={`border-l border-ch-border pl-4 ${
                saliendo === c.id ? 'ch-salir-no' : 'ch-fade-up ch-stagger'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-body text-sm text-ch-cream">
                    {c.nombre || '—'}
                    {c.es_decisor && (
                      <span className="ml-2 font-body text-[9px] tracking-[0.2em] uppercase text-ch-gold border border-ch-gold px-1.5 py-0.5">Decisor</span>
                    )}
                  </p>
                  {c.cargo && <p className="font-body text-xs text-ch-muted">{c.cargo}</p>}
                  {c.email && <p className="font-body text-xs text-ch-muted break-all">{c.email}</p>}
                  {c.telefono && <p className="font-body text-xs text-ch-muted">{c.telefono}</p>}
                  {c.notas && <p className="font-body text-xs text-ch-subtle whitespace-pre-wrap mt-1">{c.notas}</p>}
                  {(c.links ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(c.links ?? []).map((l, i) => (
                        <a key={i} href={l} target="_blank" rel="noopener noreferrer"
                          className="font-body text-[11px] text-ch-green hover:text-ch-green-light transition-colors break-all">
                          {l}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {borrar === c.id ? (
                    <div className="flex gap-2">
                      <button onClick={() => eliminar(c.id)} disabled={isPending}
                        className="font-body text-[9px] tracking-[0.2em] uppercase text-red-400 hover:text-red-300 disabled:opacity-50">Eliminar</button>
                      <button onClick={() => setBorrar(null)}
                        className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream">Cancelar</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => abrirEditar(c)}
                        className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream transition-colors">Editar</button>
                      <button onClick={() => setBorrar(c.id)}
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

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="input-ch w-full" />
    </div>
  )
}
