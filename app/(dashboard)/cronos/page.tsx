import Link from 'next/link'
import { getCronos } from '@/app/actions/cronos'
import { hoyIso, proximoHitoClave, rangoCrono, rangosEtapas, formatoRango, formatoDia, nombreTipoHito, diaNum } from '@/lib/crono'
import { ESTADO_CRONO_LABELS, type EstadoCrono } from '@/types'
import { BarraEtapasMini } from '@/components/cronos/CronoVistas'
import EstadoVacio from '@/components/ui/EstadoVacio'

export const metadata = { title: 'Cronos — Hilván' }
export const dynamic = 'force-dynamic'

const ESTADO_CLS: Record<EstadoCrono, string> = {
  borrador: 'border-ch-border text-ch-muted',
  vigente:  'border-ch-green/40 text-ch-green',
  cerrado:  'border-ch-border text-ch-subtle',
}
const ESTADOS: EstadoCrono[] = ['vigente', 'borrador', 'cerrado']

export default async function CronosPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const { q, estado } = await searchParams
  const todos = await getCronos(q)
  const cronos = estado ? todos.filter((c) => c.estado === estado) : todos
  const hoy = hoyIso()
  const hayFiltro = Boolean(q || estado)

  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">CH-11 · Cronos</p>
          <h1 className="font-display italic text-5xl text-ch-cream leading-none">Cronogramas</h1>
          <p className="font-body text-sm text-ch-muted mt-2">{todos.length} crono{todos.length === 1 ? '' : 's'}</p>
        </div>
        <Link href="/cronos/nuevo" className="font-body text-[11px] tracking-[0.15em] uppercase px-4 py-2.5 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors shrink-0">
          + Nuevo crono
        </Link>
      </div>

      <div className="mb-6 space-y-3">
        <form method="GET" className="flex items-center gap-2">
          <input type="text" name="q" defaultValue={q ?? ''} placeholder="Buscar por nombre, proyecto o cliente…" className="flex-1 bg-ch-surface border border-ch-border px-3 py-2 font-body text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-cream/40" />
          {estado && <input type="hidden" name="estado" value={estado} />}
          <button type="submit" className="px-4 py-2 border border-ch-border font-body text-sm text-ch-muted hover:text-ch-cream hover:border-ch-cream/40 transition-colors ch-press">Buscar</button>
          {hayFiltro && <Link href="/cronos" className="px-3 py-2 font-body text-xs text-ch-muted hover:text-ch-cream transition-colors whitespace-nowrap">✕ limpiar</Link>}
        </form>
        <div className="flex flex-wrap gap-1.5">
          {ESTADOS.map((k) => {
            const params = new URLSearchParams()
            if (q) params.set('q', q)
            const activo = estado === k
            if (!activo) params.set('estado', k)
            const href = params.toString() ? `/cronos?${params}` : '/cronos'
            return (
              <Link key={k} href={href} className={`font-body text-[9px] tracking-[0.15em] uppercase px-2.5 py-1 border transition-colors ${activo ? 'border-ch-cream text-ch-cream' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}>
                {ESTADO_CRONO_LABELS[k]}
              </Link>
            )
          })}
        </div>
      </div>

      {cronos.length === 0 ? (
        <EstadoVacio
          mensaje={hayFiltro ? 'Ningún crono coincide con el filtro.' : 'Todavía no hay cronos.'}
          submensaje={hayFiltro ? undefined : 'Un crono es el calendario maestro de un proyecto: etapas, rodaje, entregas y pagos en una sola página.'}
          accion={!hayFiltro && <Link href="/cronos/nuevo" className="font-body text-[11px] tracking-[0.15em] uppercase px-4 py-2.5 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors">+ Nuevo crono</Link>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="hidden md:grid px-4" style={{ gridTemplateColumns: '1.6fr 1fr 1.4fr 110px', gap: 16 }}>
            {['Crono', 'Rango', 'Próximo hito clave', 'Estado'].map((t) => <span key={t} className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-muted">{t}</span>)}
          </div>
          {(() => {
            // Variantes (v5): el original primero y sus variantes debajo, con sangría.
            const ids = new Set(cronos.map((c) => c.id))
            const orden: { c: (typeof cronos)[number]; nivel: number }[] = []
            for (const c of cronos) {
              if (c.variante_de && ids.has(c.variante_de)) continue
              orden.push({ c, nivel: 0 })
              for (const v of cronos) if (v.variante_de === c.id) orden.push({ c: v, nivel: 1 })
            }
            return orden
          })().map(({ c, nivel }) => {
            const etapas = rangosEtapas(c)
            const hitos = c.hitos ?? []
            const rango = rangoCrono(etapas, hitos)
            const prox = proximoHitoClave(hitos, hoy)
            const dias = prox && prox.fecha ? diaNum(prox.fecha) - diaNum(hoy) : null
            const cliente = c.cliente || c.proyecto?.cliente?.nombre || null
            return (
              <Link key={c.id} href={`/cronos/${c.id}`} className={`border border-ch-border bg-ch-surface px-4 py-3 grid gap-4 items-center hover:border-ch-cream/30 transition-colors ch-nudge-host ${c.estado === 'cerrado' ? 'opacity-60' : ''} ${nivel ? 'ml-6 border-l-2 border-l-[#e6e2ed]/60' : ''}`} style={{ gridTemplateColumns: '1.6fr 1fr 1.4fr 110px' }}>
                <div className="min-w-0">
                  <p className="font-body text-sm text-ch-cream truncate ch-nudge">{c.variante ? <><span className="text-ch-muted">variante · </span>{c.variante}</> : c.nombre}</p>
                  <p className="font-body text-[11px] text-ch-muted truncate">{c.proyecto ? `Proyecto: ${c.proyecto.nombre}` : 'Sin proyecto'}{cliente ? ` · ${cliente}` : ''}</p>
                  <div className="mt-2"><BarraEtapasMini etapas={etapas} /></div>
                </div>
                <div className="font-body text-xs text-ch-cream">
                  {rango ? (
                    <>
                      {formatoRango(rango.desde, rango.hasta)}
                      <span className="block text-[11px] text-ch-muted">{diaNum(rango.hasta) - diaNum(rango.desde) + 1} días</span>
                    </>
                  ) : <span className="text-ch-subtle">Sin fechas aún</span>}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {prox && prox.fecha ? (
                    <>
                      <span className="bg-ch-cream text-ch-black font-body text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 shrink-0">{nombreTipoHito(prox.tipo)}</span>
                      <span className="font-body text-xs text-ch-cream truncate">{formatoDia(prox.fecha)}{dias != null ? (dias === 0 ? ' · hoy' : ` · en ${dias} día${dias === 1 ? '' : 's'}`) : ''}</span>
                    </>
                  ) : <span className="font-body text-xs text-ch-subtle">—</span>}
                </div>
                <span className={`justify-self-start font-body text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 border ${ESTADO_CLS[c.estado]}`}>{ESTADO_CRONO_LABELS[c.estado]}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
