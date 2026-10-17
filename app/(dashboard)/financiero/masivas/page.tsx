import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMasivas } from '@/app/actions/pagos'
import TransferenciasMasivas from '@/components/financiero/TransferenciasMasivas'

export default async function MasivasPage({ searchParams }: { searchParams: Promise<{ lote?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin' && profile?.rol !== 'contabilidad') redirect('/dashboard')

  const { lote } = await searchParams
  const datos = await getMasivas()

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Financiero · Pagos</p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Transferencias masivas</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/financiero/pagar"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            ← Cuentas por pagar
          </Link>
          <Link href="/financiero"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            ← Estado de resultados
          </Link>
        </div>
      </div>
      <TransferenciasMasivas datos={datos} loteAbierto={lote} />
    </div>
  )
}
