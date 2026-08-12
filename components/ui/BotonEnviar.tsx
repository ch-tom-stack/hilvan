'use client'

import { useFormStatus } from 'react-dom'

/**
 * Botón de envío para formularios con server action directa.
 *
 * EXISTE POR UN BUG REAL. `<form action={serverAction}>` no deshabilita nada
 * mientras la acción corre: si tarda, no pasa NADA visible y la persona vuelve
 * a apretar. Cada click dispara otro envío.
 *
 * Pasó de verdad: el formulario de rodaje nuevo generó 18 rodajes idénticos en
 * 23 segundos, uno cada 1.2 s — la firma de alguien martillando un botón que
 * parecía muerto. 23 de 28 rodajes de la base salieron de ahí.
 *
 * `useFormStatus` sólo funciona en un componente HIJO del form, por eso esto es
 * un componente aparte y no un `disabled` puesto en la página.
 */
export default function BotonEnviar({
  children,
  pendiente,
  className = '',
}: {
  children: React.ReactNode
  /** Texto mientras envía. Sin esto el botón se apaga y no dice por qué. */
  pendiente?: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`disabled:opacity-50 disabled:cursor-not-allowed transition-opacity ch-press ${className}`}
    >
      {pending ? (pendiente ?? 'Enviando…') : children}
    </button>
  )
}
