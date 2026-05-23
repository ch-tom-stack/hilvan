import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerRentalCotizacion, obtenerEquiposParaCotizacion } from '@/app/actions/rental'
import EditorCotizacion from '@/components/rental/EditorCotizacion'
import type { Profile, Maleta } from '@/types'

export default async function FichaCotizacionRentalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  let cotizacion: any = null
  try {
    cotizacion = await obtenerRentalCotizacion(id)
  } catch {
    // tabla no existe aún
  }

  if (!cotizacion) notFound()

  const admin = createAdminClient()
  const [equipos, maletasResult] = await Promise.all([
    obtenerEquiposParaCotizacion(),
    admin.from('maletas').select('id, codigo, nombre, descripcion, foto_url, foto_empaque, created_at').order('codigo'),
  ])

  return (
    <div className="p-6 lg:p-10">

      {/* Header */}
      <div className="flex items-start justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Rental · Cotización
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            {cotizacion.numero}
          </h1>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/api/rental/cotizaciones/${id}/pdf`}
            target="_blank"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body
                       text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors duration-200"
          >
            Descargar PDF
          </Link>
          <Link
            href="/rental/cotizaciones"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body
                       text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors duration-200"
          >
            ← Volver
          </Link>
        </div>
      </div>

      <EditorCotizacion
        cotizacion={cotizacion}
        equipos={equipos}
        maletas={(maletasResult.data ?? []) as Maleta[]}
      />

    </div>
  )
}
