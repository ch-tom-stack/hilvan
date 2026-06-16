import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCuentasPorPagar } from '@/app/actions/financiero'
import CuentasPorPagar from '@/components/financiero/CuentasPorPagar'
import Link from 'next/link'

export default async function PagarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin' && profile?.rol !== 'contabilidad') redirect('/dashboard')

  const datos = await getCuentasPorPagar()

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Financiero · Pagos
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Cuentas por pagar
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/financiero/cobrar"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            ← Cobranza
          </Link>
          <Link href="/financiero"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            ← Estado de resultados
          </Link>
        </div>
      </div>

      <CuentasPorPagar datos={datos} />
    </div>
  )
}
