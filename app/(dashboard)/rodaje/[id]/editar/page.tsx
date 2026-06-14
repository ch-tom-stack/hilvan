'use client'

import { use, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getRodaje, actualizarRodaje, eliminarRodaje } from '@/app/actions/rodaje'
import { getLocaciones } from '@/app/actions/rodaje-plan'
import { LocacionesEditor } from '@/components/rodaje/LocacionesEditor'
import { ImagenUploader } from '@/components/rodaje/ImagenUploader'
import { createClient } from '@/lib/supabase/client'
import { RodajeLocacion } from '@/types'

export default function EditarRodajePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [rodaje, setRodaje] = useState<any>(null)
  const [proyectos, setProyectos] = useState<any[]>([])
  const [locaciones, setLocaciones] = useState<RodajeLocacion[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const router = useRouter()

  const recargarLocaciones = async () => {
    const l = await getLocaciones(id)
    setLocaciones(l)
  }

  useEffect(() => {
    const cargar = async () => {
      const supabase = createClient()
      const [data, { data: proys }, locs] = await Promise.all([
        getRodaje(id),
        supabase.from('proyectos').select('id, nombre').order('nombre'),
        getLocaciones(id),
      ])
      setRodaje(data)
      setProyectos(proys || [])
      setLocaciones(locs)
      setLoading(false)
    }
    cargar()
  }, [id])

  if (loading) return <div className="p-6 text-ch-muted text-sm">Cargando...</div>
  if (!rodaje) return <div className="p-6 text-ch-muted text-sm">Rodaje no encontrado.</div>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href={`/rodaje/${id}`} className="text-xs text-ch-muted hover:text-ch-cream transition-colors">
          ← Volver al rodaje
        </Link>
        <h1 className="text-lg font-medium text-ch-cream mt-3">Editar rodaje</h1>
        <p className="text-sm text-ch-muted mt-0.5">{rodaje.nombre}</p>
      </div>

      <form
        action={async (fd) => {
          startTransition(async () => {
            await actualizarRodaje(id, fd)
            router.push(`/rodaje/${id}`)
          })
        }}
        className="space-y-6"
      >
        {/* Nombre */}
        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Nombre de la producción *</label>
          <input
            name="nombre"
            required
            defaultValue={rodaje.nombre}
            className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
          />
        </div>

        {/* Fecha */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-ch-muted mb-1.5">Fecha</label>
            <input
              name="fecha"
              type="date"
              defaultValue={rodaje.fecha || ''}
              className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="fecha_confirmada"
                value="true"
                defaultChecked={rodaje.fecha_confirmada}
                className="accent-[#E6E2ED]"
              />
              <span className="text-sm text-ch-muted">Fecha confirmada</span>
            </label>
          </div>
        </div>

        {/* Estado */}
        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Estado</label>
          <select
            name="estado"
            defaultValue={rodaje.estado}
            className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
          >
            <option value="borrador">Borrador</option>
            <option value="confirmado">Confirmado</option>
            <option value="completado">Completado</option>
          </select>
        </div>

        {/* Proyecto */}
        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Proyecto asociado</label>
          <select
            name="proyecto_id"
            defaultValue={rodaje.proyecto_id || ''}
            className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
          >
            <option value="">Sin proyecto</option>
            {proyectos.map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        {/* Hora llamado */}
        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Hora de llamado general</label>
          <input
            name="hora_llamado_general"
            type="time"
            defaultValue={rodaje.hora_llamado_general?.slice(0, 5) || ''}
            className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
          />
        </div>

        {/* Visibilidad plan */}
        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Visibilidad del plan en citaciones</label>
          <select
            name="visibilidad_plan"
            defaultValue={rodaje.visibilidad_plan || 'completo'}
            className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
          >
            <option value="ninguna">No mostrar el plan</option>
            <option value="completo">Mostrar todo el plan</option>
            <option value="segmento">Mostrar solo bloques marcados</option>
          </select>
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs text-ch-muted mb-1.5">Notas generales</label>
          <textarea
            name="notas_generales"
            rows={3}
            defaultValue={rodaje.notas_generales || ''}
            className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-border focus:outline-none focus:border-ch-muted resize-none"
          />
        </div>

        {/* Chiste texto */}
        <div className="pt-2 border-t border-ch-dark">
          <label className="block text-xs text-ch-muted mb-1.5">Chiste / cita del día</label>
          <textarea
            name="chiste_texto"
            rows={2}
            defaultValue={rodaje.chiste_texto || ''}
            placeholder='"Ay ay ay im ur little butterfly" — Carolina Herrera, probably'
            className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-border focus:outline-none focus:border-ch-muted resize-none"
          />
        </div>

        {/* Hidden fields */}
        <input type="hidden" name="locacion_nombre" value={locaciones.find(l => l.es_principal)?.nombre || rodaje.locacion_nombre || ''} />
        <input type="hidden" name="locacion_direccion" value={locaciones.find(l => l.es_principal)?.direccion || rodaje.locacion_direccion || ''} />
        <input type="hidden" name="locacion_lat" value={locaciones.find(l => l.es_principal)?.lat?.toString() || rodaje.locacion_lat?.toString() || ''} />
        <input type="hidden" name="locacion_lng" value={locaciones.find(l => l.es_principal)?.lng?.toString() || rodaje.locacion_lng?.toString() || ''} />

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="bg-[#E6E2ED] text-ch-black text-sm font-medium px-5 py-2 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50"
          >
            {isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <Link href={`/rodaje/${id}`} className="text-sm text-ch-muted px-4 py-2 hover:text-ch-cream transition-colors">
            Cancelar
          </Link>
        </div>
      </form>

      {/* Imágenes — fuera del form, se guardan directamente en Supabase */}
      <div className="mt-8 pt-8 border-t border-ch-dark space-y-6">
        <h2 className="text-xs text-ch-border uppercase tracking-wider">Imágenes</h2>

        <ImagenUploader
          rodajeId={id}
          campo="chiste_imagen_url"
          valorActual={rodaje.chiste_imagen_url}
          label="Imagen del chiste"
          onSubida={(url) => setRodaje((r: any) => ({ ...r, chiste_imagen_url: url }))}
        />

        <ImagenUploader
          rodajeId={id}
          campo="cliente_logo_url"
          valorActual={rodaje.cliente_logo_url}
          label="Logo del cliente"
          onSubida={(url) => setRodaje((r: any) => ({ ...r, cliente_logo_url: url }))}
          invertOnDark
        />
      </div>

      {/* Locaciones */}
      <div className="mt-8 pt-8 border-t border-ch-dark">
        <LocacionesEditor
          rodajeId={id}
          locaciones={locaciones}
          onActualizar={recargarLocaciones}
        />
      </div>

      {/* Zona de peligro */}
      <div className="mt-12 pt-8 border-t border-ch-dark">
        <h2 className="text-xs text-ch-border uppercase tracking-wider mb-4">Zona de peligro</h2>
        {!confirmEliminar ? (
          <button
            onClick={() => setConfirmEliminar(true)}
            className="text-sm text-red-500 border border-red-900 px-4 py-2 rounded-[2px] hover:bg-red-950/30 transition-colors"
          >
            Eliminar rodaje
          </button>
        ) : (
          <div className="bg-red-950/20 border border-red-900 rounded-[2px] p-4">
            <p className="text-sm text-red-400 mb-3">
              ¿Eliminar &quot;{rodaje.nombre}&quot;? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => startTransition(async () => { await eliminarRodaje(id) })}
                disabled={isPending}
                className="text-sm bg-red-700 text-white px-4 py-2 rounded-[2px] hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
              <button
                onClick={() => setConfirmEliminar(false)}
                className="text-sm text-ch-muted px-4 py-2 hover:text-ch-cream transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
