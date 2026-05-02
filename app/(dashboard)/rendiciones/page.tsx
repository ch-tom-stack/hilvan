import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getRendiciones, getCotizacionesConEstructura,
  getCotizacionesParaRendiciones, getRendicionesSumasPorItem,
} from '@/app/actions/rendiciones'
import AdminRendiciones from '@/components/rendiciones/AdminRendiciones'
import type { Rendicion } from '@/types'

export default async function RendicionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  const esProductorOAdmin = profile?.rol === 'admin' || profile?.rol === 'productor'

  // Productores y admins van directo a la vista completa
  if (esProductorOAdmin) redirect('/rendiciones/admin')

  // Colaboradores: misma vista pero filtrada a sus propias rendiciones
  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('id, nombre')
    .eq('email', user.email!)
    .single()

  const rendiciones: Rendicion[] = colaborador
    ? await getRendiciones({ colaboradorId: colaborador.id })
    : []

  const cotizacionIds = [...new Set(rendiciones.map(r => r.cotizacion_id).filter(Boolean))]

  const [cotizaciones, cotizacionesForm, rendicionesPorItemSumas] = await Promise.all([
    getCotizacionesConEstructura(cotizacionIds),
    getCotizacionesParaRendiciones(),
    getRendicionesSumasPorItem(),
  ])

  const rendicionesPorItem: Record<string, Rendicion[]> = {}
  const rendicionesSinItem: Record<string, Rendicion[]> = {}
  for (const r of rendiciones) {
    if (r.cotizacion_item_id) {
      rendicionesPorItem[r.cotizacion_item_id] = [...(rendicionesPorItem[r.cotizacion_item_id] || []), r]
    } else if (r.cotizacion_id) {
      rendicionesSinItem[r.cotizacion_id] = [...(rendicionesSinItem[r.cotizacion_id] || []), r]
    }
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Rendiciones</p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Mis gastos</h1>
        </div>
      </div>
      <AdminRendiciones
        cotizaciones={cotizaciones as any}
        rendicionesPorItem={rendicionesPorItem}
        rendicionesSinItem={rendicionesSinItem}
        cotizacionesForm={cotizacionesForm}
        rendicionesPorItemSumas={rendicionesPorItemSumas}
        colaboradores={[]}
        colaboradorId={colaborador?.id}
        puedeAprobarPago={false}
        puedeGenerarLink={false}
      />
    </div>
  )
}
