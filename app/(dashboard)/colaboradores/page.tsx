import { getColaboradores } from '@/app/actions/colaboradores'
import Link from 'next/link'
import type { Colaborador } from '@/types'

export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; especialidad?: string }>
}) {
  const { q, especialidad } = await searchParams
  const colaboradores = await getColaboradores(q, especialidad)

  const todasEspecialidades = Array.from(
    new Set(colaboradores.flatMap(c => c.especialidades || []))
  ).sort()

  return (
    <div className="p-6 lg:p-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Módulo CH-4
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Colaboradores
          </h1>
        </div>
        <Link
          href="/colaboradores/nuevo"
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors"
        >
          + Nuevo
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <form method="GET" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre..."
            className="bg-ch-surface border border-ch-border text-ch-cream font-body text-xs px-3 py-2 placeholder:text-ch-muted focus:outline-none focus:border-zinc-500 w-52"
          />
          <button type="submit" className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-widest uppercase px-4 py-2 transition-colors">
            Buscar
          </button>
          {q && (
            <Link href="/colaboradores" className="text-ch-muted hover:text-ch-cream font-body text-xs py-2 px-2 transition-colors">
              ✕
            </Link>
          )}
        </form>

        {todasEspecialidades.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Link
              href="/colaboradores"
              className={`px-3 py-1.5 font-body text-xs border transition-colors ${!especialidad ? 'border-ch-green text-ch-cream' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}
            >
              Todos
            </Link>
            {todasEspecialidades.map(esp => (
              <Link
                key={esp}
                href={`/colaboradores?especialidad=${encodeURIComponent(esp)}`}
                className={`px-3 py-1.5 font-body text-xs border transition-colors ${especialidad === esp ? 'border-ch-green text-ch-cream' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}
              >
                {esp}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Lista */}
      {colaboradores.length === 0 ? (
        <div className="border border-dashed border-ch-border p-16 text-center">
          <p className="text-ch-muted font-body text-sm">No hay colaboradores registrados.</p>
          <Link href="/colaboradores/nuevo" className="text-ch-green font-body text-sm mt-2 inline-block hover:text-ch-green-light">
            Agregar el primero →
          </Link>
        </div>
      ) : (
        <>
          {/* Tarjetas móvil */}
          <div className="sm:hidden space-y-2">
            {colaboradores.map(c => (
              <Link key={c.id} href={`/colaboradores/${c.id}`}
                className="flex items-center gap-4 border border-ch-border p-4 hover:bg-ch-surface/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-body text-sm text-ch-cream truncate">{c.nombre}</span>
                    {!c.disponible && <span className="text-[9px] font-body px-1.5 py-0.5 border border-red-500/40 text-red-400">No recomendado</span>}
                  </div>
                  <span className="font-body text-xs text-ch-muted">{c.rol_habitual || (c.especialidades?.[0] ?? '—')}</span>
                </div>
                <span className="text-ch-muted font-body text-[10px]">→</span>
              </Link>
            ))}
          </div>

          {/* Tabla desktop */}
          <div className="hidden sm:block border border-ch-border overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ch-border bg-ch-surface/50">
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Nombre</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase hidden md:table-cell">Especialidades</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase hidden lg:table-cell">Documento</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Estado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {colaboradores.map((c, i) => (
                  <tr key={c.id} className={`border-b border-ch-border/50 hover:bg-ch-surface/30 transition-colors ${i % 2 === 0 ? '' : 'bg-ch-surface/20'}`}>
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-body text-sm text-ch-cream">{c.nombre}</p>
                        {c.rut && <p className="font-body text-[10px] text-ch-muted font-mono">{c.rut}</p>}
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {(c.especialidades || []).slice(0, 3).map(esp => (
                          <span key={esp} className="font-body text-[9px] tracking-wider px-1.5 py-0.5 border border-ch-border text-ch-muted">
                            {esp}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <span className="font-body text-xs text-ch-muted">
                        {c.tipo_documento === 'boleta' ? 'Boleta' :
                         c.tipo_documento === 'bet' ? 'BET' :
                         c.tipo_documento === 'factura' ? 'Factura' :
                         c.tipo_documento === 'sin_documento' ? 'Sin doc.' : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {!c.disponible
                        ? <span className="font-body text-[10px] tracking-wider text-red-400 border border-red-500/30 px-2 py-0.5">No recomendado</span>
                        : <span className="font-body text-[10px] tracking-wider text-ch-green border border-ch-green/30 px-2 py-0.5">Disponible</span>
                      }
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/colaboradores/${c.id}`} className="text-ch-muted hover:text-ch-cream font-body text-xs transition-colors">
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
