import { createAdminClient } from '@/lib/supabase/admin'
import type { Equipo, CategoriaEquipo } from '@/types'
import CatalogoCliente from './CatalogoCliente'
import VideoPromoPopup from './VideoPromoPopup'
import BundleCamionBtn from './BundleCamionBtn'

export const metadata = {
  title: 'Arriendo de equipos — Casa Hiedra',
  description: 'Catálogo de equipos audiovisuales disponibles para arriendo. Cámaras, luces, audio y más.',
}

export default async function ArriendoPage() {
  const admin = createAdminClient()

  const [{ data: categorias }, { data: equiposData }] = await Promise.all([
    admin.from('categorias_equipo').select('*').eq('activa', true).order('orden'),
    admin.from('equipos').select('*, categoria:categorias_equipo(*)').eq('rentable', true).order('codigo'),
  ])

  const equipos = (equiposData ?? []) as (Equipo & { categoria?: CategoriaEquipo })[]
  const cats = (categorias ?? []) as CategoriaEquipo[]

  return (
    <div className="min-h-screen bg-ch-black text-ch-cream">
      <VideoPromoPopup />
      <BundleCamionBtn />

      {/* Header */}
      <header className="border-b border-ch-border px-6 py-4 flex items-center justify-between">
        <img src="/logos/logo-horizontal-negro.png" alt="Casa Hiedra" className="h-5 opacity-90 invert" />
        <span className="font-body text-[10px] tracking-[0.4em] uppercase text-ch-subtle">Arriendo de equipos</span>
      </header>

      {/* Hero */}
      <div className="border-b border-ch-border px-6 py-16 text-center">
        <p className="font-body text-[9px] tracking-[0.55em] uppercase text-ch-muted mb-4">Casa Hiedra · Rental</p>
        <h1 className="font-display italic text-5xl lg:text-7xl text-ch-cream leading-none mb-6">Equipos en arriendo</h1>
        <p className="font-body text-sm text-ch-muted max-w-md mx-auto leading-relaxed">
          Arriendo de equipos audiovisuales profesionales por jornada.
          Precios a consultar para paquetes o días múltiples.
        </p>
      </div>

      {/* Catálogo — maneja su propio layout según estado del carrito */}
      <div className="px-6 py-12 pb-24 lg:pb-12">
        <CatalogoCliente equipos={equipos} categorias={cats} />
      </div>

      {/* Footer */}
      <footer className="border-t border-ch-border px-6 py-8 text-center">
        <img src="/logos/logo-horizontal-negro.png" alt="Casa Hiedra" className="h-4 opacity-50 invert mx-auto mb-4" />
        <p className="font-body text-[10px] text-ch-subtle tracking-[0.3em]">Casa Hiedra · casahiedra.com</p>
      </footer>

    </div>
  )
}
