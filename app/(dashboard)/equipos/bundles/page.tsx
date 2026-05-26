import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { listarBundles } from '@/app/actions/bundles'
import { getCategorias } from '@/app/actions/equipos'
import BundlesManager from '@/components/equipos/BundlesManager'
import { createAdminClient } from '@/lib/supabase/admin'

async function listarEquiposSimple() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('equipos')
    .select('id, codigo, nombre, precio_jornada')
    .order('codigo')
  return data ?? []
}

export default async function BundlesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [bundles, equipos] = await Promise.all([
    listarBundles(),
    listarEquiposSimple(),
  ])

  return (
    <div className="p-6 lg:p-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
            Equipos · Bundles
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Bundles
          </h1>
        </div>
        <div className="flex gap-3">
          <Link
            href="/equipos"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body
                       text-[10px] tracking-[0.35em] uppercase px-5 py-3
                       transition-colors duration-200"
          >
            ← Equipos
          </Link>
        </div>
      </div>

      <BundlesManager bundles={bundles} equipos={equipos} />
    </div>
  )
}
