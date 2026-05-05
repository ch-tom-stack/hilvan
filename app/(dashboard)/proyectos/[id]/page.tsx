import { notFound } from 'next/navigation'
import {
  getProyecto,
  getMetricasProyecto,
  getTareasProyecto,
  getContactosProyecto,
  getContactosCliente,
} from '@/app/actions/clientes'
import FichaProyecto from '@/components/clientes/FichaProyecto'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProyectoPage({ params }: Props) {
  const { id } = await params

  const proyecto = await getProyecto(id)
  if (!proyecto) notFound()

  const [metricas, tareas, contactosProyecto, contactosCliente] = await Promise.all([
    getMetricasProyecto(id),
    getTareasProyecto(id),
    getContactosProyecto(id),
    proyecto.cliente_id ? getContactosCliente(proyecto.cliente_id) : Promise.resolve([]),
  ])

  return (
    <div className="p-6 lg:p-10">
      <FichaProyecto
        proyecto={proyecto}
        metricas={metricas}
        tareas={tareas}
        contactosProyecto={contactosProyecto}
        contactosCliente={contactosCliente}
      />
    </div>
  )
}
