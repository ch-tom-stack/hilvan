import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Maleta, MaletaItem, Equipo } from '@/types'

export default async function FichaMaletaRentalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: maleta, error } = await admin
    .from('maletas')
    .select(`
      id, codigo, nombre, descripcion, foto_url, foto_empaque, created_at,
      items:maleta_items(*, equipo:equipos(id, codigo, nombre, categoria_codigo, categoria:categorias_equipo(nombre)))
    `)
    .eq('id', id)
    .single<Maleta & { items?: (MaletaItem & { equipo?: Equipo })[] }>()

  if (error || !maleta) notFound()

  return (
    <div className="p-6 lg:p-10 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Rental · Maleta
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            {maleta.nombre}
          </h1>
        </div>
        <Link
          href="/rental/maletas"
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body
                     text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors duration-200"
        >
          ← Maletas
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Fotos */}
        <div className="space-y-3">
          {maleta.foto_empaque ? (
            <img
              src={maleta.foto_empaque}
              alt={`${maleta.nombre} empacada`}
              className="w-full aspect-video object-cover border border-ch-border"
            />
          ) : maleta.foto_url ? (
            <img
              src={maleta.foto_url}
              alt={maleta.nombre}
              className="w-full aspect-video object-cover border border-ch-border"
            />
          ) : (
            <div className="w-full aspect-video bg-ch-surface border border-ch-border flex items-center justify-center">
              <span className="text-ch-subtle font-body text-xs tracking-widest">SIN FOTO</span>
            </div>
          )}
          {maleta.foto_url && maleta.foto_empaque && (
            <img
              src={maleta.foto_url}
              alt={maleta.nombre}
              className="w-full aspect-video object-cover border border-ch-border"
            />
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
                <span className="font-body text-xs text-ch-cream font-mono">{maleta.codigo}</span>
              </div>
              {maleta.items && (
                <div className="flex justify-between px-4 py-3">
                  <span className="font-body text-xs text-ch-muted">Ítems</span>
                  <span className="font-body text-xs text-ch-cream">{maleta.items.length} equipos</span>
                </div>
              )}
            </div>
          </div>

          {/* Descripción */}
          {maleta.descripcion && (
            <div>
              <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-3">
                Descripción
              </p>
              <p className="font-body text-sm text-ch-cream leading-relaxed whitespace-pre-line">
                {maleta.descripcion}
              </p>
            </div>
          )}

          {/* CTA */}
          <Link
            href={`/rental/reservas/nueva?maleta_id=${maleta.id}`}
            className="block text-center bg-ch-green hover:bg-ch-green-light text-ch-black font-body
                       font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-4 transition-colors duration-200"
          >
            Solicitar reserva →
          </Link>
        </div>

      </div>

      {/* Contenido de la maleta */}
      {maleta.items && maleta.items.length > 0 && (
        <div className="mt-10">
          <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-4">
            Contenido de la maleta
          </p>
          <div className="border border-ch-border divide-y divide-ch-border/50">
            {maleta.items.map(item => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-body text-sm text-ch-cream">{item.equipo?.nombre ?? '—'}</p>
                  <p className="font-body text-[9px] text-ch-muted font-mono">
                    {item.equipo?.codigo} · {(item.equipo as any)?.categoria?.nombre}
                  </p>
                </div>
                <span className="font-body text-xs text-ch-muted">×{item.cantidad}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
