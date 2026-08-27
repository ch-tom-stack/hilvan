import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import {
  numeroCotizacion,
  calcularTotales,
  subtotalDepartamento,
  subtotalSubgrupo,
  subtotalItem,
  formatCLP,
  type Cotizacion,
} from '@/types'

const S = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 45,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#1a1a1a',
  },
  logo: {
    width: 160,
    height: 27,
    marginBottom: 14,
  },
  headerBar: {
    backgroundColor: '#d4d4d4',
    paddingVertical: 5,
    paddingLeft: 53,
    paddingRight: 53,
    marginBottom: 10,
    marginLeft: -45,
    marginRight: -45,
  },
  headerBarText: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  metaLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    marginRight: 4,
    width: 50,
  },
  metaValue: {
    fontSize: 8,
    color: '#333',
    flex: 1,
  },
  sectionBar: {
    backgroundColor: '#d4d4d4',
    paddingVertical: 5,
    paddingLeft: 53,
    paddingRight: 53,
    marginTop: 14,
    marginBottom: 6,
    marginLeft: -45,
    marginRight: -45,
  },
  sectionBarText: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  depRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 4,
    borderBottomWidth: 0.8,
    borderBottomColor: '#1a1a1a',
    paddingBottom: 2,
    paddingRight: 8,
  },
  depNombre: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  depTotal: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
  },
  sgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    marginBottom: 3,
    paddingLeft: 8,
    paddingRight: 8,
    borderBottomWidth: 0.4,
    borderBottomColor: '#999',
    paddingBottom: 2,
  },
  sgNombre: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#333',
  },
  sgTotal: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#333',
  },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingLeft: 8,
    paddingRight: 8,
    borderBottomWidth: 0.3,
    borderBottomColor: '#e5e5e5',
  },
  itemLeft: {
    flex: 1,
    paddingRight: 10,
  },
  itemNombre: {
    fontSize: 7.5,
    color: '#222',
  },
  itemDesc: {
    fontSize: 6.5,
    color: '#888',
    marginTop: 1,
    marginLeft: 8,
    lineHeight: 1.4,
  },
  itemPrecio: {
    fontSize: 7.5,
    color: '#222',
    textAlign: 'right',
    width: 60,
  },
  totalesContainer: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  totalSeparator: {
    borderTopWidth: 0.5,
    borderTopColor: '#999',
    width: 220,
    marginBottom: 6,
  },
  totalRow: {
    flexDirection: 'row',
    width: 220,
    marginBottom: 3,
  },
  totalLabel: {
    fontSize: 8,
    color: '#555',
    flex: 1,
    textAlign: 'right',
    paddingRight: 14,
  },
  totalValue: {
    fontSize: 8,
    color: '#1a1a1a',
    width: 72,
    textAlign: 'right',
  },
  totalFinalSeparator: {
    borderTopWidth: 0.5,
    borderTopColor: '#999',
    width: 220,
    marginTop: 3,
    marginBottom: 5,
  },
  totalFinalRow: {
    flexDirection: 'row',
    width: 220,
  },
  totalFinalLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    flex: 1,
    textAlign: 'right',
    paddingRight: 14,
  },
  totalFinalValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    width: 72,
    textAlign: 'right',
  },
  notasContainer: {
    marginTop: 14,
  },
  notaText: {
    fontSize: 7,
    color: '#555',
    marginBottom: 2,
    lineHeight: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 45,
    right: 45,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.3,
    borderTopColor: '#ccc',
    paddingTop: 4,
  },
  footerText: {
    fontSize: 6.5,
    color: '#aaa',
  },
})

function formatFechaPDF(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

interface Props {
  cotizacion: Cotizacion
  logoSrc: string
}

export default function CotizacionPDF({ cotizacion, logoSrc }: Props) {
  const totales = calcularTotales(cotizacion)
  const numVisible = numeroCotizacion({
    grupo: cotizacion.grupo,
    version: cotizacion.version,
    variante: cotizacion.variante,
  })
  const nombreCliente =
    cotizacion.cliente?.nombre || cotizacion.cliente_nombre_libre || '—'

  return (
    <Document>
      <Page size="A4" style={S.page}>

        <Image src={logoSrc} style={S.logo} />

        <View style={S.headerBar}>
          <Text style={S.headerBarText}>COTIZACIÓN | {cotizacion.nombre}</Text>
        </View>

        <View style={{ marginBottom: 8 }}>
          <View style={S.metaRow}>
            <Text style={S.metaLabel}>Fecha:</Text>
            <Text style={S.metaValue}>
              {formatFechaPDF(cotizacion.fecha_envio || cotizacion.created_at)}
            </Text>
            <Text style={[S.metaLabel, { width: 20 }]}>N°:</Text>
            <Text style={S.metaValue}>{numVisible}</Text>
          </View>
          {cotizacion.solicita && (
            <View style={S.metaRow}>
              <Text style={S.metaLabel}>Solicita:</Text>
              <Text style={S.metaValue}>{cotizacion.solicita}</Text>
            </View>
          )}
          <View style={S.metaRow}>
            <Text style={S.metaLabel}>Agencia:</Text>
            <Text style={S.metaValue}>{nombreCliente}</Text>
          </View>
          {cotizacion.cliente_final && (
            <View style={S.metaRow}>
              <Text style={S.metaLabel}>Cliente:</Text>
              <Text style={S.metaValue}>{cotizacion.cliente_final}</Text>
            </View>
          )}
          {cotizacion.referencia && (
            <View style={S.metaRow}>
              <Text style={S.metaLabel}>Referencia:</Text>
              <Text style={S.metaValue}>{cotizacion.referencia}</Text>
            </View>
          )}
          {(cotizacion.descripcion || cotizacion.medios) && (
            <View style={{ marginTop: 6 }}>
              {cotizacion.medios && (
                <View style={S.metaRow}>
                  <Text style={S.metaLabel}>Medios:</Text>
                  <Text style={S.metaValue}>{cotizacion.medios}</Text>
                </View>
              )}
              {cotizacion.descripcion && (
                <Text style={{ fontSize: 8, color: '#333', marginTop: 4, lineHeight: 1.5 }}>
                  {cotizacion.descripcion}
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={S.sectionBar}>
          <Text style={S.sectionBarText}>Detalle Base</Text>
        </View>

        {(() => {
          // Categorías con contenido real (las vacías no se dibujan).
          const depsVisibles = (cotizacion.departamentos ?? []).filter(dep => {
            const depBundle = dep.precio_manual != null
            return (
              depBundle ||
              (dep.subgrupos?.some(sg => (sg.items?.length ?? 0) > 0) ?? false) ||
              (dep.items?.length ?? 0) > 0
            )
          })

          const bloqueTotales = (
            <View style={S.totalesContainer}>
              <View style={S.totalSeparator} />
              <View style={S.totalRow}>
                <Text style={S.totalLabel}>Valor (antes de Impuestos)</Text>
                <Text style={S.totalValue}>{formatCLP(totales.neto_con_descuento)}</Text>
              </View>
              {cotizacion.con_iva && (
                <View style={S.totalRow}>
                  <Text style={S.totalLabel}>Valor IVA Incl.</Text>
                  <Text style={S.totalValue}>{formatCLP(totales.total)}</Text>
                </View>
              )}
              <View style={S.totalFinalSeparator} />
              <View style={S.totalFinalRow}>
                <Text style={S.totalFinalLabel}>TOTAL</Text>
                <Text style={S.totalFinalValue}>{formatCLP(totales.total)}</Text>
              </View>
            </View>
          )

          // Principio de paginación: los totales NUNCA quedan huérfanos en una
          // página propia. La última categoría y los totales viajan juntos
          // (wrap={false}): si no caben al pie de la página 1, se pasan JUNTOS
          // a la 2 — que así arranca con líneas de glosa y queda equilibrada,
          // en vez de mostrar solo el total flotando.
          return (
            <>
              {depsVisibles.slice(0, -1).map(dep => (
                <DepPDF key={dep.id} dep={dep} />
              ))}
              <View wrap={false}>
                {depsVisibles.length > 0 && (
                  <DepPDF dep={depsVisibles[depsVisibles.length - 1]} />
                )}
                {bloqueTotales}
              </View>
            </>
          )
        })()}

        {cotizacion.notas_cliente && (() => {
          const lineas = cotizacion.notas_cliente!.split('\n')
          return (
            <View style={S.notasContainer}>
              {/* La barra "Notas" viaja amarrada a su primera línea (wrap={false}):
                  si no caben juntas al pie de la página, pasan juntas a la
                  siguiente — el título nunca queda huérfano. El resto de las
                  líneas fluye normal (notas largas no desbordan la hoja). */}
              <View wrap={false}>
                <View style={S.sectionBar}>
                  <Text style={S.sectionBarText}>Notas</Text>
                </View>
                {lineas[0] !== undefined && <Text style={S.notaText}>{lineas[0]}</Text>}
              </View>
              {lineas.slice(1).map((l, i) => (
                <Text key={i} style={S.notaText}>{l}</Text>
              ))}
            </View>
          )
        })()}

        <View style={S.footer} fixed>
          <Text style={S.footerText}>Casa Hiedra · Producción Audiovisual</Text>
          <Text style={S.footerText}>{numVisible}</Text>
        </View>

      </Page>
    </Document>
  )
}

// Una categoría completa (header + subgrupos + ítems). wrap={false}: no se
// parte entre páginas, así el título nunca queda huérfano al pie de una hoja.
function DepPDF({ dep }: { dep: any }) {
  const depBundle = dep.precio_manual != null
  return (
    <View wrap={false}>
      <View style={S.depRow}>
        <Text style={S.depNombre}>{dep.nombre}</Text>
        <Text style={S.depTotal}>{formatCLP(subtotalDepartamento(dep))}</Text>
      </View>

      {(dep.subgrupos ?? []).filter((sg: any) => (sg.items?.length ?? 0) > 0 || sg.precio_manual != null).map((sg: any) => (
        <View key={sg.id}>
          <View style={S.sgRow}>
            <Text style={S.sgNombre}>{sg.nombre}</Text>
            <Text style={S.sgTotal}>{formatCLP(subtotalSubgrupo(sg))}</Text>
          </View>
          {(sg.items ?? []).map((item: any) => <ItemPDF key={item.id} item={item} simple={depBundle || sg.precio_manual != null} />)}
        </View>
      ))}

      {(dep.items ?? []).map((item: any) => <ItemPDF key={item.id} item={item} simple={depBundle} />)}
    </View>
  )
}

function ItemPDF({ item, simple }: { item: any; simple?: boolean }) {
  const subtotal = subtotalItem(item)
  return (
    <View style={S.itemRow}>
      <View style={S.itemLeft}>
        <Text style={S.itemNombre}>
          {'- '}{item.nombre}
          {!item.incluido && item.cantidad > 1 ? ` (×${item.cantidad})` : ''}
        </Text>
        {item.descripcion ? (
          <Text style={S.itemDesc}>{item.descripcion}</Text>
        ) : null}
      </View>
      {!simple && (
        <Text style={S.itemPrecio}>
          {item.incluido ? 'Incluida' : formatCLP(subtotal)}
        </Text>
      )}
    </View>
  )
}
