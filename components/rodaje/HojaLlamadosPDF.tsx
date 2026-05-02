import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Image, Svg, Circle, Path, Rect,
} from '@react-pdf/renderer'
import { formatHora, resolverHoraLlamado, minutosAHora, calcularCascada } from '@/types'

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111111',
  },

  // ── Header ──
  // Fila 1: logos y título
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: { width: 80, height: 22, objectFit: 'contain' },
  clienteLogo: { width: 70, height: 20, objectFit: 'contain' },
  produccion: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#111', textAlign: 'center' },
  subProduccion: { fontSize: 8, color: '#777', textAlign: 'center' },
  fechaText: { fontSize: 8, color: '#555', textAlign: 'center' },

  // Fila 2: locación + call + sol + clima (tira horizontal)
  headerMid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#ddd',
    marginBottom: 0,
  },
  headerMidCell: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  headerMidDivider: {
    width: 0.5,
    backgroundColor: '#ddd',
  },
  locacionLabel: { fontSize: 6, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  locacionValue: { fontSize: 9, color: '#333' },
  callLabel: { fontSize: 6, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 1 },
  callHora: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#111' },
  solRow: { flexDirection: 'row', gap: 8 },
  solItem: { },
  solLabel: { fontSize: 6, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 1 },
  solValue: { fontSize: 8, color: '#333' },
  solValueOro: { fontSize: 8, color: '#92400e' },
  climaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  climaText: { fontSize: 8, color: '#555' },
  climaCondicion: { fontSize: 7, color: '#888' },

  // Fila 3: chiste (franja)
  headerBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: '#111',
    marginBottom: 12,
    minHeight: 0,
  },
  chisteTexto: { fontSize: 7.5, color: '#777', fontStyle: 'italic', lineHeight: 1.4, flex: 1 },

  // ── Sección ──
  seccion: { marginBottom: 14 },
  secTitulo: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 5,
  },

  // ── Tabla plan ──
  tablaHeader: {
    flexDirection: 'row',
    backgroundColor: '#111',
    paddingVertical: 4,
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  th: {
    fontSize: 6.5,
    color: '#fff',
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingTop: 1,
  },
  fila: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    minHeight: 16,
    alignItems: 'center',
  },
  filaRodaje: { backgroundColor: '#fff8f8' },

  // Columnas plan — padding en cada celda para alinear con header
  cScenes: { width: 64, paddingLeft: 5, paddingRight: 4 },
  cDesc: { flex: 1, paddingRight: 6 },
  cChar: { width: 72, paddingRight: 4 },
  cDN: { width: 18, alignItems: 'center', textAlign: 'center' },
  cIE: { width: 18, alignItems: 'center', textAlign: 'center' },
  cHora: { width: 38, alignItems: 'center', textAlign: 'center' },
  cNotas: { width: 76, paddingLeft: 6, paddingRight: 5 },

  scenesLabel: {
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderRadius: 1,
    textTransform: 'uppercase',
  },
  tdMain: { fontSize: 8.5, color: '#111', lineHeight: 1.3 },
  tdSub: { fontSize: 7, color: '#888', marginTop: 1, lineHeight: 1.3 },
  tdMeta: { fontSize: 8, color: '#555', textAlign: 'center' },
  tdHora: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#111', textAlign: 'center' },
  tdNotas: { fontSize: 7, color: '#888', fontStyle: 'italic', lineHeight: 1.3 },

  totalText: {
    fontSize: 7.5,
    color: '#555',
    textAlign: 'right',
    paddingTop: 4,
    paddingRight: 5,
    fontFamily: 'Helvetica-Bold',
  },

  // ── Tabla equipo ──
  equipoFila: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  ePos: { width: 100, paddingLeft: 5 },
  eName: { flex: 1, paddingRight: 4 },
  ePhone: { width: 90 },
  eHora: { width: 40, alignItems: 'flex-end', paddingRight: 5 },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    paddingTop: 5,
  },
  footerText: { fontSize: 6.5, color: '#bbb' },
})

interface Props {
  rodaje: any
  bloques: any[]
  sol: { amanecer: string; atardecer: string; dorada_am: string; dorada_pm: string } | null
  clima: { temp_min: number; temp_max: number; condicion?: string; condicion_codigo?: number } | null
  logoBase64?: string
}


// ── Ícono de clima SVG ────────────────────────────────────────────────────────
function ClimaIcono({ codigo }: { codigo: number }) {
  const size = 14
  // Sol
  if (codigo === 0) return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="4" fill="#f59e0b" />
      <Path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M17.66 6.34l-1.41 1.41M6.34 17.66l-1.41 1.41" stroke="#f59e0b" strokeWidth="2" />
    </Svg>
  )
  // Parcialmente nublado
  if (codigo <= 2) return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="10" cy="11" r="3" fill="#f59e0b" />
      <Path d="M18 17H7a4 4 0 010-8 4 4 0 017.9-1A3.5 3.5 0 0118 17z" fill="#94a3b8" />
    </Svg>
  )
  // Nublado / niebla
  if (codigo <= 49) return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 17H7a4 4 0 010-8 4 4 0 017.9-1A3.5 3.5 0 0118 17z" fill="#94a3b8" />
      <Path d="M5 20h14M7 22h10" stroke="#94a3b8" strokeWidth="1.5" />
    </Svg>
  )
  // Lluvia / llovizna
  if (codigo <= 69) return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 14H7a4 4 0 010-8 4 4 0 017.9-1A3.5 3.5 0 0118 14z" fill="#94a3b8" />
      <Path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="#60a5fa" strokeWidth="1.5" />
    </Svg>
  )
  // Nieve
  if (codigo <= 79) return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 14H7a4 4 0 010-8 4 4 0 017.9-1A3.5 3.5 0 0118 14z" fill="#94a3b8" />
      <Path d="M8 19l1-2 1 2M12 19l1-2 1 2M16 19l1-2 1 2" stroke="#bfdbfe" strokeWidth="1.5" />
    </Svg>
  )
  // Tormenta
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 14H7a4 4 0 010-8 4 4 0 017.9-1A3.5 3.5 0 0118 14z" fill="#475569" />
      <Path d="M13 16l-3 5h4l-3 5" stroke="#fbbf24" strokeWidth="1.5" fill="none" />
    </Svg>
  )
}

export function HojaLlamadosPDF({ rodaje, bloques, sol, clima, logoBase64 }: Props): React.ReactElement {
  const fecha = rodaje.fecha
    ? new Date(rodaje.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : 'Fecha por definir'

  const cascada = calcularCascada(bloques)
  const callMin = cascada[0]?.inicio_min
  const callHora = callMin !== undefined
    ? minutosAHora(callMin)
    : rodaje.hora_llamado_general?.slice(0, 5) || '—'

  const equipo = (rodaje.equipo_tecnico || []).slice().sort((a: any, b: any) => {
    const ha = resolverHoraLlamado(a, rodaje) || '99:99'
    const hb = resolverHoraLlamado(b, rodaje) || '99:99'
    return ha.localeCompare(hb)
  })

  const durTotal = bloques
    .filter((b: any) => !b.es_paralelo)
    .reduce((acc: number, b: any) => acc + (b.duracion_min || 0), 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── HEADER FILA 1: logos + título ── */}
        <View style={styles.headerTop}>
          {logoBase64 ? (
            <Image src={logoBase64} style={styles.logo} />
          ) : (
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111' }}>CASA HIEDRA</Text>
          )}
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 12 }}>
            {rodaje.proyecto?.nombre && <Text style={styles.subProduccion}>{rodaje.proyecto.nombre}</Text>}
            <Text style={styles.produccion}>{rodaje.nombre}</Text>
            <Text style={styles.fechaText}>{fecha}</Text>
          </View>
          {rodaje.cliente_logo_url ? (
            <Image src={rodaje.cliente_logo_url} style={styles.clienteLogo} />
          ) : (
            <View style={{ width: 70 }} />
          )}
        </View>

        {/* ── HEADER FILA 2: locación · call · sol · clima ── */}
        <View style={styles.headerMid}>
          {/* Locación */}
          <View style={[styles.headerMidCell, { flex: 1.2 }]}>
            <Text style={styles.locacionLabel}>Locación</Text>
            <Text style={styles.locacionValue}>{rodaje.locacion_nombre || '—'}</Text>
          </View>
          <View style={styles.headerMidDivider} />

          {/* CALL */}
          <View style={[styles.headerMidCell, { alignItems: 'center', paddingHorizontal: 16 }]}>
            <Text style={styles.callLabel}>Call</Text>
            <Text style={styles.callHora}>{callHora}</Text>
          </View>
          <View style={styles.headerMidDivider} />

          {/* Sol */}
          {sol && (
            <>
              <View style={[styles.headerMidCell, { flex: 1.2 }]}>
                <View style={[styles.solRow, { marginBottom: 3 }]}>
                  <View style={styles.solItem}>
                    <Text style={styles.solLabel}>Sunrise</Text>
                    <Text style={styles.solValue}>{sol.amanecer}</Text>
                  </View>
                  <View style={styles.solItem}>
                    <Text style={styles.solLabel}>Sunset</Text>
                    <Text style={styles.solValue}>{sol.atardecer}</Text>
                  </View>
                </View>
                <View style={styles.solRow}>
                  <View style={styles.solItem}>
                    <Text style={styles.solLabel}>Golden AM</Text>
                    <Text style={styles.solValueOro}>{sol.dorada_am}</Text>
                  </View>
                  <View style={styles.solItem}>
                    <Text style={styles.solLabel}>Golden PM</Text>
                    <Text style={styles.solValueOro}>{sol.dorada_pm}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.headerMidDivider} />
            </>
          )}

          {/* Clima */}
          {clima && (
            <View style={[styles.headerMidCell, { alignItems: 'center' }]}>
              <ClimaIcono codigo={clima.condicion_codigo ?? 0} />
              <Text style={[styles.climaText, { marginTop: 2 }]}>{clima.temp_min}° / {clima.temp_max}°</Text>
              <Text style={styles.climaCondicion}>{clima.condicion || ''}</Text>
            </View>
          )}
        </View>

        {/* ── HEADER FILA 3: chiste (solo si hay contenido) ── */}
        {(rodaje.chiste_imagen_url || rodaje.chiste_texto) && (
          <View style={styles.headerBottom}>
            {rodaje.chiste_imagen_url && (
              <Image
                src={rodaje.chiste_imagen_url}
                style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 2 }}
              />
            )}
            {rodaje.chiste_texto && (
              <Text style={styles.chisteTexto}>{rodaje.chiste_texto}</Text>
            )}
          </View>
        )}
        {/* Si no hay chiste, solo el borde inferior del header */}
        {!rodaje.chiste_imagen_url && !rodaje.chiste_texto && (
          <View style={{ borderBottomWidth: 1.5, borderBottomColor: '#111', marginBottom: 12 }} />
        )}

        {/* ── PLAN DE RODAJE ── */}
        {bloques.length > 0 && (
          <View style={styles.seccion}>
            <Text style={styles.secTitulo}>Plan de rodaje</Text>
            <View style={styles.tablaHeader}>
              <Text style={[styles.th, styles.cScenes]}>Scenes</Text>
              <Text style={[styles.th, styles.cDesc]}>Set and description</Text>
              <Text style={[styles.th, styles.cChar]}>Character #</Text>
              <Text style={[styles.th, styles.cDN, { textAlign: 'center' }]}>D/N</Text>
              <Text style={[styles.th, styles.cIE, { textAlign: 'center' }]}>I/E</Text>
              <Text style={[styles.th, styles.cHora, { textAlign: 'center' }]}>Inicio</Text>
              <Text style={[styles.th, styles.cHora, { textAlign: 'center' }]}>Fin</Text>
              <Text style={[styles.th, styles.cNotas]}>Notas</Text>
            </View>

            {bloques.map((bloque: any, idx: number) => {
              const casc = cascada[idx]
              const esRodaje = bloque.tipo === 'rodaje'
              const labelColor = bloque.scenes_color || '#353135'
              const labelTextColor = '#ffffff'

              return (
                <View key={bloque.id} style={[styles.fila, esRodaje ? styles.filaRodaje : {}]} wrap={false}>
                  <View style={styles.cScenes}>
                    {bloque.scenes_label ? (
                      <Text style={[styles.scenesLabel, { backgroundColor: labelColor, color: labelTextColor }]}>
                        {bloque.scenes_label}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.cDesc}>
                    <Text style={styles.tdMain}>{bloque.titulo}</Text>
                    {bloque.descripcion ? <Text style={styles.tdSub}>{bloque.descripcion}</Text> : null}
                  </View>
                  <View style={styles.cChar}>
                    <Text style={styles.tdMeta}>{bloque.character_num || ''}</Text>
                  </View>
                  <View style={styles.cDN}>
                    <Text style={styles.tdMeta}>{bloque.dia_noche || 'D'}</Text>
                  </View>
                  <View style={styles.cIE}>
                    <Text style={styles.tdMeta}>{bloque.interior_exterior || 'I'}</Text>
                  </View>
                  <View style={styles.cHora}>
                    <Text style={styles.tdHora}>
                      {casc.inicio_min !== undefined ? minutosAHora(casc.inicio_min) : ''}
                    </Text>
                  </View>
                  <View style={styles.cHora}>
                    <Text style={styles.tdHora}>
                      {casc.fin_min !== undefined ? minutosAHora(casc.fin_min) : ''}
                    </Text>
                  </View>
                  <View style={styles.cNotas}>
                    {bloque.nota_previa ? <Text style={styles.tdNotas}>{bloque.nota_previa}</Text> : null}
                  </View>
                </View>
              )
            })}

            <Text style={styles.totalText}>
              Total jornada: {Math.floor(durTotal / 60)}h {durTotal % 60}min
            </Text>
          </View>
        )}

        {/* ── EQUIPO TÉCNICO ── */}
        {equipo.length > 0 && (
          <View style={styles.seccion}>
            <Text style={styles.secTitulo}>Equipo técnico</Text>
            <View style={styles.tablaHeader}>
              <Text style={[styles.th, styles.ePos]}>Position</Text>
              <Text style={[styles.th, styles.eName]}>Name</Text>
              <Text style={[styles.th, styles.ePhone]}>Phone</Text>
              <Text style={[styles.th, { width: 40, textAlign: 'right', paddingRight: 5 }]}>In</Text>
            </View>
            {equipo.map((p: any) => (
              <View key={p.id} style={styles.equipoFila} wrap={false}>
                <View style={styles.ePos}>
                  <Text style={[styles.tdMain, { fontSize: 8 }]}>{p.rol || '—'}</Text>
                </View>
                <View style={styles.eName}>
                  <Text style={styles.tdMain}>{p.nombre}</Text>
                </View>
                <View style={styles.ePhone}>
                  <Text style={styles.tdMeta}>{p.telefono || '—'}</Text>
                </View>
                <View style={{ width: 36, alignItems: 'flex-end' }}>
                  <Text style={styles.tdHora}>
                    {formatHora(resolverHoraLlamado(p, rodaje)) || '—'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── FOOTER ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Casa Hiedra · Hoja de llamados</Text>
          <Text style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}
