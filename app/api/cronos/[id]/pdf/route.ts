import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { HojaCronoPDF } from '@/components/cronos/HojaCronoPDF'
import { hoyIso } from '@/lib/crono'
import type { Crono, CronoHito, Feriado } from '@/types'

export const maxDuration = 30

function getLogoBase64(): string {
  try {
    return `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logos', 'logo-pdf.png')).toString('base64')}`
  } catch {
    return ''
  }
}

// GET /api/cronos/[id]/pdf — LA HOJA del crono en una A4 horizontal.
// Solo con sesión: se descarga desde el botón "Exportar PDF" del editor. No hay
// link público por token todavía (fase siguiente, si Tomás lo pide).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [{ data: crono, error }, { data: feriados }] = await Promise.all([
    supabase.from('cronos').select('*, proyecto:proyectos(id, nombre, cliente:clientes(id, nombre, empresa)), hitos:crono_hitos(*)').eq('id', id).single(),
    supabase.from('feriados').select('fecha, nombre'),
  ])
  if (error || !crono) return NextResponse.json({ error: 'Crono no encontrado' }, { status: 404 })

  const c = crono as unknown as Crono
  c.hitos = ((c.hitos ?? []) as CronoHito[]).slice().sort((a, b) => a.orden - b.orden)

  try {
    const buffer = await renderToBuffer(
      createElement(HojaCronoPDF, { crono: c, feriados: (feriados ?? []) as Feriado[], hoy: hoyIso(), logoBase64: getLogoBase64() }) as unknown as ReactElement<DocumentProps>,
    )
    const nombre = `crono-${c.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-').replace(/^-|-$/g, '')}.pdf`
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nombre}"` },
    })
  } catch (e) {
    console.error('[cronos/pdf]', e)
    return NextResponse.json({ error: 'Error generando PDF' }, { status: 500 })
  }
}
