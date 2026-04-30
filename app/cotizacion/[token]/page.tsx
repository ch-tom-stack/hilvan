import { getCotizacionPorToken } from '@/app/actions/cotizaciones'
import VistaClienteCotizacion from '@/components/cotizaciones/VistaClienteCotizacion'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ token: string }>
}

export default async function CotizacionPublicaPage({ params }: Props) {
  const { token } = await params
  const cotizacion = await getCotizacionPorToken(token)

  if (!cotizacion) notFound()

  return <VistaClienteCotizacion cotizacion={cotizacion} token={token} />
}
