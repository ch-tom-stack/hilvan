'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { deshacer, rehacer } from '@/app/actions/historial'
import { toast, toastError } from '@/lib/toast'

/** Nombre del evento que se dispara tras deshacer/rehacer: las pantallas con estado propio recargan. */
export const EVENTO_HISTORIAL = 'hilvan:historial'

function enCampoDeTexto(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * Ctrl/Cmd+Z deshace y Ctrl/Cmd+Shift+Z (o Ctrl+Y) rehace, en toda la app.
 *
 * Dentro de un campo de texto no se intercepta: ahí Ctrl+Z es el del navegador
 * (deshacer lo escrito), que es lo que uno espera. Vive en el layout del
 * dashboard, así que funciona en cualquier pantalla que registre sus acciones.
 */
export default function AtajosGlobales() {
  const pathname = usePathname()
  const router = useRouter()
  const ocupado = useRef(false)

  useEffect(() => {
    const correr = async (sentido: 'deshacer' | 'rehacer') => {
      if (ocupado.current) return
      ocupado.current = true
      try {
        const r = sentido === 'deshacer' ? await deshacer(pathname) : await rehacer(pathname)
        if (!r.ok) {
          if (r.nada) toast(r.error, { duration: 1500 })
          else toastError(r.error)
          return
        }
        window.dispatchEvent(new CustomEvent(EVENTO_HISTORIAL, { detail: { sentido, descripcion: r.descripcion } }))
        router.refresh()
        toast(`${sentido === 'deshacer' ? 'Deshecho' : 'Rehecho'}: ${r.descripcion}`, {
          duration: 5000,
          action: { label: sentido === 'deshacer' ? 'Rehacer' : 'Deshacer', onClick: () => void correr(sentido === 'deshacer' ? 'rehacer' : 'deshacer') },
        })
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'No se pudo')
      } finally {
        ocupado.current = false
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k !== 'z' && k !== 'y') return
      if (enCampoDeTexto()) return
      e.preventDefault()
      void correr(k === 'y' || e.shiftKey ? 'rehacer' : 'deshacer')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pathname, router])

  return null
}
