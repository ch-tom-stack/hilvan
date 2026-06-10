import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { HojaLlamadosPDF } from '@/components/rodaje/HojaLlamadosPDF'
import SunCalc from 'suncalc'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseFechaLocal } from '@/lib/fechas'

export const maxDuration = 30

function getLogoBase64(): string {
  try {
    const path = join(process.cwd(), 'public', 'logos', 'logo-pdf.png')
    return `data:image/png;base64,${readFileSync(path).toString('base64')}`
  } catch {
    return ''
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // Autorización: la hoja de llamados solo se descarga desde el dashboard
  // interno (botón "PDF" en /rodaje/[id]). El viewer público /rodaje/[id]/ver
  // y los emails de citación (/citacion/[token]) NO enlazan a este PDF, así
  // que exigir sesión no rompe ningún flujo de compartición existente.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data: rodaje, error } = await supabase
    .from('rodajes')
    .select(`*, proyecto:proyectos(nombre), equipo_tecnico:rodaje_equipo_tecnico(*, departamento:rodaje_departamentos(nombre))`)
    .eq('id', id)
    .single()

  if (error || !rodaje) {
    return NextResponse.json({ error: 'Rodaje no encontrado' }, { status: 404 })
  }

  const { data: bloques } = await supabase
    .from('rodaje_bloques')
    .select('*, locacion:rodaje_locaciones(nombre)')
    .eq('rodaje_id', id)
    .is('padre_id', null)
    .order('orden')

  const { data: locaciones } = await supabase
    .from('rodaje_locaciones')
    .select('*')
    .eq('rodaje_id', id)
    .order('orden')

  const locacionPrincipal = locaciones?.find((l: any) => l.es_principal) || locaciones?.[0]

  let sol = null
  if (rodaje.locacion_lat && rodaje.locacion_lng && rodaje.fecha) {
    const fecha = parseFechaLocal(rodaje.fecha)
    const times = SunCalc.getTimes(fecha, rodaje.locacion_lat, rodaje.locacion_lng)
    const fmt = (d: Date) => new Intl.DateTimeFormat('es-CL', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago',
    }).format(d)
    sol = {
      amanecer: fmt(times.sunrise),
      atardecer: fmt(times.sunset),
      dorada_am: fmt(times.goldenHourEnd),
      dorada_pm: fmt(times.goldenHour),
    }
  }

  let clima = null
  if (rodaje.locacion_lat && rodaje.locacion_lng && rodaje.fecha) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${rodaje.locacion_lat}&longitude=${rodaje.locacion_lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=America%2FSantiago&start_date=${rodaje.fecha}&end_date=${rodaje.fecha}`
      const res = await fetch(url)
      const data = await res.json()
      if (data?.daily?.temperature_2m_max?.[0] !== undefined) {
        const codigo = data.daily.weathercode[0]
        const condicionTexto = (c: number) => {
          if (c === 0) return 'Despejado'
          if (c <= 2) return 'Parcial nublado'
          if (c === 3) return 'Nublado'
          if (c <= 49) return 'Neblina'
          if (c <= 59) return 'Llovizna'
          if (c <= 69) return 'Lluvia'
          if (c <= 79) return 'Nieve'
          if (c <= 82) return 'Chubascos'
          if (c <= 99) return 'Tormenta'
          return 'Variable'
        }
        clima = {
          temp_min: Math.round(data.daily.temperature_2m_min[0]),
          temp_max: Math.round(data.daily.temperature_2m_max[0]),
          condicion: condicionTexto(codigo),
          condicion_codigo: codigo,
        }
      }
    } catch { /* silencioso */ }
  }

  const logoBase64 = getLogoBase64()

  try {
    const buffer = await renderToBuffer(
      createElement(HojaLlamadosPDF, {
        rodaje: { ...rodaje, locacion_nombre: locacionPrincipal?.nombre || rodaje.locacion_nombre },
        bloques: bloques || [],
        sol,
        clima,
        logoBase64,
      }) as unknown as ReactElement<DocumentProps>
    )

    const nombre = `hoja-llamados-${rodaje.nombre.toLowerCase().replace(/\s+/g, '-')}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nombre}"`,
      },
    })
  } catch (e) {
    console.error('Error generando PDF:', e)
    return NextResponse.json({ error: 'Error generando PDF' }, { status: 500 })
  }
}
