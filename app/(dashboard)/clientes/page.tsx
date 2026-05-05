import { getClientes } from '@/app/actions/clientes'
import ListaClientes from '@/components/clientes/ListaClientes'

export default async function ClientesPage() {
  const clientes = await getClientes()
  return (
    <div className="p-6 lg:p-10">
      <ListaClientes clientes={clientes} />
    </div>
  )
}
