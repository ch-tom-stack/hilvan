import { createClient } from '@/lib/supabase/server'
import { crearRodaje } from '@/app/actions/rodaje'
import Link from 'next/link'

export default async function NuevoRodajePage() {
  const supabase = await createClient()
  const { data: proyectos } = await supabase
    .from('proyectos')
    .select('id, nombre')
    .order('nombre')

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/rodaje" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Volver a rodajes
        </Link>
        <h1 className="text-lg font-medium text-zinc-100 mt-3">Nuevo rodaje</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Solo el nombre y la fecha son necesarios para empezar.</p>
      </div>

      <form action={crearRodaje} className="space-y-6">
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Nombre de la producción *</label>
          <input
            name="nombre"
            required
            placeholder="ej: Lookbook Primavera 2026"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Fecha</label>
            <input
              name="fecha"
              type="date"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="fecha_confirmada" value="true" className="accent-[#E6E2ED]" />
              <span className="text-sm text-zinc-400">Fecha confirmada</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Proyecto asociado</label>
          <select
            name="proyecto_id"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          >
            <option value="">Sin proyecto</option>
            {(proyectos || []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Locación</label>
          <input
            name="locacion_nombre"
            placeholder="ej: Estudio Central, Casa de campo..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 mb-2"
          />
          <input
            name="locacion_direccion"
            placeholder="Dirección completa"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Latitud</label>
            <input
              name="locacion_lat"
              type="number"
              step="any"
              placeholder="-33.4569"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Longitud</label>
            <input
              name="locacion_lng"
              type="number"
              step="any"
              placeholder="-70.6483"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>
        <p className="text-xs text-zinc-600 -mt-4">Las coordenadas permiten calcular la posición del sol y generar links de Uber. Puedes agregarlas después.</p>

        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Hora de llamado general</label>
          <input
            name="hora_llamado_general"
            type="time"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          />
          <p className="text-xs text-zinc-600 mt-1">Hora por defecto para quienes no tienen hora individual o de departamento.</p>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Notas generales</label>
          <textarea
            name="notas_generales"
            rows={3}
            placeholder="Información adicional del rodaje..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Visibilidad del plan en citaciones</label>
          <select
            name="visibilidad_plan"
            defaultValue="completo"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          >
            <option value="ninguna">No mostrar el plan</option>
            <option value="completo">Mostrar todo el plan</option>
            <option value="segmento">Mostrar solo escenas marcadas</option>
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="bg-[#E6E2ED] text-zinc-900 text-sm font-medium px-5 py-2 rounded-[2px] hover:bg-white transition-colors"
          >
            Crear rodaje
          </button>
          <Link href="/rodaje" className="text-sm text-zinc-500 px-4 py-2 hover:text-zinc-300 transition-colors">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
