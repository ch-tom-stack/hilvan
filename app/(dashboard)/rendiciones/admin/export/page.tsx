import { createClient } from '@/lib/supabase/server'
import ExportSantander from '@/components/rendiciones/ExportSantander'
import Link from 'next/link'

export default async function ExportSantanderPage({
  searchParams,
}: {
  searchParams: Promise<{ cotizacion?: string }>
}) {
  const { cotizacion: cotizacionId } = await searchParams
  const supabase = await createClient()

  const { data: cotizaciones } = await supabase
    .from('cotizaciones')
    .select('id, nombre, estado, grupo:cotizacion_grupos(numero_base)')
    .in('estado', ['aprobada', 'en_produccion', 'cerrada'])
    .order('created_at', { ascending: false })
    .limit(50)

  let rendiciones: any[] = []
  if (cotizacionId) {
    const { data } = await supabase
      .from('rendiciones')
      .select('*, colaborador:colaboradores(nombre, rut, banco, tipo_cuenta, numero_cuenta, tipo_documento)')
      .eq('cotizacion_id', cotizacionId)
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
        <Link href="/rendiciones/admin"
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
          ← Volver
        </Link>
      </div>
      <ExportSantander cotizaciones={cotizaciones ?? []} rendiciones={rendiciones} cotizacionFiltro={cotizacionId} />
    </div>
  )
}
