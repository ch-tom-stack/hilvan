import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import FichaColaborador from '@/components/colaboradores/FichaColaborador'
import { getColaborador, getTarifas, getContratos } from '@/app/actions/colaboradores'
import { getRendiciones, getCotizacionesParaRendiciones, getRendicionesSumasPorItem } from '@/app/actions/rendiciones'

export default async function ColaboradorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [colaborador, tarifas, contratos, cotizaciones, rendicionesPorItem] = await Promise.all([
    getColaborador(id).catch(() => null),
    getTarifas(id),
    getContratos(id),
    getCotizacionesParaRendiciones(),
    getRendicionesSumasPorItem(),
  ])

  if (!colaborador) notFound()

  const rendiciones = await getRendiciones({ colaboradorId: id })

  const { data: rodajes } = await supabase
    .from('rodajes')
    .select('id, nombre, fecha')
    .order('fecha', { ascending: false })
    .limit(50)

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-start justify-between mb-10 gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Colaboradores · Ficha
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            {colaborador.nombre}
          </h1>
          {colaborador.rut && (
            <p className="text-ch-muted font-body text-xs mt-1 font-mono">{colaborador.rut}</p>
          )}
        </div>
        <Link
          href="/colaboradores"
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors flex-shrink-0"
        >
          ← Colaboradores
        </Link>
      </div>

      <FichaColaborador
        colaborador={colaborador}
        tarifas={tarifas}
        contratos={contratos as any}
        rodajes={rodajes || []}
        cotizaciones={cotizaciones}
        rendiciones={rendiciones}
        rendicionesPorItem={rendicionesPorItem}
      />
    </div>
  )
}
