import Link from 'next/link'
import { getMisMisiones } from '@/app/actions/misiones'
import { hoyChile } from '@/lib/misiones'
import TarjetaMision from '@/components/misiones/TarjetaMision'

/**
 * El aviso de misiones, arriba del dashboard.
 *
 * Es lo primero que se ve al entrar, y por eso es un bloque de la página y no
 * un modal: interrumpir todos los días por lo mismo es como se enseña a cerrar
 * sin leer. Si no hay misiones vivas no se renderiza nada — un espacio rotulado
 * "misiones" y vacío es una tarea pendiente en la cara.
 */
export default async function AvisoMisiones() {
  const mias = await getMisMisiones()
  if (!mias) return null

  const hoy = hoyChile()

  // Solo lo que toca ahora: la de hoy, y las que sobrevivieron un día libre.
  // Las de días siguientes ya están despachadas pero se ven en /perfil — el
  // dashboard muestra el presente, no la agenda completa.
  const deHoy = mias.diarias.filter(m => m.fecha_objetivo <= hoy && m.vigente)
  const semanal = mias.semanal

  if (deHoy.length === 0 && !semanal) return null

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="font-body text-[9px] tracking-[0.5em] uppercase text-ch-subtle">
          Tu misión
        </h2>
        <Link
          href="/perfil"
          className="ch-press font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream transition-colors"
        >
          Ver la semana →
        </Link>
      </div>

      <div className="space-y-2">
        {deHoy.map(m => <TarjetaMision key={m.id} mision={m} />)}

        {semanal && (
          <div className="pt-1">
            <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-subtle mb-2">
              Esta semana
            </p>
            <TarjetaMision mision={semanal} />
          </div>
        )}
      </div>
    </section>
  )
}
