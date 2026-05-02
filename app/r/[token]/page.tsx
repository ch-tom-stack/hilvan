import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PortalRendicion from '@/components/rendiciones/PortalRendicion'

export default async function PortalExternoPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  // Validar token
  const { data: link } = await supabase
    .from('colaboradores_links_temporales')
    .select('*, colaborador:colaboradores(id, nombre, email)')
    .eq('token', token)
    .single()

  if (!link) notFound()

  // Verificar expiración
  if (link.expira_en && new Date(link.expira_en) < new Date()) {
    return (
      <div className="min-h-screen bg-ch-black flex items-center justify-center p-6">
        <div className="text-center">
          <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-2">Hilván · Casa Hiedra</p>
          <h1 className="font-display italic text-3xl text-ch-cream mb-3">Link expirado</h1>
          <p className="font-body text-sm text-ch-muted">Este enlace ya no está disponible. Solicita uno nuevo al equipo de producción.</p>
        </div>
      </div>
    )
  }

  // Cargar rodaje si el link está asociado a uno
  let rodaje = null
  if (link.rodaje_id) {
    const { data } = await supabase
      .from('rodajes')
      .select('id, nombre, fecha')
      .eq('id', link.rodaje_id)
      .single()
    rodaje = data
  }

  // Rendiciones existentes del colaborador (para este rodaje si aplica)
  let rendicionesQuery = supabase
    .from('rendiciones')
    .select('*, rodaje:rodajes(nombre)')
    .eq('colaborador_id', link.colaborador_id)
    .order('created_at', { ascending: false })

  if (link.rodaje_id) rendicionesQuery = rendicionesQuery.eq('rodaje_id', link.rodaje_id)

  const { data: rendiciones } = await rendicionesQuery

  return (
    <PortalRendicion
      token={token}
      colaboradorId={link.colaborador_id}
      colaboradorNombre={(link.colaborador as any)?.nombre || 'Colaborador'}
      rodaje={rodaje}
      rendiciones={rendiciones ?? []}
    />
  )
}
