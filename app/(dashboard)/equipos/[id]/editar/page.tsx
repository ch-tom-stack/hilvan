import { createClient } from '@/lib/supabase/server'
import { getCategorias } from '@/app/actions/equipos'
import FormularioEquipo from '@/components/equipos/FormularioEquipo'
import { notFound } from 'next/navigation'
import type { Equipo } from '@/types'

export default async function EditarEquipoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: equipo } = await supabase
    .from('equipos')
    .select('*')
    .eq('id', id)
    .single<Equipo>()

  if (!equipo) notFound()

  const categorias = await getCategorias()

  return (
    <div className="p-10 max-w-3xl">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
          Equipos · Editar
        </p>
        <h1 className="font-display italic text-5xl text-ch-cream leading-none">
          {equipo.nombre}
        </h1>
        <p className="text-ch-muted font-body text-sm mt-1 font-mono">{equipo.codigo}</p>
      </div>
      <FormularioEquipo categorias={categorias} equipo={equipo} />
    </div>
  )
}
