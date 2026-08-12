'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { getResumen, type Resumen as Datos, type Ventana } from '@/app/actions/medallas'
import { contar } from '@/lib/animar'
import { formatFecha } from '@/lib/fechas'

const VENTANAS: { clave: Ventana; label: string }[] = [
  { clave: 'dia',    label: 'Hoy' },
  { clave: 'semana', label: 'Semana' },
  { clave: 'mes',    label: 'Mes' },
]

/**
 * Qué hiciste hoy, esta semana o este mes.
 *
 * El ritmo responde "¿cómo vengo?" sobre diez días hábiles; esto responde
 * "¿qué hice?" sobre la ventana que elijas. Son preguntas distintas y por eso
 * no se fusionaron: una es tendencia, la otra es inventario.
 *
 * Arranca en semana y no en día: un día suelto casi siempre se ve pobre —una
 * mañana de reuniones da cero— y la primera lectura no debería desanimar.
 */
export default function Resumen() {
  const [ventana, setVentana] = useState<Ventana>('semana')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [, startTransition] = useTransition()
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let vivo = true
    startTransition(async () => {
      const d = await getResumen(ventana).catch(() => null)
      if (vivo && d) setDatos(d)
    })
    return () => { vivo = false }
  }, [ventana])

  useEffect(() => {
    if (datos) contar(ref.current, datos.total, n => String(Math.round(n)))
  }, [datos])

  return (
    <div className="border border-ch-border bg-ch-black/20 p-4 mt-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Lo que hiciste</p>
        <div className="flex border border-ch-border">
          {VENTANAS.map(v => (
            <button
              key={v.clave}
              onClick={() => setVentana(v.clave)}
              className={`font-body text-[9px] tracking-[0.2em] uppercase px-3 py-1.5 transition-colors ${
                ventana === v.clave ? 'bg-ch-surface text-ch-cream' : 'text-ch-muted hover:text-ch-cream'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {!datos ? null : datos.total === 0 ? (
        <p className="font-body text-xs text-ch-subtle italic">
          {ventana === 'dia' ? 'Todavía nada hoy.' : 'Nada registrado en esta ventana.'}
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2.5">
            <p ref={ref} className="font-display italic text-3xl text-ch-cream leading-none tabular-nums">
              {datos.total}
            </p>
            <span className="font-body text-[10px] tracking-[0.2em] uppercase text-ch-subtle">
              {datos.total === 1 ? 'cosa hecha' : 'cosas hechas'}
            </span>
          </div>
          {/* El desglose importa más que el total: 12 contactos y 12 gastos
              cargados son la misma cifra y semanas completamente distintas. */}
          <ul className="mt-2.5 space-y-1">
            {datos.detalle.map((d, i) => (
              <li
                key={d.etiqueta}
                style={{ ['--i' as string]: i }}
                className="flex items-baseline gap-2 ch-fade-up ch-stagger"
              >
                <span className="font-body text-sm text-ch-cream tabular-nums w-7 shrink-0">{d.n}</span>
                <span className="font-body text-[11px] text-ch-muted">{d.etiqueta}</span>
              </li>
            ))}
          </ul>
          {ventana !== 'dia' && (
            <p className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle mt-2.5">
              desde el {formatFecha(datos.desde)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
