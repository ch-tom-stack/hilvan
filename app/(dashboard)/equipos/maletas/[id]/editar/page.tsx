import { createClient } from '@/lib/supabase/server'
import FormularioMaleta from '@/components/maletas/FormularioMaleta'
import GeneradorQR from '@/components/maletas/GeneradorQR'
import { notFound } from 'next/navigation'
import type { Equipo, Maleta } from '@/types'

export default async function EditarMaletaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: maleta } = await supabase
    .from('maletas')
    .select('*, items:maleta_items(*)')
    .eq('id', id)
    .single<Maleta>()

  if (!maleta) notFound()

  const { data: equipos } = await supabase
    .from('equipos')
    .select('*')
    .order('nombre')

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
          Maletas · Editar
        </p>
        <h1 className="font-display italic text-5xl text-ch-cream leading-none">{maleta.nombre}</h1>
        <p className="text-ch-muted font-body text-sm mt-1 font-mono">{maleta.codigo}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
          <FormularioMaleta equipos={equipos as Equipo[] || []} maleta={maleta} />
        </div>
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-6">Código QR</p>
          <GeneradorQR codigo={maleta.codigo} nombre={maleta.nombre} />
        </div>
      </div>
    </div>
  )
}
