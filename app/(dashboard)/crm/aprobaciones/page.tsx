import { getAprobacionesPendientes } from '@/app/actions/crm'
import BandejaAprobaciones from './BandejaAprobaciones'

export default async function AprobacionesPage() {
  const aprobaciones = await getAprobacionesPendientes()
  return (
    <div className="p-6 lg:p-10">
      <BandejaAprobaciones aprobaciones={aprobaciones} />
    </div>
  )
}
