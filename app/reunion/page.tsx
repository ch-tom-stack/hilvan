import { freeBusyGCal } from '@/lib/google-calendar'
import { generarDias } from '@/lib/reuniones'
import ReservaCliente from './ReservaCliente'

// La disponibilidad se calcula en cada visita (no cachear).
export const dynamic = 'force-dynamic'

export default async function ReunionPage() {
  const ahora = new Date()
  let ocupados: { start: string; end: string }[] = []
  try {
    ocupados = await freeBusyGCal(ahora, new Date(ahora.getTime() + 16 * 86400000))
  } catch {
    ocupados = [] // si falla el calendario, mostramos según reglas (el backend re-valida)
  }
  const dias = generarDias(ahora, ocupados).map((dia) => ({
    key: dia.key,
    slots: dia.slots.map((s) => ({ inicio: s.inicio.toISOString(), disponible: s.disponible })),
  }))
  return <ReservaCliente dias={dias} />
}
