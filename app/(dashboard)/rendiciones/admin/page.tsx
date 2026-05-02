import {
  getTodasRendiciones, getCotizacionesConEstructura,
  getCotizacionesParaRendiciones, getRendicionesSumasPorItem,
} from '@/app/actions/rendiciones'
import AdminRendiciones from '@/components/rendiciones/AdminRendiciones'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Rendicion } from '@/types'

export default async function AdminRendicionesPage() {
  let rendiciones: Rendicion[] = []
  let dbError: string | null = null

  try {
    rendiciones = await getTodasRendiciones()
  } catch (e: any) {
    dbError = e?.message || String(e)
  }

  const supabase = await createClient()

  // IDs únicos de cotizaciones con rendiciones
  const cotizacionIds = [...new Set(rendiciones.map(r => r.cotizacion_id).filter(Boolean))]

  // Cargar en paralelo
  const [cotizaciones, cotizacionesForm, rendicionesPorItemSumas, { data: colaboradores }] = await Promise.all([
    getCotizacionesConEstructura(cotizacionIds),
    getCotizacionesParaRendiciones(),
    getRendicionesSumasPorItem(),
    supabase.from('colaboradores').select('id, nombre').order('nombre'),
  ])

  // Agrupar rendiciones por item o sin item
  const rendicionesPorItem: Record<string, Rendicion[]> = {}
  const rendicionesSinItem: Record<string, Rendicion[]> = {}

  for (const r of rendiciones) {
    if (r.cotizacion_item_id) {
      rendicionesPorItem[r.cotizacion_item_id] = [...(rendicionesPorItem[r.cotizacion_item_id] || []), r]
    } else if (r.cotizacion_id) {
      rendicionesSinItem[r.cotizacion_id] = [...(rendicionesSinItem[r.cotizacion_id] || []), r]
    }
  }

  const totalEnviado = rendiciones.filter(r => r.estado === 'enviada').reduce((s, r) => s + r.monto, 0)
  const hoy = new Date().toISOString().slice(0, 10)

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Rendiciones · Admin</p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Revisión</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/rendiciones/admin/export"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            Exportar →
          </Link>
          <Link href="/rendiciones"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            ← Volver
          </Link>
        </div>
      </div>

      {dbError && (
        <div className="border border-red-500/40 bg-red-500/10 p-4 mb-8 font-mono text-xs text-red-400 break-all">
          Error DB: {dbError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Por revisar', value: rendiciones.filter(r => r.estado === 'enviada' && r.origen === 'externo').length, color: 'text-blue-400' },
          { label: 'Por pagar', value: rendiciones.filter(r => r.estado === 'enviada' || r.estado === 'aprobada').length, color: 'text-amber-400' },
          { label: 'Total por pagar', value: `$${totalEnviado.toLocaleString('es-CL')}`, color: 'text-ch-cream' },
          { label: 'Sin documento', value: rendiciones.filter(r => r.tipo_documento === 'sin_documento').length, color: 'text-red-400' },
        ].map(stat => (
          <div key={stat.label} className="border border-ch-border p-4">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">{stat.label}</p>
            <p className={`font-body text-2xl font-mono ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <AdminRendiciones
        cotizaciones={cotizaciones as any}
        rendicionesPorItem={rendicionesPorItem}
        rendicionesSinItem={rendicionesSinItem}
        cotizacionesForm={cotizacionesForm}
        rendicionesPorItemSumas={rendicionesPorItemSumas}
        colaboradores={colaboradores ?? []}
      />
    </div>
  )
}
