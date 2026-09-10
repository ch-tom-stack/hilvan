import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, Svg, Line, Rect } from '@react-pdf/renderer'
import {
  DIAS_CORTOS_CRONO,
  MESES_CORTOS_CRONO,
  diaNum,
  diaSemana,
  diasDeSemana,
  esDestacado,
  esFinde,
  esHitoClave,
  etapaDeFecha,
  fechaValida,
  finEfectivoEtapa,
  formatoCorto,
  formatoLargo,
  formatoRango,
  hitosDelDia,
  isoDeDia,
  lecturaEtapas,
  mapaFeriados,
  nombreTipoHito,
  partesFecha,
  rangoCrono,
  rangosEtapas,
  semanasDelCrono,
  type RangoEtapa,
} from '@/lib/crono'
import { ETAPAS_CRONO, formatCLP, type Crono, type CronoHito, type EtapaCrono, type Feriado } from '@/types'

// CH-11 CRONOS — LA HOJA en PDF (una A4 horizontal, siempre una página).
// Misma geometría y paleta que CronoVistas.tsx (blanco, negro, tintes lila con
// motivo de líneas diagonales; fin de semana angosto; feriado con motivo gris;
// etiquetas: destacado = blanco con doble borde y letra grande, clave = negro,
// resto = lila). react-pdf no tiene patrones CSS, así que el motivo se dibuja
// línea a línea en un Svg detrás de cada celda. Helvetica, como el resto de los
// PDFs de la casa. Si el crono es largo, las filas y las letras se achican para
// seguir cabiendo en la hoja (regla de una página).

const CH = { negro: '#0a0a0a', blanco: '#ffffff', lila: '#e6e2ed', lilaFuerte: '#cfc6dd', gris: '#353135', grisClaro: '#8a8590', linea: '#d8d5de', rojo: '#c11700', amarillo: '#e8c547' }

const PAGE_W = 841.89
const PAGE_H = 595.28
const M = 26
const W = PAGE_W - M * 2

const styles = StyleSheet.create({
  page: { backgroundColor: CH.blanco, padding: M, fontFamily: 'Helvetica', fontSize: 8, color: CH.negro },
  lbl: { fontSize: 6, letterSpacing: 1.6, textTransform: 'uppercase', color: CH.gris },
})

// ─── motivo de líneas diagonales ─────────────────────────────────────────────
// dir 'up' = "/" (desarrollo, pre); 'down' = "\" (post). `paso` separa líneas; `grosor` es el ancho.
function Hatch({ w, h, color, paso, grosor, dir }: { w: number; h: number; color: string; paso: number; grosor: number; dir: 'up' | 'down' }) {
  const lines: React.ReactElement[] = []
  for (let x = -h; x < w + h; x += paso) {
    lines.push(dir === 'up'
      ? <Line key={x} x1={x} y1={h} x2={x + h} y2={0} stroke={color} strokeWidth={grosor} />
      : <Line key={x} x1={x} y1={0} x2={x + h} y2={h} stroke={color} strokeWidth={grosor} />)
  }
  return <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', top: 0, left: 0 }}>{lines}</Svg>
}

function FondoEtapa({ etapa, w, h }: { etapa: EtapaCrono | null; w: number; h: number }) {
  if (!etapa) return null
  if (etapa === 'produccion') return <Svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }}><Rect x={0} y={0} width={w} height={h} fill={CH.lilaFuerte} /></Svg>
  if (etapa === 'desarrollo') return <Hatch w={w} h={h} color={CH.lila} paso={9} grosor={2.2} dir="up" />
  if (etapa === 'pre') return <Hatch w={w} h={h} color={CH.lila} paso={9} grosor={5.2} dir="up" />
  return <Hatch w={w} h={h} color={CH.lila} paso={9} grosor={3.7} dir="down" />
}
const FondoFeriado = ({ w, h }: { w: number; h: number }) => <Hatch w={w} h={h} color={CH.linea} paso={4.5} grosor={1.1} dir="up" />

// ─── etiqueta de hito ─────────────────────────────────────────────────────────
function Etiqueta({ h, iso, k }: { h: CronoHito; iso: string; k: number }) {
  const dest = esDestacado(h)
  const clave = esHitoClave(h.tipo)
  const cont = h.fecha !== iso
  const titulo = h.titulo || nombreTipoHito(h.tipo)
  const pie = [h.notas, h.responsable].filter(Boolean).join(' — ')
  const bg = dest ? CH.blanco : clave ? CH.negro : CH.lila
  const fg = dest || !clave ? CH.negro : CH.blanco
  const op = h.hecho ? 0.45 : cont ? 0.6 : 1
  const cuerpo = cont ? (
    <Text style={{ fontSize: 6.5 * k, color: fg }}>{titulo} · día {diaNum(iso) - diaNum(h.fecha!) + 1}</Text>
  ) : (
    <View>
      <Text style={{ fontSize: (dest ? 10 : 7.5) * k, fontFamily: 'Helvetica-Bold', color: fg, lineHeight: 1.2 }}>
        {h.tipo === 'pago' ? '■ ' : ''}{titulo}
        {h.tipo === 'pago' && h.monto != null ? ` · ${formatCLP(h.monto)}` : ''}
        {h.fecha_fin && fechaValida(h.fecha_fin) ? ` · hasta ${formatoCorto(h.fecha_fin)}` : ''}
      </Text>
      {pie ? <Text style={{ fontSize: (dest ? 7 : 6.2) * k, color: fg, opacity: 0.85, lineHeight: 1.2, marginTop: 1 }}>{pie}</Text> : null}
    </View>
  )
  if (dest && !cont) {
    // doble borde: dos vistas anidadas con línea fina
    return (
      <View style={{ marginTop: 2, borderWidth: 0.7, borderColor: CH.negro, padding: 1.2, opacity: op, textDecoration: h.hecho ? 'line-through' : 'none' }}>
        <View style={{ borderWidth: 0.7, borderColor: CH.negro, backgroundColor: bg, paddingVertical: 2.5 * k, paddingHorizontal: 4 }}>{cuerpo}</View>
      </View>
    )
  }
  return (
    <View style={{ marginTop: 2, backgroundColor: cont && dest ? CH.blanco : bg, borderWidth: cont && dest ? 0.6 : 0, borderColor: CH.negro, paddingVertical: 2 * k, paddingHorizontal: 3.5, opacity: op, textDecoration: h.hecho ? 'line-through' : 'none' }}>{cuerpo}</View>
  )
}

// ─── documento ────────────────────────────────────────────────────────────────
export interface HojaCronoPDFProps {
  crono: Crono
  feriados: Feriado[]
  hoy: string
  logoBase64?: string
}

export function HojaCronoPDF({ crono, feriados, hoy, logoBase64 }: HojaCronoPDFProps) {
  const etapas = rangosEtapas(crono)
  const hitos = (crono.hitos ?? []) as CronoHito[]
  const fer = mapaFeriados(feriados)
  const rango = rangoCrono(etapas, hitos)
  const lectura = lecturaEtapas(etapas, fer, rango?.hasta)
  const semanas = semanasDelCrono(rango, hoy)
  const cliente = crono.cliente || crono.proyecto?.cliente?.nombre || null

  // ── geometría del calendario ──
  const colAncha = W / (5 + 0.42 * 2)
  const colFinde = colAncha * 0.42
  const colW = [colAncha, colAncha, colAncha, colAncha, colAncha, colFinde, colFinde]
  const colX = colW.reduce<number[]>((acc, w, i) => [...acc, (acc[i - 1] ?? 0) + (i ? colW[i - 1] : 0)], [])

  // Alto natural por semana: el día con más contenido manda. Después se escala
  // para que TODO quepa en la hoja (regla de una página).
  const altoEtiqueta = (h: CronoHito, iso: string) => {
    if (h.fecha !== iso) return 10
    const dest = esDestacado(h)
    const pie = [h.notas, h.responsable].filter(Boolean).join(' — ')
    const anchoTexto = (esFinde(iso) ? colFinde : colAncha) - 12
    const carT = Math.max(12, anchoTexto / ((dest ? 10 : 7.5) * 0.52))
    const carP = Math.max(14, anchoTexto / (6.2 * 0.5))
    const lineasT = Math.ceil((h.titulo || nombreTipoHito(h.tipo)).length / carT)
    const lineasP = pie ? Math.ceil(pie.length / carP) : 0
    return (dest ? 10 : 7.5) * 1.25 * lineasT + (pie ? 6.4 * 1.25 * lineasP + 1 : 0) + (dest ? 12 : 7)
  }
  const altos = semanas.map((lunes) => {
    const dias = diasDeSemana(lunes)
    const maxDia = Math.max(0, ...dias.map((iso) => hitosDelDia(hitos, iso).reduce((s, h) => s + altoEtiqueta(h, iso), 0)))
    return maxDia > 0 ? 12 + maxDia : 16
  })
  // Alto que de verdad queda para las semanas: la hoja menos todo lo demás, medido
  // con los altos FIJOS de cada bloque (encabezado 36, etapas 40, tira 42, fila de
  // días 13, leyenda 17, pie 22) más los bordes de las filas y un colchón. Antes
  // este cálculo era optimista y el estirado de filas empujaba una segunda hoja
  // vacía; `wrap={false}` en la Page es la segunda cerradura.
  const FIJO = 36 + 40 + 42 + 13 + 17 + 22
  const altoDisponible = PAGE_H - M * 2 - FIJO - semanas.length * 0.5 - 10
  const natural = altos.reduce((s, a) => s + a, 0)
  const k = natural > altoDisponible ? Math.max(0.55, altoDisponible / natural) : 1
  // Si sobra hoja, las filas crecen (solo el alto, no la letra) hasta llenarla — tope 2x.
  const estirar = natural < altoDisponible ? Math.min(2, altoDisponible / natural) : 1
  const altosK = altos.map((a) => a * k * estirar)

  const fechaEmision = formatoLargo(hoy)

  return (
    <Document title={`Crono · ${crono.nombre}`} author="Casa Hiedra">
      <Page size="A4" orientation="landscape" style={styles.page} wrap={false}>
        {/* Encabezado: una línea */}
        <View style={{ height: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1.2, borderBottomColor: CH.negro, paddingBottom: 5, marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            {logoBase64 ? <Image src={logoBase64} style={{ width: 54, height: 15, objectFit: 'contain', marginRight: 10, marginBottom: 1 }} /> : null}
            <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold' }}>{crono.nombre}</Text>
            <Text style={{ fontSize: 8, color: CH.gris, marginLeft: 8, marginBottom: 1 }}>Cronograma{cliente ? ` · ${cliente}` : ''}</Text>
          </View>
          <Text style={styles.lbl}>{[cliente, 'Casa Hiedra', `emitido ${fechaEmision}`].filter(Boolean).join(' · ')}</Text>
        </View>

        {/* Etapas */}
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          {lectura.map((l, i) => {
            const bw = (W - 3 * 3) / 4
            return (
              <View key={l.id} style={{ width: bw, height: 34, marginLeft: i ? 3 : 0, position: 'relative' }}>
                <FondoEtapa etapa={l.id} w={bw} h={34} />
                <View style={{ padding: '5 7' }}>
                  <Text style={styles.lbl}>{l.nombre}</Text>
                  <Text style={{ fontSize: 9.5, marginTop: 1 }}>{l.desde ? formatoRango(l.desde, l.hasta) + (etapas[l.id].hasta ? '' : ' →') : '—'}</Text>
                  <Text style={{ fontSize: 6.5, color: CH.gris }}>{l.corridos > 0 ? `${l.corridos} días · ${l.habiles} hábiles` : 'sin fechas'}</Text>
                </View>
              </View>
            )
          })}
        </View>

        {/* Tira general */}
        {rango ? <TiraGeneralPDF etapas={etapas} hitos={hitos} hoy={hoy} rango={rango} /> : null}

        {/* Calendario */}
        <View style={{ borderTopWidth: 0.9, borderTopColor: CH.negro, marginTop: 6 }}>
          <View style={{ height: 13, flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: CH.linea }}>
            {DIAS_CORTOS_CRONO.map((d, i) => (
              <Text key={d} style={{ ...styles.lbl, width: colW[i], textAlign: 'center', paddingVertical: 2.5, letterSpacing: 1.2 }}>{d}</Text>
            ))}
          </View>
          {semanas.map((lunes, wi) => {
            const dias = diasDeSemana(lunes)
            const alto = altosK[wi]
            return (
              <View key={lunes} style={{ flexDirection: 'row', height: alto, borderTopWidth: wi ? 0.5 : 0, borderTopColor: CH.linea }}>
                {dias.map((iso, di) => {
                  const etapa = etapaDeFecha(etapas, iso)
                  const feriado = fer.get(iso)
                  const fuera = rango ? diaNum(iso) < diaNum(rango.desde) || diaNum(iso) > diaNum(rango.hasta) : false
                  const esHoy = false // hoy no se exporta: es una marca de trabajo, no del documento
                  const { d, m } = partesFecha(iso)
                  const mesLabel = d === 1 || (wi === 0 && di === 0)
                  const del = hitosDelDia(hitos, iso)
                  const w = colW[di]
                  return (
                    <View key={iso} style={{ width: w, height: alto, borderLeftWidth: di ? 0.5 : 0, borderLeftColor: CH.linea, position: 'relative', opacity: fuera ? 0.4 : 1, overflow: 'hidden' }}>
                      {feriado ? <FondoFeriado w={w} h={alto} /> : <FondoEtapa etapa={etapa} w={w} h={alto} />}
                      {esHoy ? <Svg width={w} height={alto} style={{ position: 'absolute', top: 0, left: 0 }}><Rect x={0.75} y={0.75} width={w - 1.5} height={alto - 1.5} stroke={CH.rojo} strokeWidth={1.2} fill="none" /></Svg> : null}
                      <View style={{ padding: '2 3' }}>
                        <Text style={{ fontSize: 6.5 * Math.max(k, 0.8), color: esHoy ? CH.rojo : CH.gris }}>
                          {d}{mesLabel ? ` ${MESES_CORTOS_CRONO[m - 1].toUpperCase()}` : ''}
                          {feriado ? `  ${feriado}` : ''}
                        </Text>
                        {del.map((h) => <Etiqueta key={h.id} h={h} iso={iso} k={k} />)}
                      </View>
                    </View>
                  )
                })}
              </View>
            )
          })}
        </View>

        {/* Leyenda + pie */}
        <View style={{ height: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 11, height: 7, borderWidth: 0.6, borderColor: CH.negro, padding: 0.8, marginRight: 3 }}><View style={{ flex: 1, borderWidth: 0.6, borderColor: CH.negro }} /></View>
            <Text style={styles.lbl}>rodaje · emisión · entrega final   </Text>
            <View style={{ width: 11, height: 7, backgroundColor: CH.negro, marginRight: 3 }} /><Text style={styles.lbl}>hito clave   </Text>
            <View style={{ width: 11, height: 7, backgroundColor: CH.lila, marginRight: 3 }} /><Text style={styles.lbl}>otro · reunión · pago   </Text>
            <View style={{ width: 11, height: 7, borderWidth: 0.5, borderColor: CH.linea, marginRight: 3, position: 'relative', overflow: 'hidden' }}><FondoFeriado w={11} h={7} /></View><Text style={styles.lbl}>feriado</Text>
          </View>
          <Text style={{ fontSize: 6.5, color: CH.gris }}>{crono.notas ?? ''}</Text>
        </View>
        <View style={{ position: 'absolute', bottom: 14, left: M, right: M, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.lbl}>Casa Hiedra · casahiedra.com</Text>
          <Text style={styles.lbl}>{crono.responsable ? `responsable ${crono.responsable}` : ''}</Text>
        </View>
      </Page>
    </Document>
  )
}

function TiraGeneralPDF({ etapas, hitos, hoy, rango }: { etapas: Record<EtapaCrono, RangoEtapa>; hitos: CronoHito[]; hoy: string; rango: { desde: string; hasta: string } }) {
  const H = 30
  let d0 = diaNum(rango.desde) - 3
  let d1 = diaNum(rango.hasta) + 3
  if (d1 - d0 < 21) { const c = Math.round((d0 + d1) / 2); d0 = c - 10; d1 = c + 10 }
  const span = d1 - d0 + 1
  const dayW = W / span
  const x = (n: number) => (n - d0) * dayW
  const meses: { n: number; label: string }[] = []
  {
    let { y, m } = partesFecha(isoDeDia(d0))
    for (let i = 0; i < 40; i++) {
      const n = diaNum(`${y}-${String(m).padStart(2, '0')}-01`)
      if (n > d1) break
      if (n >= d0) meses.push({ n, label: MESES_CORTOS_CRONO[m - 1].toUpperCase() })
      if (++m > 12) { m = 1; y++ }
    }
  }
  const hoyN: number | null = null // hoy no se exporta (ver calendario)
  void hoy
  return (
    <View style={{ height: H + 6, position: 'relative' }}>
      {ETAPAS_CRONO.map((e) => {
        const et = etapas[e.id]
        const fin = finEfectivoEtapa(etapas, e.id, diaNum(rango.hasta))
        if (!et.desde || !fechaValida(et.desde) || fin == null) return null
        const x1 = x(diaNum(et.desde)), x2 = x(fin) + dayW
        const bw = Math.max(2, x2 - x1)
        return (
          <View key={e.id} style={{ position: 'absolute', left: x1, top: 4, width: bw, height: 16, overflow: 'hidden' }}>
            <FondoEtapa etapa={e.id} w={bw} h={16} />
            {bw > 60 ? <Text style={{ ...styles.lbl, color: CH.negro, paddingLeft: 4, paddingTop: 4.5 }}>{e.nombre}</Text> : null}
          </View>
        )
      })}
      <Svg width={W} height={H + 6} viewBox={`0 0 ${W} ${H + 6}`} style={{ position: 'absolute', top: 0, left: 0 }}>
        {meses.map((mm) => <Line key={mm.n} x1={x(mm.n)} y1={2} x2={x(mm.n)} y2={24} stroke={CH.linea} strokeWidth={0.6} />)}
        {hitos.filter((h) => esHitoClave(h.tipo) && fechaValida(h.fecha)).map((h) => {
          const cx = x(diaNum(h.fecha!)) + dayW / 2
          const dest = esDestacado(h)
          return <Line key={h.id} x1={cx} y1={dest ? 1 : 4} x2={cx} y2={dest ? 25 : 22} stroke={CH.negro} strokeWidth={dest ? 2.2 : 0.9} opacity={h.hecho ? 0.35 : 1} />
        })}
        {hoyN != null && hoyN >= d0 && hoyN <= d1 ? <Line x1={x(hoyN) + dayW / 2} y1={0} x2={x(hoyN) + dayW / 2} y2={25} stroke={CH.rojo} strokeWidth={0.8} strokeDasharray="2 1.5" /> : null}
      </Svg>
      {meses.map((mm) => <Text key={mm.n} style={{ ...styles.lbl, position: 'absolute', left: x(mm.n) + 2, top: 26, fontSize: 5.5 }}>{mm.label}</Text>)}
    </View>
  )
}

export { diaSemana }
