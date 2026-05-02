import { createClient } from '@/lib/supabase/server'
import { getRendiciones, getCotizacionesParaRendiciones, getRendicionesSumasPorItem } from '@/app/actions/rendiciones'
import Link from 'next/link'
import RendicionesColaborador from '@/components/rendiciones/RendicionesColaborador'

export default async function RendicionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  const esAdmin = profile?.rol === 'admin' || profile?.rol === 'productor'

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('id, nombre')
    .eq('email', user.email!)
    .single()

  const [cotizaciones, rendicionesPorItem, rendiciones] = await Promise.all([
    getCotizacionesParaRendiciones(),
    getRendicionesSumasPorItem(),
    colaborador ? getRendiciones({ colaboradorId: colaborador.id }) : Promise.resolve([]),
  ])

  return (
    <div>
      {esAdmin && (
        <div className="px-4 lg:px-10 pt-6 pb-0 max-w-lg mx-auto lg:max-w-none lg:mx-0">
          <Link href="/rendiciones/admin"
            className="inline-block border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 transition-colors mb-4">
            Vista admin →
          </Link>
        </div>
      )}
      <RendicionesColaborador
        colaboradorId={colaborador?.id}
        rendiciones={rendiciones}
        cotizaciones={cotizaciones}
        rendicionesPorItem={rendicionesPorItem}
      />
    </div>
  )
}
