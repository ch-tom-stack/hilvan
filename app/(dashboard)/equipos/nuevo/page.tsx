import { getCategorias, getSiguienteCodigo } from '@/app/actions/equipos'
import FormularioEquipo from '@/components/equipos/FormularioEquipo'

export default async function NuevoEquipoPage() {
  const categorias = await getCategorias()
  return (
    <div className="p-10 max-w-3xl">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
          Equipos · Nuevo
        </p>
        <h1 className="font-display italic text-5xl text-ch-cream leading-none">
          Agregar equipo
        </h1>
      </div>
      <FormularioEquipo categorias={categorias} />
    </div>
  )
}
