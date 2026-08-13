import { getReconocimientos, getDestinatarios } from '@/app/actions/reconocimientos'
import Pergamino from '@/components/ui/Pergamino'
import EscribirReconocimiento from '@/components/reconocimientos/EscribirReconocimiento'
import { parseFechaLocal } from '@/lib/fechas'

function cuando(iso: string): string {
  const d = parseFechaLocal(iso.slice(0, 10))
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
}

/**
 * Lo único que ve todo el equipo.
 *
 * Las medallas y las misiones diarias de cada uno siguen siendo de cada uno.
 * Acá solo entran las menciones escritas a mano — lo especial se ve, lo diario
 * no. Sin ese umbral el muro se llena de logros menores ajenos y termina
 * leyéndose como una tabla de comparación, que es justo lo que este sistema
 * evita en todas partes.
 *
 * Va al pie del dashboard, después de los módulos: un reconocimiento no es una
 * tarea y no debe competir con el trabajo del día. Es lo último que se ve, que
 * para esto es un buen lugar.
 */
export default async function MuroReconocimientos() {
  const [reconocimientos, destinatarios] = await Promise.all([
    getReconocimientos(),
    getDestinatarios(),
  ])

  // Sin menciones y sin poder escribirlas no hay nada que mostrar. Un muro
  // vacío rotulado "reconocimientos" es una ausencia señalada.
  if (reconocimientos.length === 0 && destinatarios.length === 0) return null

  return (
    <div className="mt-12 space-y-4">
      {reconocimientos.length > 0 ? (
        <Pergamino titulo="Reconocimientos" meta={`${reconocimientos.length}`}>
          <div className="space-y-8">
            {reconocimientos.map(r => (
              <article key={r.id}>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <p className="font-display italic text-xl text-ch-cream leading-tight">
                    {r.titulo}
                  </p>
                  <span className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-gold">
                    {r.persona}
                  </span>
                </div>
                <p className="font-body text-[13px] text-ch-muted leading-relaxed mt-2.5 max-w-prose">
                  {r.texto}
                </p>
                <p className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle mt-3">
                  {r.otorgado_por_nombre} · {cuando(r.created_at)}
                </p>
              </article>
            ))}
          </div>
        </Pergamino>
      ) : (
        <p className="font-body text-[10px] tracking-[0.2em] uppercase text-ch-subtle">
          Todavía no hay menciones
        </p>
      )}

      <EscribirReconocimiento destinatarios={destinatarios} />
    </div>
  )
}
