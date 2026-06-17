import { getPipeline, getMetricasCrm, getProspectoIdsConPendiente, getAprobacionesPendientes } from '@/app/actions/crm'
import PipelineCRM from './PipelineCRM'

export default async function CrmPage() {
  const [prospectos, metricas, pendientesIds, pendientes] = await Promise.all([
    getPipeline(),
    getMetricasCrm(),
    getProspectoIdsConPendiente(),
    getAprobacionesPendientes(),
  ])

  return (
    <div className="p-6 lg:p-10">
      <PipelineCRM
        prospectos={prospectos}
        metricas={metricas}
        pendientesIds={pendientesIds}
        totalBandeja={pendientes.length}
      />
    </div>
  )
}
