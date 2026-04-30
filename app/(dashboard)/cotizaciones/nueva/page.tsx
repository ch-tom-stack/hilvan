import { getClientes, getProyectos } from '@/app/actions/cotizaciones'
import NuevaCotizacionForm from '@/components/cotizaciones/NuevaCotizacionForm'

export default async function NuevaCotizacionPage() {
  const [clientes, proyectos] = await Promise.all([
    getClientes(),
    getProyectos(),
  ])

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <p className="font-body text-xs tracking-widest uppercase text-ch-muted mb-1">
          Cotizaciones
        </p>
        <h1 className="font-display text-3xl text-ch-cream">Nueva cotización</h1>
      </div>
      <NuevaCotizacionForm clientes={clientes} proyectos={proyectos} />
    </div>
  )
}
