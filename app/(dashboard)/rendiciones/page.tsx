import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getTodasRendiciones,
  getCotizacionesParaRendiciones,
  getGastosSumasPorItem,
} from '@/app/actions/rendiciones'
import AdminRendiciones from '@/components/rendiciones/AdminRendiciones'

export default async function RendicionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  const esProductorOAdmin = profile?.rol === 'admin' || profile?.rol === 'productor'

  if (esProductorOAdmin) redirect('/rendiciones/admin')

  // Colaboradores: cargar rendiciones donde tengan gastos propios
  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('id, nombre')
    .eq('email', user.email!)
    .single()

  const [rendiciones, cotizacionesForm, gastosSumasPorItem] = await Promise.all([
    getTodasRendiciones().catch(() => []),
    getCotizacionesParaRendiciones().catch(() => []),
    getGastosSumasPorItem().catch(() => ({})),
  ])

  // Filtrar solo rendiciones que contengan gastos del colaborador
  const rendicionesFiltradas = colaborador
    ? rendiciones
        .map(r => ({
          ...r,
          gastos: (r.gastos || []).filter(g => g.colaborador_id === colaborador.id),
        }))
        .filter(r => (r.gastos || []).length > 0)
    : []

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Rendiciones</p>
        <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Mis gastos</h1>
      </div>
      <AdminRendiciones
        rendiciones={rendicionesFiltradas}
        cotizacionesForm={cotizacionesForm as any}
        gastosSumasPorItem={gastosSumasPorItem}
        colaboradores={[]}
        colaboradorId={colaborador?.id}
        puedeAprobarPago={false}
        puedeGenerarLink={false}
      />
    </div>
  )
}
