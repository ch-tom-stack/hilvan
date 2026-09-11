import { notFound } from 'next/navigation'
import { getCrono, getFeriados, getProyectosOpciones, getRodajesProyecto, getVariantes } from '@/app/actions/cronos'
import EditorCrono from '@/components/cronos/EditorCrono'

export const dynamic = 'force-dynamic'

export default async function CronoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const crono = await getCrono(id)
  if (!crono) notFound()
  const [proyectos, rodajes, feriados, variantes] = await Promise.all([
    getProyectosOpciones(),
    crono.proyecto_id ? getRodajesProyecto(crono.proyecto_id) : Promise.resolve([]),
    getFeriados(),
    getVariantes(id),
  ])
  return <EditorCrono crono={crono} proyectos={proyectos} rodajesProyecto={rodajes} feriados={feriados} variantes={variantes} />
}
