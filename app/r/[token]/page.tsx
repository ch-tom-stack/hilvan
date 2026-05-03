import { notFound } from 'next/navigation'
import { getInfoPorToken } from '@/app/actions/rendiciones'
import PortalRendicion from '@/components/rendiciones/PortalRendicion'

export default async function PortalExternoPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const info = await getInfoPorToken(token)

  if (!info) {
    return (
      <div className="min-h-screen bg-ch-black flex items-center justify-center p-6">
        <div className="text-center">
          <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-2">Hilván · Casa Hiedra</p>
          <h1 className="font-display italic text-3xl text-ch-cream mb-3">Link expirado</h1>
          <p className="font-body text-sm text-ch-muted">Solicita uno nuevo al equipo de producción.</p>
        </div>
      </div>
    )
  }

  return (
    <PortalRendicion
      rendicionId={info.rendicion.id}
      cotizacionNombre={info.rendicion.cotizacion?.nombre}
      cotizacionItem={info.cotizacionItem}
      colaboradorId={info.colaboradorId}
      email={info.email}
      gastosIniciales={info.gastos}
    />
  )
}
