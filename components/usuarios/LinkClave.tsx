'use client'

import { useState, useTransition } from 'react'
import { generarLinkClave } from '@/app/actions/clave-link'
import { toastError, toastOk } from '@/lib/toast'
import { momento } from '@/lib/momentos'

interface Props {
  userId: string
  email: string
  url: string
  expira: string
  /** El correo dice "te creamos una cuenta" en vez de "cambia tu contraseña". */
  bienvenida?: boolean
  onCerrar?: () => void
}

function venceEl(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/** Muestra el link de contraseña con Copiar y Enviar por correo. */
export default function LinkClave({ userId, email, url: urlInicial, expira: expiraInicial, bienvenida, onCerrar }: Props) {
  const [url, setUrl] = useState(urlInicial)
  const [expira, setExpira] = useState(expiraInicial)
  const [copiado, setCopiado] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [pending, start] = useTransition()

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      momento('copiado')
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toastError('No se pudo copiar. Selecciona el link y cópialo a mano.')
    }
  }

  // Enviar genera un link nuevo (el de pantalla deja de servir) y lo muestra.
  const enviar = () => {
    start(async () => {
      try {
        const res = await generarLinkClave(userId, { enviarCorreo: true, bienvenida })
        if (res.error || !res.url || !res.expira) { toastError(res.error || 'No se pudo generar el link'); return }
        setUrl(res.url)
        setExpira(res.expira)
        if (res.correo === 'enviado') { setEnviado(true); toastOk(`Link enviado a ${email}`) }
        else toastError('No se pudo enviar el correo. Copia el link y mándalo por otro lado.')
      } catch {
        toastError('No se pudo enviar el correo')
      }
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate font-mono text-xs text-ch-cream bg-ch-dark border border-ch-border px-3 py-1.5 rounded-[2px] select-all">
          {url}
        </code>
        <button
          onClick={copiar}
          className="text-xs px-3 py-1.5 border border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-green/50 rounded-[2px] transition-colors whitespace-nowrap"
        >
          {copiado ? '✓ Copiado' : 'Copiar'}
        </button>
        <button
          onClick={enviar}
          disabled={pending || enviado}
          title={`Mandar el link a ${email}`}
          className="text-xs px-3 py-1.5 border border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-green/50 rounded-[2px] transition-colors whitespace-nowrap disabled:opacity-50"
        >
          {pending ? 'Enviando…' : enviado ? '✓ Enviado' : 'Enviar por correo'}
        </button>
        {onCerrar && (
          <button onClick={onCerrar} className="text-xs text-ch-subtle hover:text-ch-muted transition-colors">✕</button>
        )}
      </div>
      <p className="text-[10px] text-ch-subtle mt-1.5">
        Sirve una sola vez · vence el {venceEl(expira)} · generar otro invalida este
      </p>
    </div>
  )
}
