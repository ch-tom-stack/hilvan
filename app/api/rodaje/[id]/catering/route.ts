import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { formatHora, resolverHoraLlamado } from '@/types'

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 44,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  logo: { width: 80 },
  titulo: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sub: { fontSize: 9, color: '#777' },
  badge: { fontSize: 7, color: '#555', backgroundColor: '#f5f5f5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  secTitulo: { fontSize: 7, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  tabla: { marginBottom: 20 },
  tablaHeader: { flexDirection: 'row', backgroundColor: '#111', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 2, marginBottom: 1 },
  th: { fontSize: 7, color: '#fff', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  fila: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  cNombre: { flex: 1 },
  cRol: { width: 120 },
  cHora: { width: 50 },
  cRestr: { flex: 2 },
  td: { fontSize: 9, color: '#222' },
  tdSub: { fontSize: 7, color: '#999', marginTop: 1 },
  tdRestr: { fontSize: 9, color: '#c2410c', fontFamily: 'Helvetica-Bold' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: '#bbb' },
  resumen: { backgroundColor: '#fff7ed', borderRadius: 2, padding: 10, marginBottom: 20 },
  resumenTitulo: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#c2410c', marginBottom: 6 },
  resumenItem: { fontSize: 8, color: '#555', marginBottom: 2 },
})

function CateringPDF({ rodaje, citaciones }: { rodaje: any; citaciones: any[] }) {
  const fecha = rodaje.fecha
    ? new Date(rodaje.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : 'Fecha por definir'

  // Agrupar restricciones únicas
  const restriccionesUnicas: Record<string, number> = {}
  citaciones.forEach((c) => {
    if (c.restricciones_alimentarias) {
      const r = c.restricciones_alimentarias.toLowerCase().trim()
      restriccionesUnicas[r] = (restriccionesUnicas[r] || 0) + 1
    }
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Image src="/logos/logo-pdf.png" style={styles.logo} />
            <Text style={styles.titulo}>Restricciones alimentarias</Text>
            <Text style={styles.sub}>{rodaje.nombre}  ·  {fecha}</Text>
          </View>
          <Text style={styles.badge}>Catering</Text>
        </View>

        {/* Resumen de restricciones */}
        <View style={styles.resumen}>
          <Text style={styles.resumenTitulo}>Resumen — {citaciones.length} persona{citaciones.length !== 1 ? 's' : ''} con restricciones</Text>
          {Object.entries(restriccionesUnicas).map(([r, n]) => (
            <Text key={r} style={styles.resumenItem}>· {r}{n > 1 ? ` (×${n})` : ''}</Text>
          ))}
        </View>

        {/* Tabla detalle */}
        <Text style={styles.secTitulo}>Detalle por persona</Text>
        <View style={styles.tabla}>
          <View style={styles.tablaHeader}>
            <Text style={[styles.th, styles.cNombre]}>Nombre</Text>
            <Text style={[styles.th, styles.cRol]}>Rol</Text>
            <Text style={[styles.th, styles.cHora]}>Llegada</Text>
            <Text style={[styles.th, styles.cRestr]}>Restricción</Text>
          </View>
          {citaciones.map((c: any) => (
            <View key={c.id} style={styles.fila}>
              <View style={styles.cNombre}>
                <Text style={styles.td}>{c.persona?.nombre}</Text>
                {c.persona?.departamento?.nombre && (
                  <Text style={styles.tdSub}>{c.persona.departamento.nombre}</Text>
                )}
              </View>
              <View style={styles.cRol}>
                <Text style={styles.td}>{c.persona?.rol || '—'}</Text>
              </View>
              <View style={styles.cHora}>
                <Text style={styles.td}>{formatHora(resolverHoraLlamado(c.persona, rodaje))}</Text>
              </View>
              <View style={styles.cRestr}>
                <Text style={styles.tdRestr}>{c.restricciones_alimentarias}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Casa Hiedra · Catering</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()

  const { data: rodaje } = await supabase
    .from('rodajes')
    .select('*, proyecto:proyectos(nombre), equipo_tecnico:rodaje_equipo_tecnico(*, departamento:rodaje_departamentos(nombre))')
    .eq('id', params.id)
    .single()

  if (!rodaje) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Solo citaciones con restricciones
  const { data: citaciones } = await supabase
    .from('rodaje_citaciones')
    .select('*, persona:rodaje_equipo_tecnico(*, departamento:rodaje_departamentos(nombre))')
    .eq('rodaje_id', params.id)
    .not('restricciones_alimentarias', 'is', null)
    .neq('restricciones_alimentarias', '')

  if (!citaciones || citaciones.length === 0) {
    return NextResponse.json({ error: 'Sin restricciones registradas' }, { status: 404 })
  }

  try {
    const buffer = await renderToBuffer(
      createElement(CateringPDF, { rodaje, citaciones })
    )
    const nombre = `catering-${rodaje.nombre.toLowerCase().replace(/\s+/g, '-')}.pdf`
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nombre}"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: 'Error generando PDF' }, { status: 500 })
  }
}
