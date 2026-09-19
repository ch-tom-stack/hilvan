import { getPipeline, getMetricasCrm, getProspectoIdsConPendiente, getAprobacionesPendientes, getOperadoresCrm, getResumenSemana, getEstadoCotejo } from '@/app/actions/crm'
import { createClient } from '@/lib/supabase/server'
import { OPERADOR_EMAIL } from '@/lib/crm-asignacion'
import AvisoCotejo from '@/components/crm/AvisoCotejo'
import WhatsappSinVincular from '@/components/crm/WhatsappSinVincular'
import { getWhatsappDesconocidos } from '@/app/actions/whatsapp'
import PipelineCRM from './PipelineCRM'

export default async function CrmPage() {
  const supabase = await createClient()
  const [{ data: { user } }, prospectos, metricas, pendientesIds, pendientes, operadores, semana, cotejo, whatsapp] = await Promise.all([
    supabase.auth.getUser(),
    getPipeline(),
    getMetricasCrm(),
    getProspectoIdsConPendiente(),
    getAprobacionesPendientes(),
    getOperadoresCrm(),
    getResumenSemana(),
    getEstadoCotejo(),
    getWhatsappDesconocidos(),
  ])

  return (
    <div className="p-6 lg:p-10">
      {/* Antes del tablero: si las respuestas no están registradas, todo lo que
          viene abajo hay que leerlo sabiéndolo. */}
      <AvisoCotejo estado={cotejo} />
      <WhatsappSinVincular
        desconocidos={whatsapp}
        prospectos={prospectos
          .filter(p => p.etapa !== 'descartado')
          .map(p => ({ id: p.id, empresa: p.empresa }))
          .sort((a, b) => a.empresa.localeCompare(b.empresa, 'es'))}
      />
      <PipelineCRM
        prospectos={prospectos}
        metricas={metricas}
        pendientesIds={pendientesIds}
        totalBandeja={pendientes.length}
        usuarioId={user?.id ?? ''}
        operadores={operadores}
        semana={semana}
        esManager={user?.email?.trim().toLowerCase() === OPERADOR_EMAIL.tomas}
      />
    </div>
  )
}
