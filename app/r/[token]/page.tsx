import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PortalRendicion from '@/components/rendiciones/PortalRendicion'
import { getCotizacionesParaRendiciones, getRendicionesSumasPorItem } from '@/app/actions/rendiciones'

const RENDICION_SELECT = `
  *,
  colaborador:colaboradores(id, nombre, email),
  cotizacion:cotizaciones(id, nombre, grupo:cotizacion_grupos(numero_base)),
  cotizacion_item:cotizacion_items(id, nombre)
`

export default async function PortalExternoPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  // ── 1. Link de ítem (rendiciones_links_temporales) ─────────────────────────
  const { data: rendLink } = await supabase
    .from('rendiciones_links_temporales')
    .select(`
      *,
      cotizacion_item:cotizacion_items(
        id, nombre, tipo,
        cotizacion:cotizaciones(id, nombre, grupo:cotizacion_grupos(numero_base))
      ),
      colaborador:colaboradores(id, nombre, email)
    `)
    .eq('token', token)
    .single()

  if (rendLink) {
    if (rendLink.expires_at && new Date(rendLink.expires_at) < new Date()) {
      return <LinkExpirado />
    }

    const item = rendLink.cotizacion_item as any
    const cotizacion = item?.cotizacion as any
    if (!item || !cotizacion) notFound()

    const [cotizaciones, rendicionesPorItem] = await Promise.all([
      getCotizacionesParaRendiciones(),
      getRendicionesSumasPorItem(),
    ])

    const { data: rendiciones } = await supabase
      .from('rendiciones')
      .select(RENDICION_SELECT)
      .eq('cotizacion_item_id', rendLink.cotizacion_item_id)
      .order('created_at', { ascending: false })

    const col = rendLink.colaborador as any
    return (
      <PortalRendicion
        token={token}
        colaboradorId={rendLink.colaborador_id}
        colaboradorNombre={col?.nombre || rendLink.email}
        cotizaciones={cotizaciones}
        rendicionesPorItem={rendicionesPorItem}
        rendiciones={rendiciones ?? []}
        lockedCotizacion={{ id: cotizacion.id, nombre: cotizacion.nombre, grupo: cotizacion.grupo }}
        lockedItem={{ id: item.id, nombre: item.nombre, tipo: item.tipo }}
      />
    )
  }

  // ── 2. Fallback: link de colaborador (colaboradores_links_temporales) ───────
  const { data: link } = await supabase
    .from('colaboradores_links_temporales')
    .select('*, colaborador:colaboradores(id, nombre, email)')
    .eq('token', token)
    .single()

  if (!link) notFound()

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return <LinkExpirado />
  }

  const [cotizaciones, rendicionesPorItem] = await Promise.all([
    getCotizacionesParaRendiciones(),
    getRendicionesSumasPorItem(),
  ])

  const { data: rendiciones } = await supabase
    .from('rendiciones')
    .select(RENDICION_SELECT)
    .eq('colaborador_id', link.colaborador_id)
    .order('created_at', { ascending: false })

  return (
    <PortalRendicion
      token={token}
      colaboradorId={link.colaborador_id}
      colaboradorNombre={(link.colaborador as any)?.nombre || 'Colaborador'}
      cotizaciones={cotizaciones}
      rendicionesPorItem={rendicionesPorItem}
      rendiciones={rendiciones ?? []}
    />
  )
}

function LinkExpirado() {
  return (
    <div className="min-h-screen bg-ch-black flex items-center justify-center p-6">
      <div className="text-center">
        <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-2">Hilván · Casa Hiedra</p>
        <h1 className="font-display italic text-3xl text-ch-cream mb-3">Link expirado</h1>
        <p className="font-body text-sm text-ch-muted">Solicita uno nuevo al equipo de producción.</p>
      </div>
    </div>
  )
}
