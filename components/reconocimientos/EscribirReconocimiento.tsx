'use client'

import { useState, useTransition } from 'react'
import { crearReconocimiento, subirImagenReconocimiento } from '@/app/actions/reconocimientos'
import { toastError, toastOk } from '@/lib/toast'
import { momento } from '@/lib/momentos'

/**
 * Escribir una mención.
 *
 * El motivo es obligatorio y por eso el campo grande es ése, no el título: lo
 * que hace valer un reconocimiento es que alguien se sentó a explicar por qué.
 * Sin texto sería una palmada en la espalda — se agradece y se olvida.
 *
 * No hay plantillas ni sugerencias a propósito. Una mención autocompletada es
 * exactamente lo que este símbolo no puede ser.
 */
export default function EscribirReconocimiento({
  destinatarios,
}: {
  destinatarios: { id: string; nombre: string }[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [persona, setPersona] = useState('')
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [imagen, setImagen] = useState<string | null>(null)   // dataURL, para la vista previa
  const [subiendo, setSubiendo] = useState(false)
  const [pendiente, startTransition] = useTransition()

  /**
   * Reduce y convierte a PNG en el navegador antes de subir.
   *
   * Así el servidor recibe siempre lo mismo —una lista blanca de un solo
   * formato— y no hay que fiarse de la extensión del nombre. Y una foto de
   * teléfono de 8 MB llega pesando poco más de cien kilos.
   */
  async function elegir(file: File) {
    if (!file.type.startsWith('image/')) { toastError('Tiene que ser una imagen'); return }
    setSubiendo(true)
    try {
      const bitmap = await createImageBitmap(file)
      const MAX = 1000
      const escala = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height))
      const lienzo = document.createElement('canvas')
      lienzo.width = Math.round(bitmap.width * escala)
      lienzo.height = Math.round(bitmap.height * escala)
      lienzo.getContext('2d')?.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
      setImagen(lienzo.toDataURL('image/png'))
    } catch {
      toastError('No se pudo leer la imagen')
    } finally {
      setSubiendo(false)
    }
  }

  if (destinatarios.length === 0) return null

  function enviar() {
    startTransition(async () => {
      try {
        let url: string | null = null
        if (imagen) {
          const sub = await subirImagenReconocimiento(imagen)
          // La imagen es un adorno: si falla, la mención igual se manda. Perder
          // el texto escrito por no poder subir una foto sería absurdo.
          if (sub.error) toastError(`${sub.error} — se envía sin imagen`)
          else url = sub.url ?? null
        }
        const res = await crearReconocimiento(persona, titulo, texto, url)
        if (res?.error) { toastError(res.error); return }
        momento('hito.alcanzado', { mensaje: 'Reconocimiento enviado' })
        toastOk('Le va a llegar al entrar')
        setPersona(''); setTitulo(''); setTexto(''); setImagen(null); setAbierto(false)
      } catch {
        toastError('No se pudo enviar')
      }
    })
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="ch-press font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle hover:text-ch-cream transition-colors"
      >
        Escribir una mención
      </button>
    )
  }

  return (
    <div className="border border-ch-border bg-ch-surface/20 p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-subtle">
          Una mención
        </p>
        <button
          onClick={() => setAbierto(false)}
          className="ch-press font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream transition-colors"
        >
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select
          value={persona}
          onChange={e => setPersona(e.target.value)}
          className="bg-ch-surface border border-ch-border px-3 py-2 font-body text-sm text-ch-cream rounded-[2px]"
        >
          <option value="">Para quién…</option>
          {destinatarios.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>

        <input
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          placeholder="Por qué, en tres palabras"
          maxLength={60}
          className="bg-ch-surface border border-ch-border px-3 py-2 font-body text-sm text-ch-cream placeholder:text-ch-subtle rounded-[2px]"
        />
      </div>

      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        rows={4}
        placeholder="Qué hizo, y por qué ninguna regla lo habría visto."
        className="w-full bg-ch-surface border border-ch-border px-3 py-2 font-body text-sm text-ch-cream placeholder:text-ch-subtle leading-relaxed rounded-[2px]"
      />

      {/* La imagen, pegada como una foto en el papel */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="ch-press border border-ch-border px-3 py-1.5 font-body text-[9px] tracking-[0.25em] uppercase text-ch-subtle hover:text-ch-cream hover:border-ch-muted transition-colors cursor-pointer">
          {subiendo ? 'Leyendo…' : imagen ? 'Cambiar imagen' : 'Pegar una imagen'}
          <input
            type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void elegir(f) }}
          />
        </label>
        {imagen && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagen} alt="" className="h-14 w-auto border border-ch-border -rotate-1" />
            <button
              onClick={() => setImagen(null)}
              className="ch-press font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream transition-colors"
            >
              Quitar
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="font-body text-[10px] text-ch-subtle">
          Lo va a ver todo el equipo. Es lo único que se comparte.
        </p>
        <button
          onClick={enviar}
          disabled={pendiente || !persona || !titulo.trim() || texto.trim().length < 15}
          className="ch-press border border-ch-green text-ch-green px-4 py-2 font-body text-[9px] tracking-[0.3em] uppercase hover:bg-ch-green/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {pendiente ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
