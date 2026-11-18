// Pronóstico del día de rodaje (Open-Meteo, sin clave, permite CORS).
// Se pide directo desde el navegador: como server action quedaba en la fila
// detrás de cualquier guardado y el clima tardaba en aparecer.

export interface ClimaDia {
  temp_min: number
  temp_max: number
  condicion: string
  condicion_codigo: number
}

export function condicionClima(codigo: number): string {
  if (codigo === 0) return 'Despejado'
  if (codigo <= 2) return 'Parcialmente nublado'
  if (codigo === 3) return 'Nublado'
  if (codigo <= 49) return 'Neblina'
  if (codigo <= 59) return 'Llovizna'
  if (codigo <= 69) return 'Lluvia'
  if (codigo <= 79) return 'Nieve'
  if (codigo <= 82) return 'Chubascos'
  if (codigo <= 99) return 'Tormenta'
  return 'Variable'
}

/** Null si no hay pronóstico (fecha fuera de rango, sin red, etc.). Nunca lanza. */
export async function obtenerClima(lat: number, lng: number, fecha: string, signal?: AbortSignal): Promise<ClimaDia | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=America%2FSantiago&start_date=${fecha}&end_date=${fecha}`
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const data = await res.json()
    const max = data?.daily?.temperature_2m_max?.[0]
    const min = data?.daily?.temperature_2m_min?.[0]
    const codigo = data?.daily?.weathercode?.[0]
    if (typeof max !== 'number' || typeof min !== 'number' || typeof codigo !== 'number') return null
    return { temp_min: Math.round(min), temp_max: Math.round(max), condicion: condicionClima(codigo), condicion_codigo: codigo }
  } catch {
    return null
  }
}
