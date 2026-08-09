import Link from 'next/link'
import { getRepertorio } from '@/app/actions/repertorio'
import {
  contarRotos,
  utilizables,
  ESCALA_LABELS,
  ESTADO_LINK_LABELS,
  type Trabajo,
  type EstadoLink,
} from '@/lib/repertorio'

export const dynamic = 'force-dynamic'

const ESTADO_COLOR: Record<EstadoLink, string> = {
  vivo:        'text-ch-green',
  muerto:      'text-ch-gold',
  sin_revisar: 'text-ch-subtle',
}

export default async function RepertorioPage() {
  const trabajos = await getRepertorio()
  const rotos = contarRotos(trabajos)
  const utiles = utilizables(trabajos)
  const grandes = utiles.filter(t => t.escala === 'grande').length
  const chicas = utiles.filter(t => t.escala === 'chica').length
  const sinEscala = trabajos.filter(t => !t.escala).length

  // Agrupado por rubro: así se ve de inmediato para qué rubros hay con qué
  // escribir y para cuáles todavía no hay nada que mostrar.
  const porRubro = new Map<string, Trabajo[]>()
  for (const t of trabajos) {
    const r = t.rubro?.trim() || 'sin rubro'
    const arr = porRubro.get(r) ?? []
    arr.push(t)
    porRubro.set(r, arr)
  }
  const rubros = [...porRubro.entries()].sort((a, b) => b[1].length - a[1].length)

  const ultimaRevision = trabajos
    .map(t => t.revisado_en)
    .filter((d): d is string => !!d)
    .sort()
    .pop()

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-8">
        <Link href="/crm" className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors mb-2 inline-block">
          ← CRM
        </Link>
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">Módulo CH-10</p>
        <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Repertorio</h1>
        <p className="font-body text-sm text-ch-muted mt-3 max-w-2xl">
          Lo que ya hicimos, con links. Existe para una cosa concreta: cada correo de captación
          lleva dos credenciales, una marca grande que reconozcan y una chica del porte del
          prospecto. Acá se buscan en vez de recordarlas.
        </p>
      </div>

      {trabajos.length === 0 ? (
        <div className="border border-ch-border bg-ch-surface/30 p-10 text-center">
          <p className="font-display italic text-2xl text-ch-cream mb-3">Todavía vacío</p>
          <p className="font-body text-sm text-ch-muted max-w-lg mx-auto leading-relaxed">
            Lo puebla el operador del CRM con <code className="text-ch-green">hilvan_repertorio_escribir</code>,
            sacando los trabajos del sitio, de Instagram y del canal de YouTube. Después
            <code className="text-ch-green"> hilvan_repertorio_revisar</code> comprueba que los links sigan vivos.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <Dato label="Trabajos" valor={`${trabajos.length}`} sub={`${utiles.length} usables como credencial`} />
            <Dato label="Marcas grandes" valor={`${grandes}`} sub="reconocibles" acento={grandes === 0 ? 'gold' : 'green'} />
            <Dato label="Marcas chicas" valor={`${chicas}`} sub="del porte de un prospecto chico" acento={chicas === 0 ? 'gold' : 'green'} />
            <Dato
              label="Links rotos"
              valor={`${rotos}`}
              sub={ultimaRevision ? `última revisión ${ultimaRevision}` : 'nunca revisado'}
              acento={rotos > 0 || !ultimaRevision ? 'gold' : undefined}
            />
          </div>

          {(grandes === 0 || chicas === 0) && (
            <div className="border border-ch-gold bg-ch-gold/10 p-4 mb-8">
              <p className="font-body text-sm text-ch-cream leading-relaxed">
                Falta {grandes === 0 && chicas === 0 ? 'clasificar la escala de los trabajos' : grandes === 0 ? 'al menos una marca grande' : 'al menos una marca chica'}.
                Sin las dos escalas no se puede armar el par de credenciales: mostrarle sólo gigantes a
                una marca chica se lee como &laquo;son muy grandes para mí&raquo;.
                {sinEscala > 0 && <> Hay {sinEscala} sin escala asignada.</>}
              </p>
            </div>
          )}

          <div className="space-y-8">
            {rubros.map(([rubro, lista]) => (
              <section key={rubro}>
                <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-3">
                  {rubro} <span className="text-ch-subtle">· {lista.length}</span>
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {lista.map(t => (
                    <article
                      key={t.id}
                      className={`border border-ch-border bg-ch-surface/30 p-4 ${t.mostrable ? '' : 'opacity-60'}`}
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                        <h3 className="font-display italic text-lg text-ch-cream leading-tight">{t.marca}</h3>
                        <div className="flex gap-1.5 flex-wrap">
                          {t.escala && (
                            <span className="inline-block font-body text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 border border-ch-border text-ch-muted">
                              {ESCALA_LABELS[t.escala]}
                            </span>
                          )}
                          {t.formato && (
                            <span className="inline-block font-body text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 border border-ch-border text-ch-muted">
                              {t.formato}
                            </span>
                          )}
                          {t.anio && <span className="font-body text-[11px] text-ch-subtle tabular-nums">{t.anio}</span>}
                        </div>
                      </div>

                      {!t.mostrable && (
                        <p className="font-body text-[10px] tracking-[0.15em] uppercase text-ch-gold mb-2">
                          No mostrable — sólo contexto
                        </p>
                      )}

                      {t.descripcion && (
                        <p className="font-body text-xs text-ch-muted leading-relaxed mb-3">{t.descripcion}</p>
                      )}

                      {t.links.length > 0 && (
                        <ul className="space-y-1">
                          {t.links.map(l => (
                            <li key={l.url} className="flex items-baseline gap-2">
                              <span className={`font-body text-[9px] tracking-[0.1em] uppercase shrink-0 ${ESTADO_COLOR[l.estado]}`}>
                                {ESTADO_LINK_LABELS[l.estado]}
                              </span>
                              <a
                                href={l.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`font-body text-[11px] break-all transition-colors ${
                                  l.estado === 'muerto'
                                    ? 'text-ch-subtle line-through hover:text-ch-muted'
                                    : 'text-ch-muted hover:text-ch-green'
                                }`}
                              >
                                {l.titulo || l.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      <p className="font-body text-[11px] text-ch-subtle mt-8">
        Lo escribe el operador del CRM. Esta vista es de consulta: para agregar o corregir un
        trabajo, pídeselo al chat del CRM.
      </p>
    </div>
  )
}

function Dato({ label, valor, sub, acento }: { label: string; valor: string; sub: string; acento?: 'green' | 'gold' }) {
  const color = acento === 'green' ? 'text-ch-green' : acento === 'gold' ? 'text-ch-gold' : 'text-ch-cream'
  return (
    <div className="border border-ch-border bg-ch-surface/30 p-4">
      <p className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-subtle mb-2">{label}</p>
      <p className={`font-display italic text-3xl leading-none ${color}`}>{valor}</p>
      <p className="font-body text-[11px] text-ch-muted mt-2">{sub}</p>
    </div>
  )
}
