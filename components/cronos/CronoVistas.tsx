// CH-11 CRONOS v2 — las vistas del crono.
//
// Dos mundos en una pantalla (decisión de Tomás, sep-2026):
//   LA HOJA: lo que se imprime. Blanco, negro y tintes lila (paleta Casa Hiedra,
//   NO los tokens de Hilván). Encabezado de una línea → etapas → tira general →
//   calendario semanal de alto variable, con fines de semana y feriados angostos y
//   tramados. Sin íconos: cada hito es una etiqueta con título, detalle y
//   responsable, siempre con el texto completo.
//   EL PANEL: lo que informa y no se imprime. Chrome de Hilván (tokens ch-*).
//
// Todo es puro (sin 'use client', sin hooks); los handlers son opcionales para
// que la misma hoja sirva a un export de solo lectura.

import {
  DIAS_CORTOS_CRONO,
  MESES_CORTOS_CRONO,
  diaNum,
  diaSemana,
  diasDeSemana,
  esFinde,
  esHitoClave,
  etapaDeFecha,
  fechaValida,
  finEfectivoEtapa,
  formatoCorto,
  formatoDia,
  formatoRango,
  hitosDelDia,
  isoDeDia,
  nombreTipoHito,
  partesFecha,
  rangoCrono,
  type AvisoCrono,
  type GrupoCompuertas,
  type LecturaEtapa,
  type MapaFeriados,
  type RangoEtapa,
} from '@/lib/crono'
import { ETAPAS_CRONO, formatCLP, type CronoHito, type EtapaCrono } from '@/types'

export type HitoVista = Pick<CronoHito, 'id' | 'tipo' | 'titulo' | 'fecha' | 'fecha_fin' | 'etapa' | 'monto' | 'notas' | 'responsable' | 'hecho' | 'orden'>

// Paleta Casa Hiedra (la hoja). Literal a propósito: la hoja es un documento de la
// casa, no una pantalla de Hilván.
export const CH = {
  negro: '#0a0a0a',
  blanco: '#ffffff',
  lila: '#e6e2ed',
  lilaFuerte: '#cfc6dd',
  gris: '#353135',
  grisClaro: '#8a8590',
  linea: '#d8d5de',
  rojo: '#c11700',
  amarillo: '#e8c547',
  verde: '#7a9e7e',
}

// El motivo de líneas diagonales, en lila, distingue las etapas: desarrollo y pre
// suben hacia la derecha (135deg) con distinta densidad; producción es la única
// sólida (es la que mueve al equipo); post va en la dirección CONTRARIA (45deg),
// para que "antes" y "después" del rodaje se lean de un vistazo.
export const ETAPA_FONDO: Record<EtapaCrono, string> = {
  desarrollo: `repeating-linear-gradient(135deg, ${CH.lila} 0 3px, ${CH.blanco} 3px 12px)`,
  pre:        `repeating-linear-gradient(135deg, ${CH.lila} 0 7px, ${CH.blanco} 7px 12px)`,
  produccion: CH.lilaFuerte,
  post:       `repeating-linear-gradient(45deg, ${CH.lila} 0 5px, ${CH.blanco} 5px 12px)`,
}
// Feriado: el mismo motivo, fino y gris — es lo que informa. Fin de semana: gris
// plano, sin líneas (angosto ya dice lo suyo; el motivo se reserva al feriado).
export const FERIADO_FONDO = `repeating-linear-gradient(135deg, ${CH.linea} 0 1.5px, ${CH.blanco} 1.5px 6px)`
export const FINDE_FONDO = '#f4f3f6'
/** @deprecated usa FERIADO_FONDO / FINDE_FONDO */
export const NO_HABIL_FONDO = FERIADO_FONDO

const LBL: React.CSSProperties = { fontSize: 8, letterSpacing: '0.35em', textTransform: 'uppercase', color: CH.gris }

// ─── LA HOJA ─────────────────────────────────────────────────────────────────

export function EncabezadoHoja({ nombre, cliente, meta }: { nombre: string; cliente?: string | null; meta?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, borderBottom: `1.5px solid ${CH.negro}`, paddingBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
        <span className="font-display italic" style={{ fontSize: 26, lineHeight: 1, color: CH.negro, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombre || 'Sin nombre'}</span>
        <span style={{ fontSize: 11, color: CH.gris, whiteSpace: 'nowrap' }}>Cronograma{cliente ? ` · ${cliente}` : ''}</span>
      </div>
      {meta && <span style={{ ...LBL, whiteSpace: 'nowrap' }}>{meta}</span>}
    </div>
  )
}

export function EtapasHoja({
  lectura,
  etapas,
  onCambiar,
}: {
  lectura: LecturaEtapa[]
  etapas: Record<EtapaCrono, RangoEtapa>
  /** Con handler, cada tarjeta muestra los dos inputs de fecha (solo en pantalla). */
  onCambiar?: (id: EtapaCrono, campo: 'desde' | 'hasta', valor: string) => void
}) {
  const input: React.CSSProperties = { flex: 1, minWidth: 0, background: 'transparent', border: 'none', borderBottom: `1px solid ${CH.linea}`, color: CH.negro, fontSize: 11, padding: '2px 0', fontFamily: 'inherit', colorScheme: 'light' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4 }}>
      {lectura.map((l) => {
        const et = etapas[l.id]
        return (
          <div key={l.id} style={{ background: ETAPA_FONDO[l.id], padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={LBL}>{l.nombre}</span>
            {onCambiar ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="date" value={et.desde ?? ''} onChange={(e) => onCambiar(l.id, 'desde', e.target.value)} style={input} aria-label={`${l.nombre} desde`} />
                <input type="date" value={et.hasta ?? ''} onChange={(e) => onCambiar(l.id, 'hasta', e.target.value)} style={input} aria-label={`${l.nombre} hasta`} />
              </div>
            ) : (
              <span style={{ fontSize: 13, color: CH.negro }}>{l.desde ? formatoRango(l.desde, l.hasta) + (et.hasta ? '' : ' →') : '—'}</span>
            )}
            <span style={{ fontSize: 9, color: CH.gris }}>{l.corridos > 0 ? `${l.corridos} días · ${l.habiles} hábiles` : 'sin fechas'}</span>
          </div>
        )
      })}
    </div>
  )
}

/** La tira general: las etapas como bandas, los hitos clave como líneas finas, hoy en rojo. */
export function TiraGeneral({ etapas, hitos, hoy }: { etapas: Record<EtapaCrono, RangoEtapa>; hitos: HitoVista[]; hoy?: string }) {
  const rango = rangoCrono(etapas, hitos)
  if (!rango) return null
  let d0 = diaNum(rango.desde) - 3
  let d1 = diaNum(rango.hasta) + 3
  if (d1 - d0 < 21) { const c = Math.round((d0 + d1) / 2); d0 = c - 10; d1 = c + 10 }
  const span = d1 - d0 + 1
  const W = 1000, H = 44
  const dayW = W / span
  const x = (n: number) => (n - d0) * dayW
  const meses: { n: number; label: string }[] = []
  {
    let { y, m } = partesFecha(isoDeDia(d0))
    for (let i = 0; i < 40; i++) {
      const n = diaNum(`${y}-${String(m).padStart(2, '0')}-01`)
      if (n > d1) break
      if (n >= d0) meses.push({ n, label: MESES_CORTOS_CRONO[m - 1] })
      if (++m > 12) { m = 1; y++ }
    }
  }
  const hoyN = hoy && fechaValida(hoy) ? diaNum(hoy) : null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 44, display: 'block' }} role="img" aria-label="Vista general">
      <defs>
        {ETAPAS_CRONO.map((e) => (
          <pattern key={e.id} id={`crono-p-${e.id}`} patternUnits="userSpaceOnUse" width="12" height="12" patternTransform={`rotate(${e.id === 'post' ? 45 : 135})`}>
            <rect width="12" height="12" fill={CH.blanco} />
            <rect width={e.id === 'pre' ? 7 : e.id === 'produccion' ? 12 : e.id === 'post' ? 5 : 3} height="12" fill={e.id === 'produccion' ? CH.lilaFuerte : CH.lila} />
          </pattern>
        ))}
      </defs>
      {ETAPAS_CRONO.map((e) => {
        const et = etapas[e.id]
        const fin = finEfectivoEtapa(etapas, e.id, diaNum(rango.hasta))
        if (!et.desde || !fechaValida(et.desde) || fin == null) return null
        const x1 = x(diaNum(et.desde)), x2 = x(fin) + dayW
        return (
          <g key={e.id}>
            <rect x={x1} y={8} width={Math.max(2, x2 - x1)} height={20} fill={`url(#crono-p-${e.id})`} />
            {x2 - x1 > 70 && <text x={x1 + 5} y={21} fill={CH.negro} fontSize={9} letterSpacing={1.5} style={{ fontFamily: 'inherit' }}>{e.nombre.toUpperCase()}</text>}
          </g>
        )
      })}
      {meses.map((m) => (
        <g key={m.n}>
          <line x1={x(m.n)} x2={x(m.n)} y1={4} y2={34} stroke={CH.linea} />
          <text x={x(m.n) + 3} y={42} fill={CH.gris} fontSize={8} letterSpacing={1.5}>{m.label.toUpperCase()}</text>
        </g>
      ))}
      {hitos.filter((h) => esHitoClave(h.tipo) && fechaValida(h.fecha)).map((h) => (
        <line key={h.id} x1={x(diaNum(h.fecha!)) + dayW / 2} x2={x(diaNum(h.fecha!)) + dayW / 2} y1={4} y2={32} stroke={CH.negro} strokeWidth={1.5} opacity={h.hecho ? 0.35 : 1}>
          <title>{`${h.titulo || nombreTipoHito(h.tipo)} · ${formatoDia(h.fecha)}`}</title>
        </line>
      ))}
      {hoyN != null && hoyN >= d0 && hoyN <= d1 && <line x1={x(hoyN) + dayW / 2} x2={x(hoyN) + dayW / 2} y1={2} y2={34} stroke={CH.rojo} strokeDasharray="3 2" />}
    </svg>
  )
}

export interface CalendarioHojaProps {
  etapas: Record<EtapaCrono, RangoEtapa>
  hitos: HitoVista[]
  semanas: string[]
  feriados: MapaFeriados
  hoy?: string
  rango?: { desde: string; hasta: string } | null
  seleccionado?: string | null
  onClickDia?: (iso: string, e: React.MouseEvent<HTMLElement>) => void
  onClickHito?: (id: string, e: React.MouseEvent<HTMLElement>) => void
  onMoverHito?: (id: string, isoDestino: string) => void
}

function estiloEtiqueta(h: HitoVista, cont: boolean, sel: boolean): React.CSSProperties {
  const clave = esHitoClave(h.tipo)
  return {
    display: 'block',
    padding: '3px 5px',
    marginTop: 3,
    lineHeight: 1.25,
    background: clave ? CH.negro : CH.blanco,
    color: clave ? CH.blanco : CH.negro,
    border: clave ? 'none' : `1px solid ${CH.linea}`,
    opacity: h.hecho ? 0.45 : cont ? 0.6 : 1,
    textDecoration: h.hecho ? 'line-through' : 'none',
    outline: sel ? `1.5px solid ${CH.rojo}` : 'none',
    userSelect: 'none',
  }
}

export function CalendarioHoja({ etapas, hitos, semanas, feriados, hoy, rango, seleccionado, onClickDia, onClickHito, onMoverHito }: CalendarioHojaProps) {
  const rIni = rango ? diaNum(rango.desde) : null
  const rFin = rango ? diaNum(rango.hasta) : null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr)) 0.42fr 0.42fr', borderTop: `1px solid ${CH.negro}` }}>
      {DIAS_CORTOS_CRONO.map((d) => (
        <div key={d} style={{ ...LBL, fontSize: 8, letterSpacing: '0.3em', textAlign: 'center', padding: '5px 0', borderBottom: `1px solid ${CH.linea}` }}>{d}</div>
      ))}
      {semanas.map((lunes, wi) => {
        const dias = diasDeSemana(lunes)
        const conHitos = dias.some((d) => hitosDelDia(hitos, d).length > 0)
        return dias.map((iso, di) => {
          const n = diaNum(iso)
          const etapa = etapaDeFecha(etapas, iso)
          const feriado = feriados.get(iso)
          const fuera = rIni != null && rFin != null && (n < rIni || n > rFin)
          const esHoy = hoy === iso
          const { d, m } = partesFecha(iso)
          const del = hitosDelDia(hitos, iso)
          const mesLabel = d === 1 || (wi === 0 && di === 0)
          // El fin de semana hereda el color de la etapa (angosto ya lo distingue); solo el feriado lleva el motivo gris.
          const fondo = feriado ? FERIADO_FONDO : etapa ? ETAPA_FONDO[etapa] : esFinde(iso) ? FINDE_FONDO : CH.blanco
          return (
            <div
              key={iso}
              title={feriado ?? undefined}
              onClick={onClickDia ? (e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.dia) onClickDia(iso, e) } : undefined}
              onDragOver={onMoverHito ? (e) => e.preventDefault() : undefined}
              onDrop={onMoverHito ? (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onMoverHito(id, iso) } : undefined}
              style={{
                minHeight: conHitos ? 64 : 26,
                boxSizing: 'border-box',
                borderTop: `1px solid ${CH.linea}`,
                borderLeft: di === 0 ? 'none' : `1px solid ${CH.linea}`,
                background: fondo,
                boxShadow: esHoy ? `inset 0 0 0 1.5px ${CH.rojo}` : undefined,
                padding: '3px 4px',
                fontSize: 9,
                color: esHoy ? CH.rojo : CH.gris,
                opacity: fuera ? 0.4 : 1,
                cursor: onClickDia ? 'pointer' : undefined,
                overflow: 'hidden',
              }}
            >
              <span data-dia="1" style={{ display: 'block' }}>
                {d}
                {mesLabel && <span data-dia="1" style={{ marginLeft: 3, letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: 7 }}>{MESES_CORTOS_CRONO[m - 1]}</span>}
                {feriado && <span data-dia="1" style={{ display: 'block', fontSize: 7, color: CH.grisClaro, lineHeight: 1.1 }}>{feriado}</span>}
              </span>
              {del.map((h) => {
                const cont = h.fecha !== iso
                const titulo = h.titulo || nombreTipoHito(h.tipo)
                const pie = [h.notas, h.responsable].filter(Boolean).join(' — ')
                return (
                  <span
                    key={h.id}
                    draggable={!!onMoverHito && !cont}
                    onDragStart={onMoverHito ? (e) => { e.dataTransfer.setData('text/plain', h.id); e.dataTransfer.effectAllowed = 'move' } : undefined}
                    onClick={onClickHito ? (e) => { e.stopPropagation(); onClickHito(h.id, e) } : undefined}
                    style={{ ...estiloEtiqueta(h, cont, seleccionado === h.id), cursor: onClickHito ? 'pointer' : undefined }}
                  >
                    {cont ? (
                      <span style={{ fontSize: 8 }}>↳ {titulo} · día {diaNum(iso) - diaNum(h.fecha!) + 1}</span>
                    ) : (
                      <>
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 500 }}>
                          {h.tipo === 'pago' && <span style={{ display: 'inline-block', width: 6, height: 6, background: CH.amarillo, marginRight: 4, verticalAlign: 'middle' }} />}
                          {titulo}
                          {h.tipo === 'pago' && h.monto != null && <span style={{ fontWeight: 400 }}> · {formatCLP(h.monto)}</span>}
                          {h.fecha_fin && fechaValida(h.fecha_fin) && <span style={{ fontWeight: 400, opacity: 0.7 }}> · hasta {formatoCorto(h.fecha_fin)}</span>}
                        </span>
                        {pie && <span style={{ display: 'block', fontSize: 8.5, opacity: 0.8, whiteSpace: 'pre-wrap' }}>{pie}</span>}
                      </>
                    )}
                  </span>
                )
              })}
            </div>
          )
        })
      })}
    </div>
  )
}

export function LeyendaHoja() {
  const box = (bg: string, extra?: React.CSSProperties) => <span style={{ display: 'inline-block', width: 12, height: 8, background: bg, verticalAlign: 'middle', marginRight: 4, ...extra }} />
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, ...LBL, fontSize: 7.5, letterSpacing: '0.15em' }}>
      {ETAPAS_CRONO.map((e) => <span key={e.id}>{box(ETAPA_FONDO[e.id])}{e.nombre}</span>)}
      <span>{box(FERIADO_FONDO, { border: `1px solid ${CH.linea}` })}feriado</span>
      <span>{box(CH.negro)}hito clave</span>
      <span><span style={{ display: 'inline-block', width: 6, height: 6, background: CH.amarillo, verticalAlign: 'middle', marginRight: 4 }} />pago</span>
    </div>
  )
}

// ─── EL PANEL (Hilván) ───────────────────────────────────────────────────────

const lbl = 'font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted'

export function PanelLectura({
  lectura,
  frases,
  proximo,
  avisos,
  onMoverA,
  onAbrirHito,
  onQuitarHito,
}: {
  lectura: LecturaEtapa[]
  frases: { texto: string; valor: string }[]
  proximo: { titulo: string; fecha: string; dias: number } | null
  avisos: AvisoCrono[]
  onMoverA?: (hitoId: string, iso: string) => void
  /** Abre la ventana del hito del aviso (los hitos sin fecha no están en el calendario). */
  onAbrirHito?: (hitoId: string, e: React.MouseEvent<HTMLElement>) => void
  onQuitarHito?: (hitoId: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className={lbl}>Lectura</span>
      <div className="grid gap-x-3 gap-y-1 font-body text-xs text-ch-muted" style={{ gridTemplateColumns: '1fr 40px 60px 44px' }}>
        <span className={`${lbl} tracking-[0.2em]`}>Etapa</span><span className={`${lbl} tracking-[0.2em] text-right`}>Días</span><span className={`${lbl} tracking-[0.2em] text-right`}>Hábiles</span><span className={`${lbl} tracking-[0.2em] text-right`}>Peso</span>
        {lectura.map((l) => (
          <div key={l.id} className="contents">
            <span className="text-ch-cream">{l.nombre}</span>
            <span className="text-right">{l.corridos || '—'}</span>
            <span className="text-right">{l.corridos ? l.habiles : '—'}</span>
            <span className="text-right text-ch-subtle">{l.corridos ? `${Math.round(l.peso * 100)}%` : '—'}</span>
          </div>
        ))}
      </div>
      {(frases.length > 0 || proximo) && (
        <div className="border-t border-ch-border pt-2 flex flex-col gap-1 font-body text-xs text-ch-cream">
          {frases.map((f, i) => (
            <span key={i}>{f.texto} <b className="font-display italic text-lg font-normal" style={{ color: CH.lila }}>{f.valor}</b></span>
          ))}
          {proximo && (
            <span>Próximo hito clave: <b className="font-medium">{proximo.titulo} · {formatoDia(proximo.fecha)}{proximo.dias === 0 ? ' · hoy' : proximo.dias > 0 ? ` · en ${proximo.dias} día${proximo.dias === 1 ? '' : 's'}` : ` · hace ${-proximo.dias} día${proximo.dias === -1 ? '' : 's'}`}</b></span>
          )}
        </div>
      )}
      {avisos.map((a, i) => (
        <div key={i} className="border px-2.5 py-2 font-body text-[11px] text-ch-cream leading-snug flex flex-wrap items-center gap-2" style={{ borderColor: CH.amarillo }}>
          <span><b className="font-medium" style={{ color: CH.amarillo }}>Ojo:</b> {a.texto}</span>
          {a.sugerido && a.hito_id && onMoverA && (
            <button type="button" onClick={() => onMoverA(a.hito_id!, a.sugerido!)} className="font-body text-[9px] tracking-[0.15em] uppercase border border-ch-border px-2 py-0.5 text-ch-muted hover:text-ch-cream transition-colors">
              Mover al {formatoCorto(a.sugerido)}
            </button>
          )}
          {a.tipo === 'sin_fecha' && a.hito_id && onAbrirHito && (
            <button type="button" onClick={(e) => onAbrirHito(a.hito_id!, e)} className="font-body text-[9px] tracking-[0.15em] uppercase border border-ch-border px-2 py-0.5 text-ch-muted hover:text-ch-cream transition-colors">
              Ponerle fecha
            </button>
          )}
          {a.tipo === 'sin_fecha' && a.hito_id && onQuitarHito && (
            <button type="button" onClick={() => onQuitarHito(a.hito_id!)} className="font-body text-[9px] tracking-[0.15em] uppercase border border-ch-border px-2 py-0.5 text-ch-muted hover:text-red-400 transition-colors">
              Quitar
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function PanelCompuertas({
  grupos,
  hitos,
  onToggle,
  onEditar,
  onAgregar,
  onQuitar,
  onMover,
}: {
  grupos: GrupoCompuertas[]
  hitos: HitoVista[]
  onToggle?: (id: string, hecho: boolean) => void
  onEditar?: (id: string, campos: { texto?: string; responsable?: string | null; hito_id?: string | null }) => void
  onAgregar?: (destino: GrupoCompuertas['destino']) => void
  onQuitar?: (id: string) => void
  /** Arrastrar un check y soltarlo sobre otro (antes de él) o sobre un grupo (al final). */
  onMover?: (id: string, destino: GrupoCompuertas['destino'], antesDe: string | null) => void
}) {
  const editable = !!onEditar
  const dnd = (id: string) => (onMover ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('text/crono-check', id); e.dataTransfer.effectAllowed = 'move' },
  } : {})
  const soltar = (destino: GrupoCompuertas['destino'], antesDe: string | null) => (onMover ? {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('text/crono-check')) e.preventDefault() },
    onDrop: (e: React.DragEvent) => { const id = e.dataTransfer.getData('text/crono-check'); if (id) { e.preventDefault(); e.stopPropagation(); onMover(id, destino, antesDe) } },
  } : {})
  return (
    <div className="flex flex-col gap-2">
      <span className={lbl}>Compuertas · qué falta para avanzar</span>
      {grupos.map((g) => (
        <details key={g.destino} open={g.checks.some((c) => !c.ok)} className="border border-ch-border group" {...soltar(g.destino, null)}>
          <summary className="flex items-center justify-between px-3 py-2 cursor-pointer list-none select-none">
            <span className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-cream">→ {g.nombre}</span>
            <span className="font-body text-[9px] tracking-[0.15em] uppercase" style={{ color: g.lista ? CH.verde : g.faltan > 0 ? CH.amarillo : undefined }}>
              {g.checks.length === 0 ? 'sin checks' : g.lista ? 'lista' : `falta${g.faltan === 1 ? '' : 'n'} ${g.faltan}`}
            </span>
          </summary>
          <div className="px-3 pb-3 flex flex-col gap-1.5">
            {g.checks.map((c) => (
              <div key={c.id} className={`flex items-start gap-2 font-body text-xs ${onMover ? 'cursor-grab active:cursor-grabbing' : ''}`} {...dnd(c.id)} {...soltar(g.destino, c.id)} title={onMover ? 'Arrastra para reordenar o mover a otra compuerta' : undefined}>
                <input
                  type="checkbox"
                  checked={c.ok}
                  disabled={c.automatica || !onToggle}
                  onChange={(e) => onToggle?.(c.id, e.target.checked)}
                  className="mt-0.5 accent-[#e6e2ed] disabled:opacity-60"
                  title={c.automatica ? 'Automático: se marca solo cuando el hito está hecho' : 'Marcar a mano'}
                />
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  {editable ? (
                    <input value={c.texto} onChange={(e) => onEditar!(c.id, { texto: e.target.value })} className={`bg-transparent border-b border-transparent hover:border-ch-border focus:border-ch-cream/40 focus:outline-none ${c.ok ? 'text-ch-subtle line-through' : 'text-ch-cream'}`} />
                  ) : (
                    <span className={c.ok ? 'text-ch-subtle line-through' : 'text-ch-cream'}>{c.texto}</span>
                  )}
                  <span className="text-[10px] text-ch-subtle flex flex-wrap items-center gap-x-2">
                    {c.automatica ? (
                      <span>automático{c.fecha_hito ? ` · ${formatoCorto(c.fecha_hito)}` : ''}</span>
                    ) : editable ? (
                      <input value={c.responsable ?? ''} onChange={(e) => onEditar!(c.id, { responsable: e.target.value || null })} placeholder="responsable" className="bg-transparent border-b border-transparent hover:border-ch-border focus:border-ch-cream/40 focus:outline-none w-28 placeholder:text-ch-subtle/60" />
                    ) : c.responsable ? (
                      <span>{c.responsable}</span>
                    ) : null}
                    {editable && (
                      <select value={c.hito_id ?? ''} onChange={(e) => onEditar!(c.id, { hito_id: e.target.value || null })} className="bg-transparent text-ch-subtle text-[10px] focus:outline-none max-w-[150px]" title="Enganchar a un hito: el check se marca solo cuando el hito esté hecho">
                        <option value="">a mano</option>
                        {hitos.map((h) => <option key={h.id} value={h.id}>{(h.titulo || nombreTipoHito(h.tipo)).slice(0, 28)}{fechaValida(h.fecha) ? ` · ${formatoCorto(h.fecha)}` : ''}</option>)}
                      </select>
                    )}
                    {onQuitar && <button type="button" onClick={() => onQuitar(c.id)} className="text-ch-subtle hover:text-ch-cream" title="Quitar check">✕</button>}
                  </span>
                </div>
              </div>
            ))}
            {onAgregar && (
              <button type="button" onClick={() => onAgregar(g.destino)} className="self-start font-body text-[10px] text-ch-subtle hover:text-ch-cream transition-colors">+ check</button>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}

export function PanelSemana({ hitos, titulo }: { hitos: HitoVista[]; titulo: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={lbl}>{titulo}</span>
      {hitos.length === 0 ? (
        <span className="font-body text-xs text-ch-subtle">Nada calendarizado.</span>
      ) : (
        <div className="flex flex-col gap-1 font-body text-xs">
          {hitos.map((h) => (
            <div key={h.id} className={`flex justify-between gap-3 ${h.hecho ? 'text-ch-subtle line-through' : 'text-ch-cream'}`}>
              <span className="min-w-0 truncate">{formatoDia(h.fecha)} · {h.titulo || nombreTipoHito(h.tipo)}</span>
              <span className="text-ch-muted shrink-0">{h.responsable ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function PanelPagos({ total, cobrado, pendiente }: { total: number; cobrado: number; pendiente: number }) {
  if (total === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <span className={lbl}>Pagos</span>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-body text-xs text-ch-cream">
        <span>Total <b className="font-mono font-normal">{formatCLP(total)}</b></span>
        <span>Cobrado <b className="font-mono font-normal" style={{ color: CH.verde }}>{formatCLP(cobrado)}</b></span>
        <span>Pendiente <b className="font-mono font-normal" style={{ color: CH.amarillo }}>{formatCLP(pendiente)}</b></span>
      </div>
    </div>
  )
}

/** Barra mini de etapas para la lista de cronos (paleta de la hoja). */
export function BarraEtapasMini({ etapas }: { etapas: Record<EtapaCrono, RangoEtapa> }) {
  const rango = rangoCrono(etapas, [])
  if (!rango) return <div className="h-1.5 w-full border border-dashed border-ch-border" />
  const d0 = diaNum(rango.desde)
  const total = Math.max(1, diaNum(rango.hasta) - d0 + 1)
  return (
    <div className="h-1.5 w-full relative bg-ch-black/40">
      {ETAPAS_CRONO.map((e) => {
        const et = etapas[e.id]
        const fin = finEfectivoEtapa(etapas, e.id, diaNum(rango.hasta))
        if (!et.desde || !fechaValida(et.desde) || fin == null) return null
        const a = diaNum(et.desde) - d0
        const w = fin - diaNum(et.desde) + 1
        return <span key={e.id} className="absolute top-0 h-full" style={{ left: `${(a / total) * 100}%`, width: `${(w / total) * 100}%`, background: e.id === 'produccion' ? CH.lilaFuerte : CH.lila, opacity: e.id === 'produccion' ? 1 : 0.35 + 0.2 * ETAPAS_CRONO.findIndex((x) => x.id === e.id) }} title={`${e.nombre}: ${formatoRango(et.desde, et.hasta ?? isoDeDia(fin))}`} />
      })}
    </div>
  )
}

export { diaSemana }
