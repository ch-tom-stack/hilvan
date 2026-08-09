import Link from 'next/link'
import { getBibliotecaContactos } from '@/app/actions/crm'
import { TEMPERATURA_LABELS, TEMPERATURA_TEXTO, type Temperatura } from '@/lib/crm-temperatura'

function n1(x: number): string {
  return x.toLocaleString('es-CL', { maximumFractionDigits: 1 })
}
function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

export default async function BibliotecaPage() {
  const b = await getBibliotecaContactos()

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8">
        <Link href="/crm" className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors mb-2 inline-block">
          ← CRM
        </Link>
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">Módulo CH-10</p>
        <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Biblioteca de contactos</h1>
        <p className="font-body text-sm text-ch-muted mt-3 max-w-2xl">
          Cómo se comportan los contactos en cada etapa. Data empírica en vivo para
          afinar las recomendaciones — se enriquece sola a medida que registras contactos.
        </p>
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        <Highlight
          label="Cierre promedio"
          valor={b.cierre.n ? n1(b.cierre.promedio) : '—'}
          sub={b.cierre.n ? `mediana ${n1(b.cierre.mediana)} · ${b.cierre.n} confirmados` : 'sin confirmados aún'}
          acento="green"
        />
        <Highlight
          label="Hipótesis"
          valor="16"
          sub="el ~80% acepta cerca del toque 16"
        />
        <Highlight
          label="Enfriados"
          valor={b.frio.n ? n1(b.frio.promedio) : '—'}
          sub={b.frio.n ? `mediana ${n1(b.frio.mediana)} · ${b.frio.n} en frío` : 'ninguno en frío'}
          acento="gold"
        />
        <Highlight
          label="Tasa de respuesta"
          valor={pct(b.tasaRespuestaGlobal)}
          sub={`${b.totalContactos} contactos registrados`}
        />
      </div>

      {/* Lectura rápida */}
      {b.cierre.n > 0 && (
        <div className="border border-ch-border bg-ch-surface/30 p-5 mb-10">
          <p className="font-body text-sm text-ch-cream leading-relaxed">
            Tus confirmados cerraron en promedio al <strong className="text-ch-green">toque {n1(b.cierre.promedio)}</strong> (mediana {n1(b.cierre.mediana)}).
            {b.frio.n > 0 && <> Los enfriados se detuvieron en promedio al <strong className="text-ch-gold">toque {n1(b.frio.promedio)}</strong> — si es mucho menor que el cierre, quizá conviene insistir más antes de enfriar.</>}
          </p>
        </div>
      )}

      {/* Por temperatura de origen */}
      <div className="mb-10">
        <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-2">Frío vs entrante</h2>
        <p className="font-body text-[11px] text-ch-subtle mb-4 max-w-2xl">
          Un entrante llega con el interés ya declarado y cierra en muchos menos toques que
          uno frío. Promediarlos juntos da un número que no describe a ninguno de los dos —
          la hipótesis de los 16 toques sólo tiene sentido medida contra la fila de frío.
        </p>
        <div className="border border-ch-border overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-ch-border">
                {['Origen', 'Prospectos', 'Contactos prom.', 'Mediana', 'Tasa respuesta', 'Cierre prom.'].map(h => (
                  <th key={h} className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.porTemperatura.map(t => (
                <tr key={t.temperatura} className="border-b border-ch-border/50">
                  <td className={`px-4 py-3 font-body text-sm ${TEMPERATURA_TEXTO[t.temperatura as Temperatura] ?? 'text-ch-cream'}`}>
                    {TEMPERATURA_LABELS[t.temperatura as Temperatura] ?? t.temperatura}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-ch-muted tabular-nums">{t.prospectos}</td>
                  <td className="px-4 py-3 font-body text-sm text-ch-muted tabular-nums">{n1(t.promedioContactos)}</td>
                  <td className="px-4 py-3 font-body text-sm text-ch-muted tabular-nums">{n1(t.medianaContactos)}</td>
                  <td className="px-4 py-3 font-body text-sm text-ch-muted tabular-nums">{pct(t.tasaRespuesta)}</td>
                  <td className="px-4 py-3 font-body text-sm text-ch-muted tabular-nums">
                    {t.cierre.n ? `${n1(t.cierre.promedio)} · ${t.cierre.n} conf.` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla por etapa */}
      <div className="border border-ch-border overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-ch-border">
              {['Etapa', 'Prospectos', 'Contactos prom.', 'Mediana', 'Tasa respuesta'].map(h => (
                <th key={h} className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.porEtapa.map(e => (
              <tr key={e.etapa} className="border-b border-ch-border/50">
                <td className="px-4 py-3 font-body text-sm text-ch-cream">{e.label}</td>
                <td className="px-4 py-3 font-body text-sm text-ch-muted tabular-nums">{e.prospectos}</td>
                <td className="px-4 py-3 font-body text-sm text-ch-muted tabular-nums">{e.prospectos ? n1(e.promedioContactos) : '—'}</td>
                <td className="px-4 py-3 font-body text-sm text-ch-muted tabular-nums">{e.prospectos ? n1(e.medianaContactos) : '—'}</td>
                <td className="px-4 py-3 font-body text-sm text-ch-muted tabular-nums">{e.prospectos ? pct(e.tasaRespuesta) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-body text-[11px] text-ch-subtle mt-4">
        Nota: con pocos datos los promedios se mueven mucho. Gana valor a medida que
        registras más contactos y confirmaciones.
      </p>
    </div>
  )
}

function Highlight({ label, valor, sub, acento }: { label: string; valor: string; sub: string; acento?: 'green' | 'gold' }) {
  const color = acento === 'green' ? 'text-ch-green' : acento === 'gold' ? 'text-ch-gold' : 'text-ch-cream'
  return (
    <div className="border border-ch-border bg-ch-surface/30 p-4">
      <p className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-subtle mb-2">{label}</p>
      <p className={`font-display italic text-3xl leading-none ${color}`}>{valor}</p>
      <p className="font-body text-[11px] text-ch-muted mt-2">{sub}</p>
    </div>
  )
}
