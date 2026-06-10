'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  rodajeId: string
  campo: 'chiste_imagen_url' | 'cliente_logo_url'
  valorActual?: string
  label: string
  onSubida: (url: string) => void
  invertOnDark?: boolean  // para logos oscuros sobre fondo negro
}

export function ImagenUploader({ rodajeId, campo, valorActual, label, onSubida, invertOnDark }: Props) {
  const [subiendo, setSubiendo] = useState(false)
  const [preview, setPreview] = useState<string | undefined>(valorActual)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleArchivo = async (archivo: File) => {
    if (!archivo) return
    setSubiendo(true)
    setError(null)

    try {
      const supabase = createClient()
      const ext = archivo.name.split('.').pop()
      const path = `${rodajeId}/${campo}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('rodajes')
        .upload(path, archivo, { upsert: true })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('rodajes').getPublicUrl(path)
      const url = data.publicUrl

      // Guardar URL en el rodaje
      const { error: updateError } = await supabase
        .from('rodajes')
        .update({ [campo]: url })
        .eq('id', rodajeId)

      if (updateError) throw updateError

      setPreview(url)
      onSubida(url)
    } catch (e: any) {
      setError('Error al subir imagen')
      console.error(e)
    } finally {
      setSubiendo(false)
    }
  }

  const handleEliminar = async () => {
    const supabase = createClient()
    await supabase.from('rodajes').update({ [campo]: null }).eq('id', rodajeId)
    setPreview(undefined)
    onSubida('')
  }

  return (
    <div>
      <label className="block text-xs text-ch-muted mb-1.5">{label}</label>

      {preview ? (
        <div className="flex items-center gap-3">
          <img
            src={preview}
            alt={label}
            className="h-16 w-auto object-contain rounded-[2px] bg-ch-surface p-1"
            style={invertOnDark ? { filter: 'invert(1)' } : undefined}
          />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs text-ch-muted hover:text-ch-cream transition-colors"
            >
              Cambiar imagen
            </button>
            <button
              type="button"
              onClick={handleEliminar}
              className="text-xs text-red-500 hover:text-red-400 transition-colors"
            >
              Eliminar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="w-full border border-dashed border-ch-border rounded-[2px] px-4 py-4 text-xs text-ch-border hover:border-ch-muted hover:text-ch-muted transition-colors disabled:opacity-50 text-center"
        >
          {subiendo ? 'Subiendo...' : '+ Subir imagen'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleArchivo(f)
        }}
      />

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
