import { getResponsablesCrm } from '@/app/actions/crm'
import FormProspecto from '@/components/crm/FormProspecto'

export default async function NuevoProspectoPage() {
  const responsables = await getResponsablesCrm()
  return <FormProspecto responsables={responsables} />
}
