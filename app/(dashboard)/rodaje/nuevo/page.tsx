import { createClient } from '@/lib/supabase/server'
import { crearRodaje } from '@/app/actions/rodaje'
import Link from 'next/link'
import BotonEnviar from '@/components/ui/BotonEnviar'

export default async function NuevoRodajePage() {
  const supabase = await createClient()
  const { data: proyectos } = await supabase
    .from('proyectos')
    .select('id, nombre')
    .order('nombre')

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/rodaje" className="text-xs text-ch-muted hover:text-ch-cream transition-colors">
          ← Volver a rodajes
        </Link>
        <h1 className="text-lg font-medium text-ch-cream mt-3">Nuevo rodaje</h1>
        <p className="text-sm text-ch-muted mt-0.5">Solo el nombre y la fecha son necesarios para empezar.</p>
      </div>

      <form action={crearRodaje} className="space-y-6">
        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Nombre de la producción *</label>
          <input
            name="nombre"
            required
            placeholder="ej: Lookbook Primavera 2026"
            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-muted"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-ch-muted mb-1.5">Fecha</label>
            <input
              name="fecha"
              type="date"
              className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="fecha_confirmada" value="true" className="accent-ch-cream" />
              <span className="text-sm text-ch-muted">Fecha confirmada</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Proyecto asociado</label>
          <select
            name="proyecto_id"
            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
          >
            <option value="">Sin proyecto</option>
            {(proyectos || []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Locación</label>
          <input
            name="locacion_nombre"
            placeholder="ej: Estudio Central, Casa de campo..."
            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-muted mb-2"
          />
          <input
            name="locacion_direccion"
            placeholder="Dirección completa"
            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-muted"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-ch-muted mb-1.5">Latitud</label>
            <input
              name="locacion_lat"
              type="number"
              step="any"
              placeholder="-33.4569"
              className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-muted"
            />
          </div>
          <div>
            <label className="block text-xs text-ch-muted mb-1.5">Longitud</label>
            <input
              name="locacion_lng"
              type="number"
              step="any"
              placeholder="-70.6483"
              className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-muted"
            />
          </div>
        </div>
        <p className="text-xs text-ch-subtle -mt-4">Las coordenadas permiten calcular la posición del sol y generar links de Uber. Puedes agregarlas después.</p>

        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Hora de llamado general</label>
          <input
            name="hora_llamado_general"
            type="time"
            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
          />
          <p className="text-xs text-ch-subtle mt-1">Hora por defecto para quienes no tienen hora individual o de departamento.</p>
        </div>

        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Notas generales</label>
          <textarea
            name="notas_generales"
            rows={3}
            placeholder="Información adicional del rodaje..."
            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-muted resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Visibilidad del plan en citaciones</label>
          <select
            name="visibilidad_plan"
            defaultValue="completo"
            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
          >
            <option value="ninguna">No mostrar el plan</option>
            <option value="completo">Mostrar todo el plan</option>
            <option value="segmento">Mostrar solo escenas marcadas</option>
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <BotonEnviar
            pendiente="Creando…"
            className="bg-ch-cream text-ch-dark text-sm font-medium px-5 py-2 rounded-[2px] hover:bg-white"
          >
            Crear rodaje
          </BotonEnviar>
          <Link href="/rodaje" className="text-sm text-ch-muted px-4 py-2 hover:text-ch-cream transition-colors">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
