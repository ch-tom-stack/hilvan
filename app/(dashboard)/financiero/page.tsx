import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getDatosFinancieros, getResumenPeriodo, getPPMTasa, getPreviredMensual, getIUSCMensual } from '@/app/actions/financiero'
import { mesAnterior, mismoMesAñoAnterior } from '@/lib/periodos'
import EstadoResultados from '@/components/financiero/EstadoResultados'
import Link from 'next/link'

function periodoActual() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

interface Props {
  searchParams: Promise<{ mes?: string }>
}

export default async function FinancieroPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') redirect('/dashboard')

  const { mes: mesParam } = await searchParams
  const mes = mesParam ?? periodoActual()
  const mesAnt = mesAnterior(mes)
  const mesAñoAnt = mismoMesAñoAnterior(mes)

  const [ppmTasa, previredMensual, iuscMensual] = await Promise.all([getPPMTasa(), getPreviredMensual(), getIUSCMensual()])

  const [datos, anterior, añoAnterior] = await Promise.all([
    getDatosFinancieros(mes, ppmTasa, previredMensual, iuscMensual),
    getResumenPeriodo(mesAnt),
    getResumenPeriodo(mesAñoAnt),
  ])

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Financiero · Estado de resultados
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Finanzas
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/financiero/cobrar"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            Cobranza →
          </Link>
          <Link href="/financiero/flujo"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            Flujo →
          </Link>
          <Link href="/financiero/creditos"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            Créditos →
          </Link>
          <Link href="/financiero/inversiones"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            Inversiones →
          </Link>
        </div>
      </div>

      <EstadoResultados datos={datos} anterior={anterior} añoAnterior={añoAnterior} ppmTasa={ppmTasa} previredMensual={previredMensual} iuscMensual={iuscMensual} />
    </div>
  )
}
