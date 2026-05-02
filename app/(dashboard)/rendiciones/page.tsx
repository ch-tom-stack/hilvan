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

  if (esAdmin) {
    return (
      <div className="p-6 lg:p-10 max-w-2xl">
        <h1 className="font-display italic text-4xl text-ch-cream mb-6">Rendiciones</h1>
        <Link href="/rendiciones/admin"
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-5 py-3 transition-colors">
          Vista admin →
        </Link>
      </div>
    )
  }

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
    <RendicionesColaborador
      colaboradorId={colaborador?.id}
      rendiciones={rendiciones}
      cotizaciones={cotizaciones}
      rendicionesPorItem={rendicionesPorItem}
    />
  )
}
