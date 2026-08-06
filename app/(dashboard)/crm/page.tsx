import { getPipeline, getMetricasCrm, getProspectoIdsConPendiente, getAprobacionesPendientes } from '@/app/actions/crm'
import { createClient } from '@/lib/supabase/server'
import PipelineCRM from './PipelineCRM'

export default async function CrmPage() {
  const supabase = await createClient()
  const [{ data: { user } }, prospectos, metricas, pendientesIds, pendientes] = await Promise.all([
    supabase.auth.getUser(),
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
        usuarioId={user?.id ?? ''}
      />
    </div>
  )
}
