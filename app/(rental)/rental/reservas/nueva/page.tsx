import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import FormularioReserva from '@/components/rental/FormularioReserva'
import type { Profile, Equipo, Maleta, CategoriaEquipo, Cliente } from '@/types'

export default async function NuevaReservaPage({
  searchParams,
}: {
  searchParams: Promise<{ equipo_id?: string; maleta_id?: string }>
}) {
  const { equipo_id, maleta_id } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<Pick<Profile, 'rol'>>()

  const esAdmin = ['admin', 'productor'].includes(profile?.rol ?? '')

  const admin = createAdminClient()

  const [equiposResult, maletasResult, clientesResult] = await Promise.all([
    admin
      .from('equipos')
      .select('*, categoria:categorias_equipo(nombre)')
      .eq('rentable', true)
      .order('codigo'),
    admin
      .from('maletas')
      .select('id, codigo, nombre, descripcion, foto_url, foto_empaque, created_at')
      .order('codigo'),
    esAdmin
      ? admin.from('clientes').select('id, nombre, empresa, email').order('nombre')
      : { data: [] },
  ])

  return (
    <div className="p-6 lg:p-10">

      {/* Header */}
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
          Rental · Reservas
        </p>
        <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
          Nueva solicitud
        </h1>
      </div>

      <FormularioReserva
        equipos={(equiposResult.data ?? []) as (Equipo & { categoria?: CategoriaEquipo })[]}
        maletas={(maletasResult.data ?? []) as Maleta[]}
        clientes={(clientesResult.data ?? []) as Cliente[]}
        defaultEquipoId={equipo_id ?? null}
        defaultMaletaId={maleta_id ?? null}
        esAdmin={esAdmin}
      />

    </div>
  )
}
