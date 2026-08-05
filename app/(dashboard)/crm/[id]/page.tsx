import { notFound } from 'next/navigation'
import { getProspecto, getResponsablesCrm } from '@/app/actions/crm'
import FichaProspecto from './FichaProspecto'

export default async function ProspectoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ prospecto, interacciones, lecturas }, responsables] = await Promise.all([
    getProspecto(id),
    getResponsablesCrm(),
  ])
  if (!prospecto) notFound()

  return (
    <FichaProspecto
      prospecto={prospecto}
      interacciones={interacciones}
      lecturas={lecturas}
      responsables={responsables}
    />
  )
}
