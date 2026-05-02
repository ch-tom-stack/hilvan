import { getTodasPendientes } from '@/app/actions/rendiciones'
import AdminRendiciones from '@/components/rendiciones/AdminRendiciones'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminRendicionesPage() {
  let rendiciones: Awaited<ReturnType<typeof getTodasPendientes>> = []
  let dbError: string | null = null
  const supabase = await createClient()

  const { data: rodajes } = await supabase
    .from('rodajes')
    .select('id, nombre, fecha')
    .order('fecha', { ascending: false })
    .limit(20)

  const { data: colaboradores } = await supabase
    .from('colaboradores')
    .select('id, nombre')
    .order('nombre')

  try {
    rendiciones = await getTodasPendientes()
  } catch (e: any) {
    dbError = e?.message || String(e)
  }

  // Agrupar por rodaje
  const porRodaje = rendiciones.reduce((acc, r) => {
    const rodajeId = r.rodaje_id
    const rodajeNombre = (r.rodaje as any)?.nombre || 'Sin rodaje'
    if (!acc[rodajeId]) acc[rodajeId] = { nombre: rodajeNombre, items: [] }
    acc[rodajeId].items.push(r)
    return acc
  }, {} as Record<string, { nombre: string; items: typeof rendiciones }>)

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
          { label: 'Pendientes', value: rendiciones.filter(r => r.estado === 'pendiente').length, color: 'text-amber-400' },
          { label: 'Total pendiente', value: `$${rendiciones.filter(r => r.estado === 'pendiente').reduce((s, r) => s + r.monto, 0).toLocaleString('es-CL')}`, color: 'text-ch-cream' },
          { label: 'Aprobadas hoy', value: rendiciones.filter(r => r.estado === 'aprobada' && r.updated_at?.startsWith(new Date().toISOString().slice(0, 10))).length, color: 'text-ch-green' },
          { label: 'Sin documento', value: rendiciones.filter(r => r.tipo_documento === 'sin_documento').length, color: 'text-red-400' },
        ].map(stat => (
          <div key={stat.label} className="border border-ch-border p-4">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">{stat.label}</p>
            <p className={`font-body text-2xl font-mono ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <AdminRendiciones porRodaje={porRodaje} rodajes={rodajes ?? []} colaboradores={colaboradores ?? []} />
    </div>
  )
}
