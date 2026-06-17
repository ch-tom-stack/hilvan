import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getResumenContadorEstimado } from '@/app/actions/financiero'
import { mesAnterior, mesSiguiente } from '@/lib/periodos'
import ResumenContador from '@/components/financiero/ResumenContador'
import Link from 'next/link'

function periodoActual() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
}

interface Props {
  searchParams: Promise<{ mes?: string }>
}

export default async function ContadorPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin' && profile?.rol !== 'contabilidad') redirect('/dashboard')

  const { mes: mesParam } = await searchParams
  const mes = mesParam ?? periodoActual()

  const datos = await getResumenContadorEstimado(mes)

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Financiero · Contador
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Para el contador
          </h1>
          <p className="font-body text-xs text-ch-muted mt-2 capitalize">{formatMes(mes)}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href={`/financiero/contador?mes=${mesAnterior(mes)}`}
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-4 py-3 transition-colors">
            ← Mes anterior
          </Link>
          <Link href={`/financiero/contador?mes=${mesSiguiente(mes)}`}
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-4 py-3 transition-colors">
            Mes siguiente →
          </Link>
          <Link href="/financiero"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            ← Estado de resultados
          </Link>
        </div>
      </div>

      <ResumenContador datos={datos} />
    </div>
  )
}
