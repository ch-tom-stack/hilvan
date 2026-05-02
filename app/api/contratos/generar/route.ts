import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType,
} from 'docx'
import { createClient } from '@/lib/supabase/server'

function hoy() {
  return new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })
}

function parrafo(texto: string, opts: { bold?: boolean; size?: number; center?: boolean; spacing?: number } = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    spacing: { after: opts.spacing ?? 200 },
    children: [
      new TextRun({
        text: texto,
        bold: opts.bold,
        size: opts.size ?? 24,
        font: 'Calibri',
      }),
    ],
  })
}

function titulo(texto: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    alignment: AlignmentType.CENTER,
    spacing: { after: 400, before: 200 },
    children: [new TextRun({ text: texto, bold: true, size: 28, font: 'Calibri', color: '1a1a1a' })],
  })
}

function clausula(numero: number, tituloClausula: string, contenido: string) {
  return [
    new Paragraph({
      spacing: { after: 160, before: 300 },
      children: [new TextRun({ text: `CLÁUSULA ${numero}: ${tituloClausula}`, bold: true, size: 24, font: 'Calibri' })],
    }),
    parrafo(contenido),
  ]
}

function firmas(parteA: string, parteB: string) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 45, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ spacing: { before: 1200, after: 0 }, children: [new TextRun({ text: '_____________________________', font: 'Calibri', size: 22 })] }),
              parrafo(parteA, { size: 22, spacing: 80 }),
              parrafo('Firma', { size: 20, spacing: 0 }),
            ],
          }),
          new TableCell({
            width: { size: 10, type: WidthType.PERCENTAGE },
            children: [parrafo('')],
          }),
          new TableCell({
            width: { size: 45, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ spacing: { before: 1200, after: 0 }, children: [new TextRun({ text: '_____________________________', font: 'Calibri', size: 22 })] }),
              parrafo(parteB, { size: 22, spacing: 80 }),
              parrafo('Firma', { size: 20, spacing: 0 }),
            ],
          }),
        ],
      }),
    ],
  })
}

// ─── Generadores por tipo ─────────────────────────────────────────────────────

function generarMarcoEquipo(col: any, rodaje: any) {
  return new Document({
    sections: [{
      children: [
        titulo('CONTRATO DE SERVICIOS TÉCNICOS'),
        parrafo(`Santiago, ${hoy()}`, { center: true }),
        parrafo(''),
        parrafo(`Entre PRODUCCIONES CASA HIEDRA SpA, RUT 76.XXX.XXX-X, representada por _______________, en adelante "LA EMPRESA", y ${col.nombre}, RUT ${col.rut || '___'}, correo ${col.email || '___'}, en adelante "EL PRESTADOR", se celebra el siguiente contrato de prestación de servicios:`),
        ...clausula(1, 'OBJETO', `El Prestador se compromete a prestar servicios técnicos y/o creativos en el proyecto "${rodaje?.nombre || '___'}", a desarrollarse en el período que la Empresa indique, en las locaciones que correspondan.`),
        ...clausula(2, 'HONORARIOS', `Las partes acuerdan una remuneración de $_____ CLP por jornada (${col.tipo_documento === 'boleta' ? 'sujeto a retención del 15,4% según Ley de Honorarios' : col.tipo_documento === 'bet' ? 'mediante BET' : 'según instrumento acordado'}). El pago se realizará dentro de los 10 días hábiles siguientes a la entrega del documento tributario correspondiente.`),
        ...clausula(3, 'JORNADA Y LUGAR', `Las jornadas serán acordadas con la producción según las necesidades del proyecto. El Prestador declara conocer las condiciones propias de la industria audiovisual.`),
        ...clausula(4, 'CONFIDENCIALIDAD', `El Prestador se obliga a mantener reserva absoluta sobre todos los aspectos del proyecto, incluyendo guiones, imágenes, datos del cliente y cualquier información obtenida durante la prestación.`),
        ...clausula(5, 'PROPIEDAD INTELECTUAL', `Todo material producido en el marco de este contrato será de exclusiva propiedad de La Empresa y/o su cliente. El Prestador cede todos los derechos patrimoniales sobre dicho material.`),
        ...clausula(6, 'VIGENCIA', `Este contrato tendrá vigencia durante el período de producción del proyecto mencionado, o hasta que ambas partes convengan su término.`),
        parrafo(''),
        firmas('PRODUCCIONES CASA HIEDRA SpA', col.nombre),
      ],
    }],
  })
}

function generarRelease(col: any, rodaje: any) {
  return new Document({
    sections: [{
      children: [
        titulo('AUTORIZACIÓN DE USO DE IMAGEN'),
        parrafo(`Santiago, ${hoy()}`, { center: true }),
        parrafo(''),
        parrafo(`Yo, ${col.nombre}, RUT ${col.rut || '___'}, en pleno uso de mis facultades, autorizo a PRODUCCIONES CASA HIEDRA SpA a utilizar mi imagen, voz y nombre en el proyecto audiovisual "${rodaje?.nombre || '___'}".`),
        ...clausula(1, 'ALCANCE DE LA AUTORIZACIÓN', 'La presente autorización incluye el uso de mi imagen en cualquier medio de comunicación, plataforma digital, material publicitario o de difusión, sin limitación territorial ni temporal, vinculados al proyecto señalado.'),
        ...clausula(2, 'RETRIBUCIÓN', 'Esta autorización se otorga a título gratuito, o como parte de la compensación acordada por mi participación en el proyecto.'),
        ...clausula(3, 'REVOCABILIDAD', 'Una vez firmado este documento, esta autorización no podrá ser revocada unilateralmente, salvo acuerdo escrito entre las partes.'),
        parrafo(''),
        firmas('PRODUCCIONES CASA HIEDRA SpA', col.nombre),
      ],
    }],
  })
}

function generarMarcoModelo(col: any, rodaje: any) {
  return new Document({
    sections: [{
      children: [
        titulo('CONTRATO DE MODELO / TALENT'),
        parrafo(`Santiago, ${hoy()}`, { center: true }),
        parrafo(''),
        parrafo(`Entre PRODUCCIONES CASA HIEDRA SpA, RUT 76.XXX.XXX-X, en adelante "LA EMPRESA", y ${col.nombre}, RUT ${col.rut || '___'}, correo ${col.email || '___'}, en adelante "EL MODELO/TALENT", se celebra el presente contrato:`),
        ...clausula(1, 'OBJETO', `El Modelo/Talent participará en el proyecto "${rodaje?.nombre || '___'}" en el rol de _______________, en las fechas y condiciones que La Empresa comunique.`),
        ...clausula(2, 'REMUNERACIÓN', `Se acuerda un pago de $_____ CLP por participación/jornada. El pago se realizará dentro de los 10 días hábiles tras la firma del documento tributario.`),
        ...clausula(3, 'AUTORIZACIÓN DE IMAGEN', 'El Modelo/Talent autoriza expresamente el uso de su imagen, voz y nombre en el proyecto indicado y en su difusión, sin limitación territorial ni temporal.'),
        ...clausula(4, 'EXCLUSIVIDAD', 'Durante el período de producción, el Modelo/Talent no podrá participar en proyectos de la competencia directa sin autorización escrita de La Empresa.'),
        ...clausula(5, 'CONFIDENCIALIDAD', 'Las partes se obligan a guardar reserva sobre los términos económicos y contenidos del proyecto.'),
        parrafo(''),
        firmas('PRODUCCIONES CASA HIEDRA SpA', col.nombre),
      ],
    }],
  })
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { colaboradorId, tipo, rodajeId } = await req.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: col } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('id', colaboradorId)
    .single()

  if (!col) return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 })

  let rodaje = null
  if (rodajeId) {
    const { data } = await supabase.from('rodajes').select('id, nombre').eq('id', rodajeId).single()
    rodaje = data
  }

  let doc: Document

  switch (tipo) {
    case 'marco_equipo':
      doc = generarMarcoEquipo(col, rodaje)
      break
    case 'marco_modelo':
      doc = generarMarcoModelo(col, rodaje)
      break
    case 'release':
      doc = generarRelease(col, rodaje)
      break
    default:
      return NextResponse.json({ error: 'Tipo de contrato desconocido' }, { status: 400 })
  }

  const buffer = await Packer.toBuffer(doc)

  const nombreArchivo = `contrato_${tipo}_${col.nombre.replace(/\s+/g, '_')}_${Date.now()}.docx`

  // Subir a Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('contratos')
    .upload(nombreArchivo, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })

  if (!uploadError) {
    const { data: { publicUrl } } = supabase.storage.from('contratos').getPublicUrl(nombreArchivo)

    await supabase.from('contratos_generados').insert({
      colaborador_id: colaboradorId,
      rodaje_id: rodajeId || null,
      tipo,
      archivo_url: publicUrl,
      firmado: false,
    })
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}
