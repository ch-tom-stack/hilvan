import { getPipeline, getMetricasCrm, getProspectoIdsConPendiente, getAprobacionesPendientes, getOperadoresCrm } from '@/app/actions/crm'
import { createClient } from '@/lib/supabase/server'
import { OPERADOR_EMAIL } from '@/lib/crm-asignacion'
import PipelineCRM from './PipelineCRM'

export default async function CrmPage() {
  const supabase = await createClient()
  const [{ data: { user } }, prospectos, metricas, pendientesIds, pendientes, operadores] = await Promise.all([
    supabase.auth.getUser(),
    getPipeline(),
    getMetricasCrm(),
    getProspectoIdsConPendiente(),
    getAprobacionesPendientes(),
    getOperadoresCrm(),
  ])

  return (
    <div className="p-6 lg:p-10">
      <PipelineCRM
        prospectos={prospectos}
        metricas={metricas}
        pendientesIds={pendientesIds}
        totalBandeja={pendientes.length}
        usuarioId={user?.id ?? ''}
        operadores={operadores}
        esManager={user?.email?.trim().toLowerCase() === OPERADOR_EMAIL.tomas}
      />
    </div>
  )
}
