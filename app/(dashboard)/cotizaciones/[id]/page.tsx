import { getCotizacion, getTarifasBase, getEquiposConRental } from '@/app/actions/cotizaciones'
import ConstructorCotizacion from '@/components/cotizaciones/ConstructorCotizacion'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CotizacionPage({ params }: Props) {
  const { id } = await params

  const [cotizacion, tarifas, equipos] = await Promise.all([
    getCotizacion(id).catch(() => null),
    getTarifasBase(),
    getEquiposConRental(),
  ])

  if (!cotizacion) notFound()

  return (
    <ConstructorCotizacion
      cotizacion={cotizacion}
      tarifas={tarifas ?? []}
      equipos={equipos ?? []}
    />
  )
}
