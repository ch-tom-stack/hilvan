import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Equipo, CategoriaEquipo } from '@/types'

const ESTADO_LABELS: Record<string, string> = {
  disponible:       'Disponible',
  en_uso:           'En uso',
  en_mantenimiento: 'En mantenimiento',
  pendiente_compra: 'Pendiente de compra',
}

const ESTADO_COLORS: Record<string, string> = {
  disponible:       'text-ch-green',
  en_uso:           'text-ch-gold',
  en_mantenimiento: 'text-red-400',
  pendiente_compra: 'text-ch-muted',
}

export default async function FichaEquipoRentalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: equipo, error } = await admin
    .from('equipos')
    .select('*, categoria:categorias_equipo(*)')
    .eq('id', id)
    .single<Equipo & { categoria?: CategoriaEquipo }>()

  if (error || !equipo) notFound()

  const fotos = equipo.fotos ?? []

  return (
    <div className="p-6 lg:p-10 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Rental · Equipo
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            {equipo.nombre}
          </h1>
          {equipo.categoria?.nombre && (
            <p className="text-ch-muted font-body text-sm mt-2">{equipo.categoria.nombre}</p>
          )}
        </div>
        <Link
          href="/rental"
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body
                     text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors duration-200"
        >
          ← Catálogo
        </Link>
      </div>

      {/* Contenido 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Fotos */}
        <div>
          {fotos.length > 0 ? (
            <div className="space-y-3">
              <img
                src={fotos[0]}
                alt={equipo.nombre}
                className="w-full aspect-video object-cover border border-ch-border"
              />
              {fotos.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {fotos.slice(1).map((foto, i) => (
                    <img
                      key={i}
                      src={foto}
                      alt=""
                      className="w-full aspect-square object-cover border border-ch-border"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full aspect-video bg-ch-surface border border-ch-border flex items-center justify-center">
              <span className="text-ch-subtle font-body text-xs tracking-widest">SIN FOTO</span>
            </div>
          )}
        </div>

        {/* Datos */}
        <div className="space-y-6">
          {/* Identificación */}
          <div>
            <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-3">
              Identificación
            </p>
            <div className="border border-ch-border divide-y divide-ch-border/50">
              <div className="flex justify-between px-4 py-3">
                <span className="font-body text-xs text-ch-muted">Código</span>
                <span className="font-body text-xs text-ch-cream font-mono">{equipo.codigo}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="font-body text-xs text-ch-muted">Estado</span>
                <span className={`font-body text-xs ${ESTADO_COLORS[equipo.estado] ?? 'text-ch-muted'}`}>
                  {ESTADO_LABELS[equipo.estado] ?? equipo.estado}
                </span>
              </div>
              {equipo.cantidad != null && (
                <div className="flex justify-between px-4 py-3">
                  <span className="font-body text-xs text-ch-muted">Cantidad</span>
                  <span className="font-body text-xs text-ch-cream">{equipo.cantidad}</span>
                </div>
              )}
              {equipo.precio_jornada != null && equipo.precio_jornada > 0 && (
                <div className="flex justify-between px-4 py-3">
                  <span className="font-body text-xs text-ch-muted">Precio / jornada</span>
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
              <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-3">
                Descripción
              </p>
              <p className="font-body text-sm text-ch-cream leading-relaxed whitespace-pre-line">
                {equipo.descripcion}
              </p>
            </div>
          )}

          {equipo.estado !== 'disponible' && (
            <div className="border border-ch-gold/30 bg-ch-gold/5 px-4 py-3">
              <p className="text-ch-gold text-xs font-body">
                Este equipo está marcado como {ESTADO_LABELS[equipo.estado]?.toLowerCase()}, pero puedes igualmente enviar una solicitud de reserva.
              </p>
            </div>
          )}

          {/* CTA */}
          <Link
            href={`/rental/reservas/nueva?equipo_id=${equipo.id}`}
            className="block text-center bg-ch-green hover:bg-ch-green-light text-ch-black font-body
                       font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-4 transition-colors duration-200"
          >
            Solicitar reserva →
          </Link>
        </div>

      </div>
    </div>
  )
}
