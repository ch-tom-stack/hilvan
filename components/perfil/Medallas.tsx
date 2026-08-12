'use client'

import { useEffect, useState } from 'react'
import { revisarMedallas, type EstadoMedallas } from '@/app/actions/medallas'
import {
  CAPITULOS, MEDALLAS, RAREZA_LABEL, visiblesDe, ocultas, progresoMedalla,
  puntosDe, puntosTotales, rangoDe,
  type DefinicionMedalla, type DatosMedallas,
} from '@/lib/crm-medallas'
import Emblema from '@/components/perfil/Emblema'
import { momento } from '@/lib/momentos'
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

  useEffect(() => {
    let vivo = true
    revisarMedallas()
      .then(e => {
        if (!vivo) return
        setEstado(e)
        // Sólo lo que se acaba de registrar. La acción es idempotente, así que
        // recargar la página no vuelve a celebrar nada.
        for (const clave of e.nuevas) {
          const def = MEDALLAS.find(m => m.clave === clave)
          if (def) momento('hito.alcanzado', { mensaje: `Medalla: ${def.titulo}` })
        }
      })
      .catch(() => { /* quedarse sin vitrina es un degradado aceptable */ })
    return () => { vivo = false }
  }, [])

  if (!estado) return null

  const ganadas = new Map(estado.ganadas.map(g => [g.medalla, g.ganada_en]))
  const nuevas = new Set(estado.nuevas)
  const puntos = puntosDe([...ganadas.keys()])
  const { actual, siguiente, fraccion } = rangoDe(puntos)
  let orden = 0   // el escalonado es continuo entre capítulos, no se reinicia

  return (
    <div className="border border-ch-border bg-ch-surface/30 p-5 lg:p-7">
      {/* Portada */}
      <div className="flex items-baseline justify-between gap-4 mb-1 flex-wrap">
        <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted">Medallas</h2>
        <span className="font-body text-[10px] text-ch-subtle tabular-nums">
          {ganadas.size} de {MEDALLAS.length}
        </span>
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
                  fecha={ganadas.get(m.clave) ?? null}
                  datos={estado.datos}
                  indice={orden++}
                  nueva={nuevas.has(m.clave)}
                />
              ))}
            </div>
          </section>
        )
      })}

      <Sorpresas ganadas={ganadas} datos={estado.datos} desde={orden} nuevas={nuevas} />
    </div>
  )
}

/**
 * Las ocultas. Se anuncia que existen y cuántas son, pero no cuáles: la
 * curiosidad es el punto. Todas se ganan trabajando normal — ninguna pide
 * hacer algo raro a propósito, y ninguna premia inflar el contador.
 */
function Sorpresas({
  ganadas, datos, desde, nuevas,
}: {
  ganadas: Map<string, string>
  datos: DatosMedallas
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
          <Medalla key={m.clave} def={m} fecha={ganadas.get(m.clave)!} datos={datos} indice={desde + i} nueva={nuevas.has(m.clave)} />
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
  def, fecha, datos, indice, nueva = false,
}: {
  def: DefinicionMedalla
  fecha: string | null
  datos: DatosMedallas
  indice: number
  /** Se acaba de ganar en esta sesión: el emblema se dibuja solo. */
  nueva?: boolean
}) {
  const ganada = fecha !== null
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
          <Emblema clave={def.clave} nueva={nueva} className={ganada ? '' : 'opacity-40'} />
          <p className="font-display italic text-lg leading-tight">{def.titulo}</p>
        </div>
        {ganada ? (
          <span className={`font-body text-[9px] tracking-[0.15em] uppercase shrink-0 ${
            preciada ? 'text-ch-gold' : 'text-ch-green'
          }`}>
            {formatFecha(fecha!)}
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
