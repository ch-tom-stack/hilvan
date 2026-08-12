'use client'

import { useEffect, useState } from 'react'
import { revisarMedallas, type EstadoMedallas } from '@/app/actions/medallas'
import {
  CAPITULOS, MEDALLAS, RAREZA_LABEL, visiblesDe, ocultas, progresoMedalla,
  puntosDe, puntosTotales, rangoDe, nivelDe,
  type DefinicionMedalla, type DatosMedallas,
} from '@/lib/crm-medallas'
import Emblema from '@/components/perfil/Emblema'
import RitmoActual from '@/components/perfil/RitmoActual'
import Resumen from '@/components/perfil/Resumen'
import { momento } from '@/lib/momentos'
import { getPreferencias, setPreferencias } from '@/lib/preferencias'
import { EVENTO_MEDALLA } from '@/components/perfil/RevelacionMedalla'
import { formatFecha } from '@/lib/fechas'

/**
 * Vitrina de medallas, en tres capítulos.
 *
 * La narrativa está en lib/crm-medallas.ts: la app se llama Hilván —la puntada
 * provisional que sostiene la tela antes de la costura— y captar es exactamente
 * eso. Los capítulos son el arco real de un prospecto, no una decoración.
 *
 * Las no ganadas se muestran con su criterio a la vista: la gracia está en
 * verlas venir. Y la rareza tiene peso visual, porque cerrar un prospecto frío
 * no puede verse igual que registrar el primer contacto.
 */
export default function Medallas() {
  const [estado, setEstado] = useState<EstadoMedallas | null>(null)
  const [visibles, setVisibles] = useState(true)

  useEffect(() => { setVisibles(getPreferencias().medallas) }, [])

  useEffect(() => {
    // Apagadas: no se revisa siquiera. Apagar algo que igual corre por detrás
    // no es una preferencia, es un adorno.
    if (!visibles) return
    let vivo = true
    revisarMedallas()
      .then(e => {
        if (!vivo) return
        setEstado(e)
        // Sólo lo que se acaba de registrar. La acción es idempotente, así que
        // recargar la página no vuelve a celebrar nada. La tanda va entera en
        // un evento: quien decide cómo se celebra es la revelación.
        if (e.nuevas.length > 0) {
          window.dispatchEvent(new CustomEvent(EVENTO_MEDALLA, { detail: { claves: e.nuevas } }))
        }
      })
      .catch(() => { /* quedarse sin vitrina es un degradado aceptable */ })
    return () => { vivo = false }
  }, [visibles])

  const alternar = (v: boolean) => { setPreferencias({ medallas: v }); setVisibles(v) }

  // Apagadas: queda la línea para volver a encenderlas. Desaparecer del todo
  // convertiría una preferencia en una puerta sin manilla.
  if (!visibles) {
    return (
      <div className="border border-ch-border bg-ch-surface/20 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <p className="font-body text-[11px] text-ch-subtle">Medallas ocultas.</p>
        <button
          onClick={() => alternar(true)}
          className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors"
        >
          Mostrar
        </button>
      </div>
    )
  }

  if (!estado) return null

  const ganadas = new Map(estado.ganadas.map(g => [g.medalla, g]))
  const esteMes = new Set(estado.esteMes)
  const nuevas = new Set(estado.nuevas)
  const puntos = puntosDe([...ganadas.keys()])
  const { actual, siguiente, fraccion } = rangoDe(puntos)
  let orden = 0   // el escalonado es continuo entre capítulos, no se reinicia

  return (
    <div>
      {/* Portada */}
      <div className="flex items-baseline justify-between gap-4 mb-1 flex-wrap">
        <div className="flex items-center gap-4">
          <span className="font-body text-[10px] text-ch-subtle tabular-nums">
            {ganadas.size} de {MEDALLAS.length}
          </span>
          <button
            onClick={() => alternar(false)}
            title="Ocultar medallas"
            className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-subtle hover:text-ch-cream transition-colors"
          >
            Ocultar
          </button>
        </div>
      </div>
      <p className="font-display italic text-2xl text-ch-cream leading-tight mt-2 max-w-lg">
        Un hilván es la puntada que sostiene la tela antes de la costura.
      </p>
      <p className="font-body text-[11px] text-ch-subtle leading-relaxed mt-2 max-w-prose">
        Captar es eso: puntadas que puede que se suelten, y algunas se vuelven costura.
        Ninguna de estas medallas te compara con el resto del equipo — son sobre tu
        propia historia. Cuentan desde que la app registra quién hace cada cosa;
        lo anterior no tiene autor y no se le puede atribuir a nadie.
      </p>

      {/* Rango. El progreso profesional no es la cuenta de medallas sino su
          peso: una legendaria vale doce comunes. Sin esto, coleccionar las
          fáciles se vería igual de lejos que hacer el trabajo difícil. */}
      <div className="border border-ch-border bg-ch-black/20 p-4 mt-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <p className="font-display italic text-2xl text-ch-cream leading-none">{actual.titulo}</p>
          <span className="font-body text-[10px] tracking-[0.2em] uppercase text-ch-subtle tabular-nums">
            {puntos} de {puntosTotales()} puntos
          </span>
        </div>
        <p className="font-body text-[11px] text-ch-muted italic mt-1.5">{actual.glosa}</p>
        {siguiente && (
          <div className="mt-3">
            <div className="w-full h-px bg-ch-border relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-ch-green ch-bar-fill"
                style={{ width: `${Math.round(fraccion * 100)}%`, ['--w' as string]: `${Math.round(fraccion * 100)}%` }}
              />
            </div>
            <p className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle mt-1.5">
              {siguiente.desde - puntos} para {siguiente.titulo}
            </p>
          </div>
        )}
      </div>

      {/* El ritmo va DEBAJO del histórico: primero lo que llevas acumulado,
          después cómo vienes. Al revés, el período se leería como la medida
          principal y una semana mala taparía un año bueno. */}
      <MasCerca estado={estado} ganadas={ganadas} esteMes={esteMes} />

      <RitmoActual />
      <Resumen />

      {CAPITULOS.map(cap => {
        const medallas = visiblesDe(cap.clave)
        const listas = medallas.filter(m => ganadas.has(m.clave)).length
        return (
          <section key={cap.clave} className="mt-8 first:mt-7">
            <div className="flex items-baseline gap-3 border-t border-ch-border pt-4 mb-1">
              <span className="font-display italic text-lg text-ch-green leading-none shrink-0">
                {cap.numero}
              </span>
              <h3 className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-cream">
                {cap.titulo}
              </h3>
              <span className="font-body text-[10px] text-ch-subtle tabular-nums ml-auto shrink-0">
                {listas}/{medallas.length}
              </span>
            </div>
            <p className="font-body text-[11px] text-ch-subtle italic mb-3">{cap.bajada}</p>

            <div className="grid gap-2 sm:grid-cols-2">
              {medallas.map(m => (
                <Medalla
                  key={m.clave}
                  def={m}
                  logro={ganadas.get(m.clave) ?? null}
                  activa={m.alcance === 'mensual' ? esteMes.has(m.clave) : ganadas.has(m.clave)}
                  datos={m.alcance === 'mensual' ? estado.datosMes : estado.datos}
                  indice={orden++}
                  nueva={nuevas.has(m.clave)}
                />
              ))}
            </div>
          </section>
        )
      })}

      <Sorpresas ganadas={ganadas} esteMes={esteMes} estado={estado} desde={orden} nuevas={nuevas} />
    </div>
  )
}

/**
 * La medalla más cerca de caer.
 *
 * El efecto de gradiente de meta dice que el esfuerzo acelera cerca del
 * objetivo — pero eso sólo sirve si sabes cuál está cerca. Con 38 tarjetas hay
 * que buscarla, y buscar es justo lo que nadie hace.
 *
 * Excluye las ocultas: mostrar "te falta poco" para algo que no se anuncia
 * arruinaría la sorpresa, que es toda su gracia.
 */
function MasCerca({
  estado, ganadas, esteMes,
}: {
  estado: EstadoMedallas
  ganadas: Map<string, { veces: number; ultima: string }>
  esteMes: Set<string>
}) {
  const candidatas = MEDALLAS
    .filter(m => !m.oculta)
    .filter(m => (m.alcance === 'mensual' ? !esteMes.has(m.clave) : !ganadas.has(m.clave)))
    .map(m => ({
      m,
      p: progresoMedalla(m.clave, m.alcance === 'mensual' ? estado.datosMes : estado.datos),
    }))
    .filter((x): x is { m: DefinicionMedalla; p: { fraccion: number; texto: string } } => !!x.p && x.p.fraccion > 0)
    .sort((a, b) => b.p.fraccion - a.p.fraccion)

  const top = candidatas[0]
  if (!top || top.p.fraccion < 0.25) return null   // "1 de 100" no es estar cerca

  return (
    <div className="border border-ch-green/30 bg-ch-green/5 p-4 mt-3">
      <div className="flex items-center gap-3">
        <div className="text-ch-green"><Emblema clave={top.m.clave} /></div>
        <div className="min-w-0">
          <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-green">La más cerca</p>
          <p className="font-display italic text-xl text-ch-cream leading-tight mt-0.5">{top.m.titulo}</p>
        </div>
        <span className="font-body text-[10px] tracking-[0.15em] uppercase text-ch-muted ml-auto shrink-0 tabular-nums">
          {top.p.texto}
        </span>
      </div>
      <div className="w-full h-px bg-ch-border relative overflow-hidden mt-3">
        <div
          className="absolute inset-y-0 left-0 bg-ch-green ch-bar-fill"
          style={{ width: `${Math.round(top.p.fraccion * 100)}%`, ['--w' as string]: `${Math.round(top.p.fraccion * 100)}%` }}
        />
      </div>
      <p className="font-body text-[11px] text-ch-muted mt-2">{top.m.criterio}</p>
    </div>
  )
}

/**
 * Las ocultas. Se anuncia que existen y cuántas son, pero no cuáles: la
 * curiosidad es el punto. Todas se ganan trabajando normal — ninguna pide
 * hacer algo raro a propósito, y ninguna premia inflar el contador.
 */
function Sorpresas({
  ganadas, esteMes, estado, desde, nuevas,
}: {
  ganadas: Map<string, { veces: number; ultima: string }>
  esteMes: Set<string>
  estado: EstadoMedallas
  desde: number
  nuevas: Set<string>
}) {
  const todas = ocultas()
  const listas = todas.filter(m => ganadas.has(m.clave))
  const faltan = todas.length - listas.length

  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-3 border-t border-ch-border pt-4 mb-1">
        <span className="font-display italic text-lg text-ch-gold leading-none shrink-0">?</span>
        <h3 className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-cream">Sorpresas</h3>
        <span className="font-body text-[10px] text-ch-subtle tabular-nums ml-auto shrink-0">
          {listas.length}/{todas.length}
        </span>
      </div>
      <p className="font-body text-[11px] text-ch-subtle italic mb-3">
        No se anuncian. Aparecen solas trabajando como siempre.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {listas.map((m, i) => (
          <Medalla
            key={m.clave}
            def={m}
            logro={ganadas.get(m.clave)!}
            activa={m.alcance === 'mensual' ? esteMes.has(m.clave) : true}
            datos={m.alcance === 'mensual' ? estado.datosMes : estado.datos}
            indice={desde + i}
            nueva={nuevas.has(m.clave)}
          />
        ))}
        {faltan > 0 && (
          <div
            style={{ ['--i' as string]: desde + listas.length }}
            className="border border-dashed border-ch-border p-3.5 ch-fade-up ch-stagger flex items-center justify-center min-h-[72px]"
          >
            <p className="font-body text-[10px] tracking-[0.25em] uppercase text-ch-subtle/70">
              {faltan} por descubrir
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function Medalla({
  def, logro, activa, datos, indice, nueva = false,
}: {
  def: DefinicionMedalla
  /** Historial de la medalla: cuántos meses y el último. null si nunca. */
  logro: { veces: number; ultima: string } | null
  /** Conseguida en la ventana que le toca: el mes en curso, o alguna vez. */
  activa: boolean
  datos: DatosMedallas
  indice: number
  /** Se acaba de ganar en esta sesión: el emblema se dibuja solo. */
  nueva?: boolean
}) {
  const ganada = activa
  const veces = logro?.veces ?? 0
  const nivel = nivelDe(veces)
  // Una mensual ya ganada antes pero no este mes muestra su progreso del mes:
  // el nivel se conserva, la vuelta se juega de nuevo.
  const prog = ganada ? null : progresoMedalla(def.clave, datos)

  // Tres pesos, no dos. El dorado es el acento que el sistema reserva para lo
  // excepcional, y la legendaria además estrena el barrido del borde: si las
  // veintiséis se vieran igual, tenerlas todas valdría lo mismo que tener las
  // cinco fáciles.
  const preciada = def.rareza === 'rara' || def.rareza === 'legendaria'
  const marco = !ganada
    ? 'border-ch-border'
    : def.rareza === 'legendaria'
      ? 'border-ch-gold bg-ch-gold/10 ch-glow-hito'
      : def.rareza === 'rara'
        ? 'border-ch-gold/50 bg-ch-gold/5'
        : 'border-ch-green/40 bg-ch-green/5'

  const titulo = !ganada
    ? 'text-ch-subtle'
    : preciada ? 'text-ch-gold' : 'text-ch-cream'

  return (
    <div
      style={{ ['--i' as string]: indice }}
      className={`border p-3.5 transition-colors ${
        nueva ? 'ch-medalla-nueva' : ganada && def.rareza === 'legendaria' ? '' : 'ch-fade-up ch-stagger'
      } ${marco}`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className={`flex items-center gap-2.5 min-w-0 ${titulo}`}>
          <Emblema
            clave={def.clave}
            nueva={nueva}
            className={ganada ? '' : logro ? 'opacity-60' : 'opacity-40'}
            nivel={nivel}
          />
          <p className="font-display italic text-lg leading-tight">{def.titulo}</p>
        </div>
        {logro ? (
          <span className={`font-body text-[9px] tracking-[0.15em] uppercase shrink-0 ${
            preciada ? 'text-ch-gold' : ganada ? 'text-ch-green' : 'text-ch-subtle'
          }`}>
            {veces > 1 ? `×${veces} · ` : ''}{formatFecha(logro.ultima)}
          </span>
        ) : RAREZA_LABEL[def.rareza] ? (
          <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle/70 shrink-0">
            {RAREZA_LABEL[def.rareza]}
          </span>
        ) : null}
      </div>

      <p className={`font-body text-[11px] leading-relaxed mt-1 ${ganada ? 'text-ch-muted' : 'text-ch-subtle'}`}>
        {def.criterio}
      </p>
      {def.nota && (
        <p className="font-body text-[10px] text-ch-subtle/70 italic mt-1 leading-relaxed">{def.nota}</p>
      )}

      {/* Barra sólo en las de conteo, y sólo si ya arrancó: una barra en cero
          no informa, sólo recuerda que no has empezado. */}
      {prog && prog.fraccion > 0 && (
        <div className="mt-2.5">
          <div className="w-full h-px bg-ch-border relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-ch-muted ch-bar-fill"
              style={{
                width: `${Math.round(prog.fraccion * 100)}%`,
                ['--w' as string]: `${Math.round(prog.fraccion * 100)}%`,
              }}
            />
          </div>
          <p className="font-body text-[9px] tracking-[0.15em] uppercase text-ch-subtle mt-1.5 tabular-nums">
            {prog.texto}
          </p>
        </div>
      )}
    </div>
  )
}
