import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getRendicionesMensuales } from '@/app/actions/rendiciones_mensuales'
import RendicionMensualView from '@/components/rendiciones/RendicionMensualView'
import Link from 'next/link'

export default async function RendicionMensualPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).single()
  const esProductorOAdmin = profile?.rol === 'admin' || profile?.rol === 'productor'
  if (!esProductorOAdmin) redirect('/rendiciones')

  const rendiciones = await getRendicionesMensuales().catch(() => [])

  // Ensure current month exists — handled client-side via action on first load
  const periodoActual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  const rendicionActual = rendiciones.find(r => r.periodo === periodoActual) ?? null

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Rendiciones · Mensual</p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Gastos generales</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/rendiciones/admin"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            ← Admin
          </Link>
        </div>
      </div>

      <RendicionMensualView
        rendicionActual={rendicionActual}
        historial={rendiciones.slice(1)}
        periodoActual={periodoActual}
        usuarioNombre={profile?.nombre ?? user.email ?? ''}
        usuarioId={user.id}
        esAdmin={profile?.rol === 'admin'}
      />
    </div>
  )
}
