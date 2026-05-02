import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import TagEstado from '@/components/equipos/TagEstado'
import type { Equipo } from '@/types'
import type { Rol } from '@/types'

export default async function DetalleEquipoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: equipo }, { data: { user } }] = await Promise.all([
    supabase.from('equipos').select('*, categoria:categorias_equipo(*)').eq('id', id).single<Equipo>(),
    supabase.auth.getUser(),
  ])

  if (!equipo) notFound()

  let rol: Rol | null = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
    rol = profile?.rol ?? null
  }

  const puedeEditar = rol === 'admin' || rol === 'productor'

  const estadoLabel: Record<string, string> = {
    disponible: 'Disponible',
    en_uso: 'En uso',
    en_mantenimiento: 'En mantenimiento',
    pendiente_compra: 'Pendiente de compra',
  }

  return (
    <div className="p-6 lg:p-10 max-w-4xl">

      {/* Breadcrumb + acciones */}
      <div className="flex items-start justify-between mb-10 gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Equipos · Detalle
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            {equipo.nombre}
          </h1>
          {equipo.categoria && (
            <p className="text-ch-muted font-body text-xs mt-2 tracking-wider">{equipo.categoria.nombre}</p>
          )}
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <Link
            href="/equipos"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors"
          >
            ← Inventario
          </Link>
          {puedeEditar && (
            <Link
              href={`/equipos/${equipo.id}/editar`}
              className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors"
            >
              Editar
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Galería de fotos */}
        <div>
          {equipo.fotos && equipo.fotos.length > 0 ? (
            <div className="space-y-3">
              <img
                src={equipo.fotos[0]}
                alt={equipo.nombre}
                className="w-full aspect-video object-cover border border-ch-border"
              />
              {equipo.fotos.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {equipo.fotos.slice(1).map((foto, i) => (
                    <img
                      key={i}
                      src={foto}
                      alt={`${equipo.nombre} ${i + 2}`}
                      className="w-full aspect-square object-cover border border-ch-border"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full aspect-video bg-ch-surface border border-ch-border flex items-center justify-center">
              <span className="text-ch-border font-body text-xs tracking-widest">SIN FOTO</span>
            </div>
          )}
        </div>

        {/* Datos */}
        <div className="space-y-6">

          {/* Identificación */}
          <div>
            <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-3">Identificación</p>
            <div className="border border-ch-border divide-y divide-ch-border/50">
              <div className="flex justify-between px-4 py-3">
                <span className="font-body text-xs text-ch-muted">Código</span>
                <span className="font-body text-xs text-ch-cream font-mono">{equipo.codigo}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="font-body text-xs text-ch-muted">Estado</span>
                <TagEstado estado={equipo.estado} />
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="font-body text-xs text-ch-muted">Cantidad</span>
                <span className="font-body text-xs text-ch-cream">{equipo.cantidad ?? 1}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="font-body text-xs text-ch-muted">Rentable</span>
                <span className={`font-body text-xs ${equipo.rentable ? 'text-ch-green' : 'text-ch-muted'}`}>
                  {equipo.rentable ? 'Sí' : 'No'}
                </span>
              </div>
              {equipo.precio_jornada != null && (
                <div className="flex justify-between px-4 py-3">
                  <span className="font-body text-xs text-ch-muted">Precio jornada</span>
                  <span className="font-body text-xs text-ch-cream">
                    ${equipo.precio_jornada.toLocaleString('es-CL')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Descripción */}
          {equipo.descripcion && (
            <div>
              <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-3">Descripción</p>
              <p className="font-body text-sm text-ch-cream/80 leading-relaxed border border-ch-border px-4 py-3">
                {equipo.descripcion}
              </p>
            </div>
          )}

          {/* Notas internas */}
          {equipo.notas && (
            <div>
              <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-3">Notas internas</p>
              <p className="font-body text-sm text-ch-muted leading-relaxed border border-ch-border/50 border-dashed px-4 py-3">
                {equipo.notas}
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
