import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types'

const modulos = [
  { codigo: 'CH-1', nombre: 'Equipos',      desc: 'Inventario, QR y disponibilidad',  href: '/equipos',      activo: true  },
  { codigo: 'CH-2', nombre: 'Cotizaciones', desc: 'Presupuestos y aprobaciones',       href: '/cotizaciones', activo: true  },
  { codigo: 'CH-3', nombre: 'Rodaje',       desc: 'Hojas de llamado y citaciones',     href: '/rodaje',       activo: false },
  { codigo: 'CH-4', nombre: 'Rendiciones',  desc: 'Gastos de colaboradores',           href: '/rendiciones',  activo: false },
  { codigo: 'CH-5', nombre: 'Financiero',   desc: 'Estado de resultados',              href: '/financiero',   activo: false },
  { codigo: 'CH-6', nombre: 'CRM',          desc: 'Clientes y proyectos',              href: '/crm',          activo: false },
]

function getSaludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single<Profile>()

  const nombre = profile?.nombre || user?.email?.split('@')[0] || 'admin'

  return (
    <div className="p-10 max-w-5xl">
      <div className="mb-14">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">{getSaludo()}</p>
        <h1 className="font-display italic text-6xl text-ch-cream leading-none capitalize">{nombre}</h1>
      </div>
      <div className="mb-5">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase">Módulos de Hilván</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {modulos.map((mod) => (
          mod.activo ? (
            <a key={mod.codigo} href={mod.href} className="border border-ch-border bg-ch-surface/50 p-6 hover:bg-ch-surface transition-colors duration-150 block">
              <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-4">{mod.codigo}</p>
              <h3 className="font-display text-2xl text-ch-cream italic mb-1">{mod.nombre}</h3>
              <p className="text-ch-muted font-body text-xs leading-relaxed">{mod.desc}</p>
              <div className="mt-5">
                <span className="text-[8px] font-body tracking-[0.4em] text-ch-green uppercase">Activo →</span>
              </div>
            </a>
          ) : (
            <div key={mod.codigo} className="border border-ch-border bg-ch-surface/50 p-6 opacity-40 select-none">
              <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-4">{mod.codigo}</p>
              <h3 className="font-display text-2xl text-ch-cream italic mb-1">{mod.nombre}</h3>
              <p className="text-ch-muted font-body text-xs leading-relaxed">{mod.desc}</p>
              <div className="mt-5">
                <span className="text-[8px] font-body tracking-[0.4em] text-ch-border uppercase">Próximamente</span>
              </div>
            </div>
          )
        ))}
      </div>

      <div className="pt-12 pb-4 flex justify-center">
        <img src="/logos/logo-horizontal-negro.png" alt="Casa Hiedra" className="h-5 w-auto opacity-20" />
      </div>
    </div>
  )
}
