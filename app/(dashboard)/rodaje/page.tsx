import Link from 'next/link'
import { getRodajes } from '@/app/actions/rodaje'
import { getEtiquetasRodaje, crearEtiquetaRodaje, asignarEtiquetaRodaje, quitarEtiquetaRodaje } from '@/app/actions/etiquetas'
import { EstadoRodaje, type Etiqueta } from '@/types'
import EstadoVacio from '@/components/ui/EstadoVacio'
import EtiquetaPicker from '@/components/ui/EtiquetaPicker'
import { parseFechaLocal } from '@/lib/fechas'

const ESTADO_CONFIG: Record<EstadoRodaje, { label: string; clase: string }> = {
  borrador:   { label: 'Borrador',   clase: 'bg-ch-surface text-ch-muted' },
  confirmado: { label: 'Confirmado', clase: 'bg-emerald-950 text-emerald-400' },
  completado: { label: 'Completado', clase: 'bg-ch-surface text-ch-subtle' },
}

export default async function RodajePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; etiqueta?: string }>
}) {
  const { q, estado, etiqueta } = await searchParams
  const [rodajes, etiquetasDisponibles] = await Promise.all([
    getRodajes(q, estado, etiqueta),
    getEtiquetasRodaje(),
  ])
  const hayFiltro = Boolean(q || estado || etiqueta)
  const hoyISO = new Date().toISOString().slice(0, 10)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-medium text-ch-cream">Rodajes</h1>
          <p className="text-sm text-ch-muted mt-0.5">{rodajes.length} producción{rodajes.length !== 1 ? 'es' : ''}</p>
        </div>
        <Link
          href="/rodaje/nuevo"
          className="bg-ch-cream text-ch-dark text-sm font-medium px-4 py-2 rounded-[2px] hover:bg-white transition-colors"
        >
          + Nuevo rodaje
        </Link>
      </div>

      {/* Búsqueda + filtro por estado */}
      <div className="mb-6 space-y-3">
        <form method="GET" className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Buscar por nombre, locación o proyecto…"
            className="flex-1 bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-cream/40"
          />
          {estado && <input type="hidden" name="estado" value={estado} />}
          {etiqueta && <input type="hidden" name="etiqueta" value={etiqueta} />}
          <button
            type="submit"
            className="px-4 py-2 border border-ch-border rounded-[2px] text-sm text-ch-muted hover:text-ch-cream hover:border-ch-cream/40 transition-colors ch-press"
          >
            Buscar
          </button>
          {hayFiltro && (
            <Link
              href="/rodaje"
              className="px-3 py-2 text-xs text-ch-muted hover:text-ch-cream transition-colors whitespace-nowrap"
            >
              ✕ limpiar
            </Link>
          )}
        </form>

        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(ESTADO_CONFIG) as [EstadoRodaje, { label: string; clase: string }][]).map(([key, { label }]) => {
            const params = new URLSearchParams()
            if (q) params.set('q', q)
            if (etiqueta) params.set('etiqueta', etiqueta)
            const activo = estado === key
            if (!activo) params.set('estado', key)
            const href = params.toString() ? `/rodaje?${params}` : '/rodaje'
            return (
              <Link
                key={key}
                href={href}
                className={`px-2.5 py-1 text-[11px] tracking-wide uppercase border rounded-[2px] transition-colors ${
                  activo ? 'border-ch-green text-ch-green' : 'border-ch-border text-ch-muted hover:text-ch-cream'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>

        {etiquetasDisponibles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {etiquetasDisponibles.map((et: Etiqueta) => {
              const params = new URLSearchParams()
              if (q) params.set('q', q)
              if (estado) params.set('estado', estado)
              const activo = etiqueta === et.id
              if (!activo) params.set('etiqueta', et.id)
              const href = params.toString() ? `/rodaje?${params}` : '/rodaje'
              return (
                <Link
                  key={et.id}
                  href={href}
                  className="px-2.5 py-1 font-body text-[11px] rounded-[2px] border transition-colors"
                  style={activo
                    ? { borderColor: et.color, color: et.color, backgroundColor: `${et.color}14` }
                    : { borderColor: 'var(--color-ch-border)', color: 'var(--color-ch-muted)' }}
                >
                  {et.texto}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {rodajes.length === 0 ? (
        <EstadoVacio
          mensaje={hayFiltro ? 'Sin resultados — prueba con otro término o quita el filtro.' : 'No hay rodajes todavía.'}
          accion={hayFiltro
            ? <Link href="/rodaje" className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-green hover:text-ch-green-light transition-colors">Quitar filtro →</Link>
            : <Link href="/rodaje/nuevo" className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-green hover:text-ch-green-light transition-colors">Crear el primero →</Link>}
        />
      ) : (
        <div className="space-y-2">
          {rodajes.map((r: any) => {
            const cfg = ESTADO_CONFIG[r.estado as EstadoRodaje]
            const fecha = r.fecha
              ? parseFechaLocal(r.fecha).toLocaleDateString('es-CL', {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                })
              : null
            // Necesita atención: fecha de rodaje ya pasada y sigue sin cerrarse.
            const vencido = r.fecha && r.fecha < hoyISO && r.estado !== 'completado'

            return (
              <Link
                key={r.id}
                href={`/rodaje/${r.id}`}
                className={`flex items-center justify-between border rounded-[2px] px-5 py-4 transition-colors group ${
                  vencido ? 'bg-red-950/20 border-red-900/40 hover:border-red-700/60' : 'bg-ch-surface border-ch-border hover:border-ch-muted'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium text-ch-cream group-hover:text-white">
                      {r.nombre}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {fecha ? (
                        <span className="text-xs text-ch-muted">
                          {fecha}
                          {!r.fecha_confirmada && (
                            <span className="ml-1.5 text-amber-500">· fecha por confirmar</span>
                          )}
                          {vencido && (
                            <span className="ml-1.5 text-red-400">· atrasado, sin cerrar</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-ch-subtle">Fecha por definir</span>
                      )}
                      {r.proyecto && (
                        <span className="text-xs text-ch-subtle">· {r.proyecto.nombre}</span>
                      )}
                      <EtiquetaPicker
                        entidadId={r.id}
                        disponibles={etiquetasDisponibles}
                        asignadas={r.etiquetas ?? []}
                        onAsignar={asignarEtiquetaRodaje}
                        onQuitar={quitarEtiquetaRodaje}
                        onCrear={crearEtiquetaRodaje}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r.locacion_nombre && (
                    <span className="text-xs text-ch-subtle hidden sm:block">{r.locacion_nombre}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.clase}`}>
                    {cfg.label}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
