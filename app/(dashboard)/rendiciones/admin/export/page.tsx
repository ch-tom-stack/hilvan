import { createClient } from '@/lib/supabase/server'
import ExportSantander from '@/components/rendiciones/ExportSantander'

export default async function ExportSantanderPage({
  searchParams,
}: {
  searchParams: Promise<{ rodaje?: string }>
}) {
  const { rodaje: rodajeId } = await searchParams
  const supabase = await createClient()

  const { data: rodajes } = await supabase
    .from('rodajes')
    .select('id, nombre, fecha')
    .order('fecha', { ascending: false })
    .limit(30)

  let rendiciones: any[] = []
  if (rodajeId) {
    const { data } = await supabase
      .from('rendiciones')
      .select('*, colaborador:colaboradores(nombre, rut, banco, tipo_cuenta, numero_cuenta, tipo_documento)')
      .eq('rodaje_id', rodajeId)
      .eq('estado', 'aprobada')
      .order('created_at', { ascending: false })
    rendiciones = data ?? []
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Rendiciones · Admin</p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Export Santander</h1>
        </div>
      </div>
      <ExportSantander rodajes={rodajes ?? []} rendiciones={rendiciones} rodajeFiltro={rodajeId} />
    </div>
  )
}
