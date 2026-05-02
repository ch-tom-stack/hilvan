import { createClient } from '@/lib/supabase/server'
import { getRendiciones } from '@/app/actions/rendiciones'
import Link from 'next/link'
import RendicionesColaborador from '@/components/rendiciones/RendicionesColaborador'

export default async function RendicionesPage({
  searchParams,
}: {
  searchParams: Promise<{ rodaje?: string }>
}) {
  const { rodaje } = await searchParams
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

  // Vista colaborador
  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('id, nombre')
    .eq('email', user.email!)
    .single()

  const { data: rodajes } = await supabase
    .from('rodajes')
    .select('id, nombre, fecha')
    .order('fecha', { ascending: false })
    .limit(20)

  const rendiciones = colaborador
    ? await getRendiciones({ colaboradorId: colaborador.id, rodajeId: rodaje })
    : []

  return (
    <RendicionesColaborador
      colaboradorId={colaborador?.id}
      rendiciones={rendiciones}
      rodajes={rodajes || []}
      rodajeFiltro={rodaje}
    />
  )
}
