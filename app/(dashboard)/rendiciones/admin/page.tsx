import {
  getTodasRendiciones,
  getCotizacionesParaRendiciones,
  getGastosSumasPorItem,
  getLinksTemporales,
} from '@/app/actions/rendiciones'
import AdminRendiciones from '@/components/rendiciones/AdminRendiciones'
import { createClient } from '@/lib/supabase/server'
import { calcularRetencion } from '@/types'
import Link from 'next/link'

export default async function AdminRendicionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user!.id).single()
  const esAdmin = profile?.rol === 'admin'

  const [rendiciones, cotizacionesForm, gastosSumasPorItem, { data: colaboradores }, links] = await Promise.all([
    getTodasRendiciones().catch(() => []),
    getCotizacionesParaRendiciones().catch(() => []),
    getGastosSumasPorItem().catch(() => ({})),
    supabase.from('colaboradores').select('id, nombre').order('nombre'),
    getLinksTemporales().catch(() => []),
  ])

  const todosGastos = rendiciones.flatMap(r => r.gastos || [])

  // Internos: van a pago directo desde 'enviada'. Externos: necesitan aprobación de contenido primero.
  const gastosPorRevisar = todosGastos.filter(g => g.estado === 'enviada' && g.origen === 'externo')
  const gastosPorPagar = todosGastos.filter(g =>
    (g.origen === 'interno' && g.estado === 'enviada') ||
    (g.origen === 'externo' && g.estado === 'aprobada')
  )
  const totalPorPagar = gastosPorPagar.reduce((s, g) => {
    const { neto } = calcularRetencion(g)
    return s + neto
  }, 0)

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Rendiciones · Admin</p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Revisión</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/rendiciones/mensual"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            Mensual →
          </Link>
          {esAdmin && (
            <Link href="/rendiciones/admin/export"
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
              Exportar →
            </Link>
          )}
          <Link href="/rendiciones"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
            ← Volver
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Por revisar', value: gastosPorRevisar.length, color: 'text-blue-400' },
          { label: 'Por pagar', value: gastosPorPagar.length, color: 'text-amber-400' },
          { label: 'Total neto a pagar', value: `$${totalPorPagar.toLocaleString('es-CL')}`, color: 'text-ch-cream' },
          { label: 'Sin documento', value: todosGastos.filter(g => g.tipo_documento === 'sin_documento').length, color: 'text-red-400' },
        ].map(stat => (
          <div key={stat.label} className="border border-ch-border p-4">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">{stat.label}</p>
            <p className={`font-body text-2xl font-mono ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <AdminRendiciones
        rendiciones={rendiciones}
        cotizacionesForm={cotizacionesForm as any}
        gastosSumasPorItem={gastosSumasPorItem}
        colaboradores={colaboradores ?? []}
        linksTemporales={links as any}
        puedeAprobarPago={esAdmin}
        puedeGenerarLink={true}
      />
    </div>
  )
}
