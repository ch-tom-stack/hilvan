import { createAdminClient } from '@/lib/supabase/admin'
import type { Equipo, CategoriaEquipo } from '@/types'
import CatalogoCliente from './CatalogoCliente'

export const metadata = {
  title: 'Arriendo de equipos — Casa Hiedra',
  description: 'Catálogo de equipos audiovisuales disponibles para arriendo. Cámaras, luces, audio y más.',
}

export default async function ArriendoPage() {
  const admin = createAdminClient()

  const [{ data: categorias }, { data: equiposData }] = await Promise.all([
    admin
      .from('categorias_equipo')
      .select('*')
      .eq('activa', true)
      .order('orden'),
    admin
      .from('equipos')
      .select('*, categoria:categorias_equipo(*)')
      .eq('rentable', true)
      .order('codigo'),
  ])

  const equipos = (equiposData ?? []) as (Equipo & { categoria?: CategoriaEquipo })[]
  const cats = (categorias ?? []) as CategoriaEquipo[]

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

      {/* Catálogo interactivo */}
      <div className="max-w-6xl mx-auto px-6 py-12 lg:pr-96">
        <CatalogoCliente equipos={equipos} categorias={cats} />

        {/* CTA estático (solo cuando no hay carrito activo) */}
        <div className="mt-16 border border-ch-border bg-ch-surface/20 p-10 text-center">
          <p className="font-body text-[9px] tracking-[0.5em] uppercase text-ch-muted mb-4">
            ¿Necesitas algo específico?
          </p>
          <h2 className="font-display italic text-3xl text-ch-cream mb-3 leading-none">
            Escríbenos
          </h2>
          <p className="font-body text-sm text-ch-muted mb-8 max-w-sm mx-auto leading-relaxed">
            Agrega equipos a tu selección arriba para calcular el total, o contáctanos directamente.
          </p>
          <a
            href="mailto:rental@casahiedra.com?subject=Consulta%20arriendo%20de%20equipos"
            className="inline-block font-body text-[10px] tracking-[0.4em] uppercase px-8 py-3.5 border border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-muted transition-colors"
          >
            rental@casahiedra.com
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
