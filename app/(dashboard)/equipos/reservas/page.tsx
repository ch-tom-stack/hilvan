import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listarRentalReservas } from '@/app/actions/rental'
import TablaReservas from '@/components/equipos/TablaReservas'
import Link from 'next/link'

export default async function ReservasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<{ rol: string }>()

  const esProductorOAdmin = profile?.rol === 'admin' || profile?.rol === 'productor'

  // Fetch para el formulario: equipos rentables + maletas + clientes
  const [reservas, equiposData, maletasData, clientesData] = await Promise.all([
    listarRentalReservas().catch(() => []),
    supabase.from('equipos').select('id, codigo, nombre').eq('rentable', true).order('codigo').then(r => r.data ?? []),
    supabase.from('maletas').select('id, codigo, nombre').order('codigo').then(r => r.data ?? []),
    supabase.from('clientes').select('id, nombre').order('nombre').then(r => r.data ?? []),
  ])

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Equipos · Reservas</p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Bundles</h1>
        </div>
        <Link
          href="/equipos"
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors"
        >
          ← Equipos
        </Link>
      </div>

      <TablaReservas
        reservas={reservas}
        equipos={equiposData}
        maletas={maletasData}
        clientes={clientesData}
        puedeGestionar={esProductorOAdmin}
      />
    </div>
  )
}
