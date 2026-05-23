import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet, Font,
} from '@react-pdf/renderer'
import { calcularTotalesRental, subtotalRentalItem } from '@/types'
import type { RentalCotizacion, RentalCotizacionSeccion, RentalCotizacionItem } from '@/types'

const CREAM  = '#f5f0e8'
const MUTED  = '#9a9a92'
const SUBTLE = '#787872'
const BLACK  = '#111110'
const BORDER = '#383836'
const GREEN  = '#7a9e7e'

const s = StyleSheet.create({
  page: {
    backgroundColor: BLACK,
    color: CREAM,
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 40,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex1: { flex: 1 },

  // Header
  logo: { width: 90, height: 22, marginBottom: 24 },
  numero: { fontSize: 28, color: CREAM, marginBottom: 4 },
  subtitulo: { fontSize: 7, color: MUTED, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 24 },

  // Info grid
  infoBox: { flex: 1, borderWidth: 1, borderColor: BORDER, padding: 10, marginBottom: 20 },
  infoLabel: { fontSize: 7, color: MUTED, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  infoValue: { fontSize: 9, color: CREAM },
  infoValueSmall: { fontSize: 8, color: MUTED, marginTop: 2 },

  // Sección
  seccionLabel: { fontSize: 7, color: MUTED, letterSpacing: 3, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },

  // Tabla
  theadRow: { flexDirection: 'row', backgroundColor: '#242422', borderWidth: 1, borderColor: BORDER, paddingVertical: 6, paddingHorizontal: 10 },
  trow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 5, paddingHorizontal: 10 },
  trowAlt: { backgroundColor: '#1a1a18' },
  th: { fontSize: 7, color: MUTED, letterSpacing: 2, textTransform: 'uppercase' },
  td: { fontSize: 8, color: CREAM },
  tdMuted: { fontSize: 8, color: MUTED },
  tdGreen: { fontSize: 8, color: GREEN },

  // Col widths
  colDesc: { flex: 3 },
  colNum:  { flex: 1, textAlign: 'right' as const },

  // Totales
  totalesBox: { marginLeft: 'auto', width: 180, marginTop: 16 },
  totalesRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalesLabel: { fontSize: 8, color: MUTED },
  totalesValue: { fontSize: 8, color: CREAM },
  totalesTotal: { borderTopWidth: 1, borderTopColor: BORDER, marginTop: 4, paddingTop: 6 },
  totalesLabelBig: { fontSize: 10, color: CREAM },
  totalesValueBig: { fontSize: 14, color: CREAM },

  // Notas
  notasBox: { marginTop: 24, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 14 },
  notasLabel: { fontSize: 7, color: MUTED, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  notasText: { fontSize: 8, color: CREAM, lineHeight: 1.5 },

  // Footer
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: SUBTLE },
})

function fmtCLP(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

interface Props {
  cotizacion: RentalCotizacion & {
    cliente?: { nombre: string; empresa?: string; email?: string; rut?: string; direccion?: string } | null
    reserva?: { fecha_inicio: string; fecha_fin: string; equipo?: { nombre: string; codigo: string } | null; maleta?: { nombre: string; codigo: string } | null } | null
    secciones: (RentalCotizacionSeccion & { items: RentalCotizacionItem[] })[]
  }
  logoSrc: string
}

export default function RentalCotizacionPDF({ cotizacion, logoSrc }: Props) {
  const totales = calcularTotalesRental(cotizacion)
  const cliente = cotizacion.cliente
  const fechaDoc = new Date(cotizacion.created_at).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Logo + número */}
        <Image src={logoSrc} style={s.logo} />
        <Text style={s.numero}>{cotizacion.numero}</Text>
        <Text style={s.subtitulo}>Cotización de rental · Casa Hiedra</Text>

        {/* Info grid */}
        <View style={s.row}>
          <View style={[s.infoBox, { marginRight: 8 }]}>
            <Text style={s.infoLabel}>Cliente</Text>
            <Text style={s.infoValue}>{cliente?.nombre ?? cotizacion.cliente_nombre_libre ?? '—'}</Text>
            {cliente?.empresa && <Text style={s.infoValueSmall}>{cliente.empresa}</Text>}
            {cliente?.rut    && <Text style={s.infoValueSmall}>RUT {cliente.rut}</Text>}
            {cliente?.email  && <Text style={s.infoValueSmall}>{cliente.email}</Text>}
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Detalle</Text>
            <Text style={s.infoValue}>Fecha: {fechaDoc}</Text>
            {cotizacion.reserva && (
              <Text style={s.infoValueSmall}>
                Período: {cotizacion.reserva.fecha_inicio} → {cotizacion.reserva.fecha_fin}
              </Text>
            )}
            {cotizacion.reserva?.equipo && (
              <Text style={s.infoValueSmall}>
                {cotizacion.reserva.equipo.codigo} · {cotizacion.reserva.equipo.nombre}
              </Text>
            )}
          </View>
        </View>

        {/* Secciones */}
        {cotizacion.secciones.map(sec => (
          <View key={sec.id}>
            <Text style={s.seccionLabel}>{sec.nombre}</Text>
            {/* Header tabla */}
            <View style={s.theadRow}>
              <Text style={[s.th, s.colDesc]}>Descripción</Text>
              <Text style={[s.th, s.colNum]}>Cant.</Text>
              <Text style={[s.th, s.colNum]}>Días</Text>
              <Text style={[s.th, s.colNum]}>Precio/día</Text>
              <Text style={[s.th, s.colNum]}>Subtotal</Text>
            </View>
            {(sec.items ?? []).map((item, i) => {
              const sub = subtotalRentalItem(item)
              return (
                <View key={item.id} style={[s.trow, i % 2 !== 0 ? s.trowAlt : {}]}>
                  <View style={s.colDesc}>
                    <Text style={s.td}>{item.descripcion}</Text>
                    {item.incluido && <Text style={[s.tdGreen, { fontSize: 7 }]}>Incluido</Text>}
                  </View>
                  <Text style={[s.tdMuted, s.colNum]}>{item.cantidad}</Text>
                  <Text style={[s.tdMuted, s.colNum]}>{item.dias}d</Text>
                  <Text style={[s.tdMuted, s.colNum]}>{fmtCLP(item.precio_unitario)}</Text>
                  <Text style={[s.td, s.colNum]}>{fmtCLP(sub)}</Text>
                </View>
              )
            })}
          </View>
        ))}

        {/* Totales */}
        <View style={s.totalesBox}>
          <View style={s.totalesRow}>
            <Text style={s.totalesLabel}>Subtotal</Text>
            <Text style={s.totalesValue}>{fmtCLP(totales.neto)}</Text>
          </View>
          {totales.descuento_global_monto > 0 && (
            <View style={s.totalesRow}>
              <Text style={s.totalesLabel}>Descuento</Text>
              <Text style={[s.totalesValue, { color: '#f87171' }]}>-{fmtCLP(totales.descuento_global_monto)}</Text>
            </View>
          )}
          {cotizacion.con_iva && (
            <View style={s.totalesRow}>
              <Text style={s.totalesLabel}>IVA (19%)</Text>
              <Text style={s.totalesValue}>{fmtCLP(totales.iva)}</Text>
            </View>
          )}
          <View style={[s.totalesRow, s.totalesTotal]}>
            <Text style={s.totalesLabelBig}>Total</Text>
            <Text style={s.totalesValueBig}>{fmtCLP(totales.total)}</Text>
          </View>
        </View>

        {/* Notas para el cliente */}
        {cotizacion.notas_cliente && (
          <View style={s.notasBox}>
            <Text style={s.notasLabel}>Notas</Text>
            <Text style={s.notasText}>{cotizacion.notas_cliente}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Casa Hiedra · casahiedra.com</Text>
          <Text style={s.footerText}>{cotizacion.numero}</Text>
        </View>

      </Page>
    </Document>
  )
}
