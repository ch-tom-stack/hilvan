import { createAdminClient } from '@/lib/supabase/admin'
import type { Equipo, CategoriaEquipo } from '@/types'
import Link from 'next/link'

export const metadata = {
  title: 'Arriendo de equipos — Casa Hiedra',
  description: 'Catálogo de equipos audiovisuales disponibles para arriendo. Cámaras, luces, audio y más.',
}

export default async function ArriendoPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>
}) {
  const { categoria } = await searchParams
  const admin = createAdminClient()

  const [{ data: categorias }, equiposResult] = await Promise.all([
    admin
      .from('categorias_equipo')
      .select('*')
      .eq('activa', true)
      .order('orden'),
    (async () => {
      let q = admin
        .from('equipos')
        .select('*, categoria:categorias_equipo(*)')
        .eq('rentable', true)
        .order('codigo')
      if (categoria) q = q.eq('categoria_codigo', categoria)
      return q
    })(),
  ])

  const equipos = (equiposResult.data ?? []) as (Equipo & { categoria?: CategoriaEquipo })[]
  const cats = (categorias ?? []) as CategoriaEquipo[]

  // Solo categorías que tienen al menos un equipo rentable
  const categoriasConEquipos = cats.filter(c =>
    (equiposResult.data ?? []).some((e: any) => e.categoria_codigo === c.codigo)
  )

  return (
    <div className="min-h-screen bg-ch-black text-ch-cream">

      {/* Header */}
      <header className="border-b border-ch-border px-6 py-4 flex items-center justify-between">
        <img
          src="/logos/logo-horizontal-negro.png"
          alt="Casa Hiedra"
          className="h-5 opacity-90 invert"
        />
        <span className="font-body text-[10px] tracking-[0.4em] uppercase text-ch-subtle">
          Arriendo de equipos
        </span>
      </header>

      {/* Hero */}
      <div className="border-b border-ch-border px-6 py-16 text-center">
        <p className="font-body text-[9px] tracking-[0.55em] uppercase text-ch-muted mb-4">
          Casa Hiedra · Rental
        </p>
        <h1 className="font-display italic text-5xl lg:text-7xl text-ch-cream leading-none mb-6">
          Equipos en arriendo
        </h1>
        <p className="font-body text-sm text-ch-muted max-w-md mx-auto leading-relaxed">
          Arriendo de equipos audiovisuales profesionales por jornada.
          Precios a consultar para paquetes o días múltiples.
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Filtros */}
        {categoriasConEquipos.length > 1 && (
          <div className="flex gap-2 mb-10 flex-wrap">
            <Link
              href="/arriendo"
              className={`px-4 py-2 font-body text-xs border transition-colors ${
                !categoria
                  ? 'border-ch-green text-ch-cream bg-ch-surface'
                  : 'border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-muted'
              }`}
            >
              Todos
            </Link>
            {categoriasConEquipos.map(cat => (
              <Link
                key={cat.codigo}
                href={`/arriendo?categoria=${cat.codigo}`}
                className={`px-4 py-2 font-body text-xs border transition-colors ${
                  categoria === cat.codigo
                    ? 'border-ch-green text-ch-cream bg-ch-surface'
                    : 'border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-muted'
                }`}
              >
                {cat.nombre}
              </Link>
            ))}
          </div>
        )}

        {/* Grid */}
        {equipos.length === 0 ? (
          <div className="border border-dashed border-ch-border p-20 text-center">
            <p className="font-body text-sm text-ch-muted mb-1">
              No hay equipos disponibles{categoria ? ' en esta categoría' : ''}.
            </p>
            <p className="font-body text-xs text-ch-subtle">
              Contáctanos para consultar disponibilidad.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {equipos.map(eq => {
              const disponible = eq.estado === 'disponible'
              return (
                <div
                  key={eq.id}
                  className={`border bg-ch-surface/30 overflow-hidden transition-colors ${
                    disponible
                      ? 'border-ch-border hover:bg-ch-surface/60'
                      : 'border-ch-border opacity-50'
                  }`}
                >
                  {/* Imagen */}
                  {eq.fotos?.[0] || eq.foto_url ? (
                    <div className="relative">
                      <img
                        src={(eq.fotos?.[0] || eq.foto_url)!}
                        alt={eq.nombre}
                        className="w-full h-52 object-cover"
                      />
                      {!disponible && (
                        <div className="absolute top-3 left-3 bg-ch-black/80 border border-ch-border px-2 py-1">
                          <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-gold">
                            No disponible
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative w-full h-52 bg-ch-surface flex items-center justify-center">
                      <span className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-subtle">
                        Sin foto
                      </span>
                      {!disponible && (
                        <div className="absolute top-3 left-3 bg-ch-black/80 border border-ch-border px-2 py-1">
                          <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-gold">
                            No disponible
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Info */}
                  <div className="p-5">
                    <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">
                      {eq.codigo}{eq.categoria?.nombre ? ` · ${eq.categoria.nombre}` : ''}
                    </p>
                    <h3 className="font-display italic text-xl text-ch-cream mb-1 leading-tight">
                      {eq.nombre}
                    </h3>
                    {(eq.marca || eq.modelo) && (
                      <p className="font-body text-xs text-ch-subtle mb-2">
                        {[eq.marca, eq.modelo].filter(Boolean).join(' ')}
                      </p>
                    )}
                    {eq.descripcion && (
                      <p className="font-body text-xs text-ch-muted leading-relaxed mb-3 line-clamp-2">
                        {eq.descripcion}
                      </p>
                    )}
                    <p className="font-body text-xs text-ch-muted">
                      {eq.precio_jornada && eq.precio_jornada > 0
                        ? `$${eq.precio_jornada.toLocaleString('es-CL')} / jornada`
                        : 'Precio a consultar'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* CTA Contacto */}
        <div className="mt-16 border border-ch-border bg-ch-surface/20 p-10 text-center">
          <p className="font-body text-[9px] tracking-[0.5em] uppercase text-ch-muted mb-4">
            ¿Te interesa algún equipo?
          </p>
          <h2 className="font-display italic text-3xl text-ch-cream mb-3 leading-none">
            Cotiza tu arriendo
          </h2>
          <p className="font-body text-sm text-ch-muted mb-8 max-w-sm mx-auto leading-relaxed">
            Escríbenos con los equipos que necesitas, las fechas y te respondemos a la brevedad.
          </p>
          <a
            href="mailto:rental@casahiedra.com?subject=Consulta%20arriendo%20de%20equipos&body=Hola%2C%20me%20interesa%20arrendar%20los%20siguientes%20equipos%3A%0A%0A-%20%0A%0AFechas%3A%0A%0AGracias"
            className="inline-block font-body text-[10px] tracking-[0.4em] uppercase px-8 py-3.5 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors"
          >
            Solicitar cotización
          </a>
        </div>

      </div>

      {/* Footer */}
      <footer className="border-t border-ch-border px-6 py-8 text-center mt-8">
        <img
          src="/logos/logo-horizontal-negro.png"
          alt="Casa Hiedra"
          className="h-4 opacity-50 invert mx-auto mb-4"
        />
        <p className="font-body text-[10px] text-ch-subtle tracking-[0.3em]">
          Casa Hiedra · casahiedra.com
        </p>
      </footer>

    </div>
  )
}
