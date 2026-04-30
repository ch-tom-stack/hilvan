import { getCotizacion } from '@/app/actions/cotizaciones'
import VistaClienteCotizacion from '@/components/cotizaciones/VistaClienteCotizacion'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function PreviewCotizacionPage({ params }: Props) {
  const { id } = await params
  const cotizacion = await getCotizacion(id)

  if (!cotizacion) notFound()

  return (
    <div>
      {/* Banner de preview */}
      <div className="sticky top-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-sans tracking-[0.3em] uppercase text-amber-700 font-semibold">
            Vista previa interna
          </span>
          <span className="text-xs text-amber-600 font-sans">
            — el cliente no ve esta barra ni puede aprobar desde aquí
          </span>
        </div>
      </div>

      <VistaClienteCotizacion cotizacion={cotizacion} token={null} preview />
    </div>
  )
}
