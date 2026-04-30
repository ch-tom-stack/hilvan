import { createClient } from '@/lib/supabase/server'
import FormularioMaleta from '@/components/maletas/FormularioMaleta'
import type { Equipo } from '@/types'

export default async function NuevaMaletaPage() {
  const supabase = await createClient()
  const { data: equipos } = await supabase
    .from('equipos')
    .select('*')
    .order('nombre')

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
          Maletas · Nueva
        </p>
        <h1 className="font-display italic text-5xl text-ch-cream leading-none">
          Nueva maleta
        </h1>
      </div>
      <FormularioMaleta equipos={equipos as Equipo[] || []} />
    </div>
  )
}
