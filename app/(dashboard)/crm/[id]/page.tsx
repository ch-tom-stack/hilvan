import { notFound } from 'next/navigation'
import { getProspecto } from '@/app/actions/crm'
import FichaProspecto from './FichaProspecto'

export default async function ProspectoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { prospecto, interacciones, lecturas } = await getProspecto(id)
  if (!prospecto) notFound()

  return <FichaProspecto prospecto={prospecto} interacciones={interacciones} lecturas={lecturas} />
}
