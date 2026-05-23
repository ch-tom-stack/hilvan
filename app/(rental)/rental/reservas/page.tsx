import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import GestionReservas from '@/components/rental/GestionReservas'
import type { Profile, RentalReserva } from '@/types'

type ReservaConJoins = RentalReserva & {
  equipo?: { codigo: string; nombre: string } | null
  maleta?: { codigo: string; nombre: string } | null
  cliente?: { nombre: string } | null
  solicitante?: { nombre: string; email: string } | null
}

export default async function ReservasPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>
}) {
  const { vista: vistaParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  const esAdmin = ['admin', 'productor'].includes(profile?.rol ?? '')
  const vista = (vistaParam === 'todas' && esAdmin) ? 'todas' : 'mias'

  const admin = createAdminClient()

  let reservas: ReservaConJoins[] = []

  if (vista === 'todas') {
    const { data } = await admin
      .from('rental_reservas')
      .select(`
        *,
        equipo:equipos(codigo, nombre),
        maleta:maletas(codigo, nombre),
        cliente:clientes(nombre)
      `)
      .order('created_at', { ascending: false })
    reservas = (data ?? []) as any
  } else {
    // Mis reservas por created_by (con fallback si columna no existe)
    const { data, error } = await admin
      .from('rental_reservas')
      .select(`*, equipo:equipos(codigo, nombre), maleta:maletas(codigo, nombre), cliente:clientes(nombre)`)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (!error) {
      reservas = (data ?? []) as any
    } else {
      // fallback: mostrar todas si created_by no existe aún
      const { data: todas } = await admin
        .from('rental_reservas')
        .select(`*, equipo:equipos(codigo, nombre), maleta:maletas(codigo, nombre), cliente:clientes(nombre)`)
        .order('created_at', { ascending: false })
      reservas = (todas ?? []) as any
    }
  }

  return (
    <div className="p-6 lg:p-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Rental · Reservas
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            {vista === 'todas' ? 'Todas las solicitudes' : 'Mis reservas'}
          </h1>
        </div>
        <Link
          href="/rental/reservas/nueva"
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium
                     text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors duration-200"
        >
          + Nueva solicitud
        </Link>
      </div>

      {/* Toggle admin */}
      {esAdmin && (
        <div className="flex gap-2 mb-8">
          <Link
            href="/rental/reservas"
            className={`px-4 py-2 font-body text-xs border transition-colors ${
              vista === 'mias'
                ? 'border-ch-green text-ch-cream bg-ch-surface'
                : 'border-ch-border text-ch-muted hover:text-ch-cream'
            }`}
          >
            Mis solicitudes
          </Link>
          <Link
            href="/rental/reservas?vista=todas"
            className={`px-4 py-2 font-body text-xs border transition-colors ${
              vista === 'todas'
                ? 'border-ch-green text-ch-cream bg-ch-surface'
                : 'border-ch-border text-ch-muted hover:text-ch-cream'
            }`}
          >
            Todas las solicitudes
          </Link>
        </div>
      )}

      <GestionReservas
        reservas={reservas}
        esAdmin={esAdmin && vista === 'todas'}
        vista={vista}
      />

    </div>
  )
}
