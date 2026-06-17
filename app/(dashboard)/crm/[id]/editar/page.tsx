import { notFound } from 'next/navigation'
import { getProspecto, getResponsablesCrm } from '@/app/actions/crm'
import FormProspecto from '@/components/crm/FormProspecto'

export default async function EditarProspectoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ prospecto }, responsables] = await Promise.all([
    getProspecto(id),
    getResponsablesCrm(),
  ])
  if (!prospecto) notFound()

  return <FormProspecto prospecto={prospecto} responsables={responsables} />
}
