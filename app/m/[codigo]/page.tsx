import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Maleta } from '@/types'
import NotasMaleta from '@/components/maletas/NotasMaleta'

export default async function MaletaPublicaPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const supabase = await createClient()

  const { data: maleta } = await supabase
    .from('maletas')
    .select('*, items:maleta_items(*, equipo:equipos(*)), notas:maleta_notas(*)')
    .eq('codigo', codigo)
    .eq('activa', true)
    .single<Maleta>()

  if (!maleta) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  // Ordenar notas por fecha descendente
  const notas = [...(maleta.notas || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div className="min-h-screen bg-ch-black text-ch-cream">
      <div className="max-w-lg mx-auto px-5 py-8">

        {/* Header */}
        <div className="mb-8">
          <p className="text-ch-muted font-body text-[9px] tracking-[0.5em] uppercase mb-1">Casa Hiedra</p>
          <h1 className="font-display italic text-4xl text-ch-cream leading-tight">{maleta.nombre}</h1>
          <p className="text-ch-muted font-body text-xs font-mono mt-1">{maleta.codigo}</p>
        </div>

        {/* Foto de empaque */}
        {maleta.foto_empaque && (
          <div className="mb-8">
            <img src={maleta.foto_empaque} alt="Foto de empaque" className="w-full object-cover" />
            {maleta.descripcion && (
              <p className="text-ch-muted font-body text-sm mt-3 leading-relaxed">{maleta.descripcion}</p>
            )}
          </div>
        )}

        {/* Contenido */}
        <div className="mb-8">
          <p className="text-ch-muted font-body text-[10px] tracking-[0.4em] uppercase mb-4">
            Contenido — {maleta.items?.length || 0} ítems
          </p>
          <div className="space-y-0 border border-ch-border">
            {maleta.items?.map((item, i) => (
              <div
                key={item.id}
                className={`flex items-start gap-4 px-5 py-4 ${
                  i < (maleta.items?.length || 0) - 1 ? 'border-b border-ch-border/50' : ''
                }`}
              >
                {item.equipo?.fotos?.[0] && (
                  <img src={item.equipo.fotos[0]} alt="" className="w-10 h-10 object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm text-ch-cream">{item.equipo?.nombre}</p>
                  <p className="font-body text-[10px] text-ch-muted font-mono">{item.equipo?.codigo}</p>
                  {item.notas && (
                    <p className="font-body text-xs text-ch-muted mt-1 italic">{item.notas}</p>
                  )}
                </div>
                <span className="font-body text-xs text-ch-muted flex-shrink-0">×{item.cantidad}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notas */}
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.4em] uppercase mb-4">
            Notas del equipo
          </p>
          <NotasMaleta
            maletaId={maleta.id}
            notas={notas}
            usuarioLogueado={!!user}
            nombreUsuario={user?.email?.split('@')[0] || ''}
          />
        </div>

      </div>
    </div>
  )
}
