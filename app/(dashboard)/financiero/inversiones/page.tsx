import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getInversiones } from '@/app/actions/inversiones'
import ListaInversiones from '@/components/financiero/ListaInversiones'
import Link from 'next/link'

export default async function InversionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin' && profile?.rol !== 'contabilidad') redirect('/dashboard')

  const inversiones = await getInversiones()

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Financiero · Inversiones
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Inversiones
          </h1>
        </div>
        <Link href="/financiero"
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
          ← Estado de resultados
        </Link>
      </div>

      <ListaInversiones inversiones={inversiones} />
    </div>
  )
}
