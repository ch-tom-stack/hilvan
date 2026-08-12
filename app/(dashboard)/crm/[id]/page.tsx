import { notFound } from 'next/navigation'
import { getProspecto, getOperadoresCrm } from '@/app/actions/crm'
import FichaProspecto from './FichaProspecto'

export default async function ProspectoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ prospecto, interacciones, hilos, notas, contactos, borradores, lecturas, insights }, responsables] = await Promise.all([
    getProspecto(id),
    getOperadoresCrm(),
  ])
  if (!prospecto) notFound()

  return (
    <FichaProspecto
      prospecto={prospecto}
      interacciones={interacciones}
      hilos={hilos}
      notasProspecto={notas}
      contactos={contactos}
      borradores={borradores}
      lecturas={lecturas}
      insights={insights}
      responsables={responsables}
    />
  )
}
