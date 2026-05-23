import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import NuevaCotizacionForm from '@/components/rental/NuevaCotizacionForm'
import type { Profile, Cliente } from '@/types'

export default async function NuevaCotizacionPage({
  searchParams,
}: {
  searchParams: Promise<{ reserva_id?: string }>
}) {
  const { reserva_id } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<Pick<Profile, 'rol'>>()

  if (!['admin', 'productor'].includes(profile?.rol ?? '')) {
    redirect('/rental')
  }

  const admin = createAdminClient()

  // Cargar datos de la reserva si viene con reserva_id
  let reservaData: any = null
  if (reserva_id) {
    const { data } = await admin
      .from('rental_reservas')
      .select(`
        id, fecha_inicio, fecha_fin, cliente_id,
        equipo:equipos(id, codigo, nombre, precio_jornada),
        maleta:maletas(id, codigo, nombre)
      `)
      .eq('id', reserva_id)
      .single()
    reservaData = data
  }

  const { data: clientes } = await admin
    .from('clientes')
    .select('id, nombre, empresa, email')
    .order('nombre')

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
          Rental · Cotizaciones
        </p>
        <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
          Nueva cotización
        </h1>
      </div>

      <NuevaCotizacionForm
        clientes={(clientes ?? []) as Cliente[]}
        reservaId={reserva_id ?? null}
        reservaData={reservaData}
      />
    </div>
  )
}
