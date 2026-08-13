import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Profile } from '@/types'
import AvisoMisiones from '@/components/misiones/AvisoMisiones'
import MuroReconocimientos from '@/components/reconocimientos/MuroReconocimientos'

const MODULOS = [
  { nombre: 'Cotizaciones', desc: 'Presupuestos y aprobaciones',      href: '/cotizaciones' },
  { nombre: 'Rodajes',      desc: 'Hojas de llamado y citaciones',    href: '/rodaje'       },
  { nombre: 'Centro de costos', desc: 'Gastos de colaboradores',      href: '/costos/admin' },
  { nombre: 'Equipos',      desc: 'Inventario, QR y disponibilidad',  href: '/equipos'      },
  { nombre: 'Colaboradores',desc: 'Equipo técnico y contratos',       href: '/colaboradores' },
  { nombre: 'Clientes',     desc: 'Cartera y proyectos',              href: '/clientes'     },
]

function getSaludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

function getFecha() {
  const now = new Date()
  const dia = now.toLocaleDateString('es-CL', { weekday: 'long' })
  const fecha = now.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), fecha }
}

function getMiniCalendario() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()

  const firstDay = new Date(year, month, 1).getDay() // 0=Dom
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Ajustar para semana lunes-domingo
  const startOffset = (firstDay + 6) % 7

  const cells: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // Completar última fila
  while (cells.length % 7 !== 0) cells.push(null)

  const mesLabel = now.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  return { cells, today, mesLabel }
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
  const { dia, fecha } = getFecha()
  const { cells, today, mesLabel } = getMiniCalendario()

  return (
    <div className="p-6 lg:p-10 max-w-6xl">

      {/* Header */}
      <div className="mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
            {getSaludo()}
          </p>
          <h1 className="font-display italic text-5xl lg:text-6xl text-ch-cream leading-none capitalize">
            {nombre}
          </h1>
        </div>
        <div className="text-right">
          <p className="text-ch-muted font-body text-[10px] tracking-[0.3em] uppercase">{dia}</p>
          <p className="text-ch-cream text-sm font-body mt-0.5">{fecha}</p>
        </div>
      </div>

      {/* Lo primero al entrar: tu misión de hoy. */}
      <AvisoMisiones />

      {/* Cuerpo: módulos + calendario */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-8 items-start">

        {/* Módulos */}
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-4">
            Módulos
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MODULOS.map((mod, i) => (
              <Link
                key={mod.href}
                href={mod.href}
                style={{ '--i': i } as React.CSSProperties}
                className="border border-ch-border bg-ch-surface/30 p-5 hover:bg-ch-surface/60 hover:border-ch-green/40 transition-colors duration-150 block group ch-nudge-host ch-fade-up ch-stagger"
              >
                <h3 className="font-display text-xl text-ch-cream italic mb-1 group-hover:text-ch-cream">
                  {mod.nombre}
                </h3>
                <p className="text-ch-muted font-body text-xs leading-relaxed">{mod.desc}</p>
                <div className="mt-4">
                  <span className="text-[8px] font-body tracking-[0.4em] text-ch-green uppercase group-hover:text-ch-green-light transition-colors">
                    Abrir <span className="ch-nudge inline-block">→</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Mini calendario */}
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-4">
            Calendario
          </p>
          <div className="border border-ch-border border-dashed bg-ch-surface/10 p-5 select-none">

            {/* Mes y año */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-ch-cream font-body capitalize">{mesLabel}</p>
              <span className="text-[8px] font-body tracking-[0.3em] uppercase text-ch-subtle">
                Próximamente
              </span>
            </div>

            {/* Días de semana */}
            <div className="grid grid-cols-7 mb-2">
              {['L','M','X','J','V','S','D'].map(d => (
                <div key={d} className="text-center text-[9px] font-body text-ch-subtle pb-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Celdas del mes */}
            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((day, i) => (
                <div
                  key={i}
                  className={`text-center text-[11px] font-body py-1 rounded-[2px] ${
                    day === null
                      ? ''
                      : day === today
                      ? 'bg-ch-green/20 text-ch-green font-medium'
                      : 'text-ch-muted'
                  }`}
                >
                  {day ?? ''}
                </div>
              ))}
            </div>

            <p className="text-[10px] text-ch-subtle mt-4 leading-relaxed">
              El módulo de calendario completo estará disponible próximamente.
            </p>
          </div>
        </div>

      </div>

      {/* Al pie: un reconocimiento no es una tarea y no compite con el día. */}
      <MuroReconocimientos />

      <div className="pt-14 pb-4 flex justify-center">
        <img src="/logos/logo-horizontal-negro.png" alt="Casa Hiedra" className="h-5 w-auto opacity-20" />
      </div>
    </div>
  )
}
