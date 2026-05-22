'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { subirFotoMaleta } from '@/lib/supabase/storage-maletas'
import { crearMaleta, actualizarMaleta } from '@/app/actions/maletas'
import type { Maleta, Equipo } from '@/types'

interface ItemForm {
  equipo_id: string
  cantidad: number
  notas: string
}

interface Props {
  equipos: Equipo[]
  maleta?: Maleta
}

export default function FormularioMaleta({ equipos, maleta }: Props) {
  const router = useRouter()
  const esEdicion = !!maleta

  const [nombre, setNombre]           = useState(maleta?.nombre || '')
  const [codigo, setCodigo]           = useState(maleta?.codigo || '')
  const [descripcion, setDescripcion] = useState(maleta?.descripcion || '')
  const [fotoEmpaque, setFotoEmpaque] = useState(maleta?.foto_empaque || '')
  const [items, setItems]             = useState<ItemForm[]>(
    maleta?.items?.map(i => ({
      equipo_id: i.equipo_id,
      cantidad:  i.cantidad,
      notas:     i.notas || '',
    })) || []
  )
  const [subiendo, setSubiendo]   = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    const tempId = maleta?.id || `temp-${Date.now()}`
    const url = await subirFotoMaleta(file, tempId)
    if (url) setFotoEmpaque(url)
    setSubiendo(false)
  }

  function agregarItem() {
    if (equipos.length === 0) return
    setItems(prev => [...prev, { equipo_id: equipos[0].id, cantidad: 1, notas: '' }])
  }

  function actualizarItem(i: number, campo: keyof ItemForm, valor: string | number) {
    setItems(prev => prev.map((item, idx) =>
      idx === i ? { ...item, [campo]: valor } : item
    ))
  }

  function eliminarItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    const formData = new FormData()
    formData.set('codigo',       codigo)
    formData.set('nombre',       nombre)
    formData.set('descripcion',  descripcion)
    formData.set('foto_empaque', fotoEmpaque)
    formData.set('items',        JSON.stringify(items))

    const result = esEdicion
      ? await actualizarMaleta(maleta.id, formData)
      : await crearMaleta(formData)

    if (result.error) {
      setError(result.error)
      setGuardando(false)
      return
    }

    router.push('/equipos/maletas')
    router.refresh()
  }

  const labelClass = "block text-ch-muted text-[10px] font-body tracking-[0.35em] uppercase mb-2"
  const inputClass = "w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-subtle focus:outline-none focus:border-ch-green transition-colors duration-200"

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelClass}>Nombre de la maleta</label>
          <input
            type="text" required value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Maleta Sony G Master"
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Código</label>
          <input
            type="text" required value={codigo}
            onChange={e => setCodigo(e.target.value)}
            placeholder="Ej: CH-KIT-001"
            className={inputClass}
            readOnly={esEdicion}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Descripción</label>
        <textarea
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Contenido general, uso, notas de empaque..."
          rows={3}
          className={inputClass + ' resize-none'}
        />
      </div>

      {/* Foto de empaque */}
      <div>
        <label className={labelClass}>Foto de empaque</label>
        {fotoEmpaque && (
          <div className="mb-3 relative group w-48">
            <img src={fotoEmpaque} alt="" className="w-full object-cover" />
            <button
              type="button"
              onClick={() => setFotoEmpaque('')}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-body text-xs tracking-widest"
            >
              QUITAR
            </button>
          </div>
        )}
        <label
          className="flex items-center gap-3 px-4 py-3 border border-dashed border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-green transition-colors cursor-pointer"
          style={{ opacity: subiendo ? 0.5 : 1 }}
        >
          <span className="font-body text-sm">{subiendo ? 'Subiendo...' : fotoEmpaque ? 'Cambiar foto' : '+ Agregar foto de empaque'}</span>
          <input type="file" accept="image/*" onChange={handleFoto} className="hidden" disabled={subiendo} />
        </label>
      </div>

      {/* Ítems */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className={labelClass + ' mb-0'}>Contenido</label>
          <button
            type="button"
            onClick={agregarItem}
            className="text-ch-green hover:text-ch-green-light font-body text-xs transition-colors"
          >
            + Agregar ítem
          </button>
        </div>

        {items.length === 0 ? (
          <div className="border border-dashed border-ch-border p-6 text-center">
            <p className="text-ch-muted font-body text-sm">Sin ítems aún.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => {
              const equipo = equipos.find(e => e.id === item.equipo_id)
              return (
                <div key={i} className="border border-ch-border bg-ch-surface/30 p-4 grid grid-cols-12 gap-3 items-start">
                  <div className="col-span-5">
                    <select
                      value={item.equipo_id}
                      onChange={e => actualizarItem(i, 'equipo_id', e.target.value)}
                      className={inputClass + ' py-2 text-xs'}
                    >
                      {equipos.map(eq => (
                        <option key={eq.id} value={eq.id}>{eq.nombre} ({eq.codigo})</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number" min={1} value={item.cantidad}
                      onChange={e => actualizarItem(i, 'cantidad', parseInt(e.target.value) || 1)}
                      className={inputClass + ' py-2 text-xs text-center'}
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="text" value={item.notas}
                      onChange={e => actualizarItem(i, 'notas', e.target.value)}
                      placeholder="Nota opcional"
                      className={inputClass + ' py-2 text-xs'}
                    />
                  </div>
                  <div className="col-span-1 flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => eliminarItem(i)}
                      className="text-ch-muted hover:text-red-400 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="border border-red-900/50 bg-red-950/40 px-4 py-3">
          <p className="text-red-400 text-xs font-body">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit" disabled={guardando}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-8 py-4 transition-colors disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear maleta'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/equipos/maletas')}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-8 py-4 transition-colors"
        >
          Cancelar
        </button>
      </div>

    </form>
  )
}
