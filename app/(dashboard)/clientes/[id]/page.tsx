import { notFound } from 'next/navigation'
import {
  getCliente,
  getProyectosCliente,
  getContactosCliente,
  getTareasCliente,
} from '@/app/actions/clientes'
import FichaCliente from '@/components/clientes/FichaCliente'
import { getClientes } from '@/app/actions/clientes'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientePage({ params }: Props) {
  const { id } = await params

  const [cliente, proyectos, contactos, tareas, todosLosClientes] = await Promise.all([
    getCliente(id),
    getProyectosCliente(id),
    getContactosCliente(id),
    getTareasCliente(id),
    getClientes(),
  ])

  if (!cliente) notFound()

  return (
    <div className="p-6 lg:p-10">
      <FichaCliente
        cliente={cliente}
        proyectos={proyectos}
        contactos={contactos}
        tareas={tareas as any}
        todosLosClientes={todosLosClientes}
      />
    </div>
  )
}
