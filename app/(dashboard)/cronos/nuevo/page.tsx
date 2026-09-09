import Link from 'next/link'
import { getProyectosOpciones } from '@/app/actions/cronos'
import NuevoCronoForm from '@/components/cronos/NuevoCronoForm'

export const metadata = { title: 'Nuevo crono — Hilván' }
export const dynamic = 'force-dynamic'

export default async function NuevoCronoPage({ searchParams }: { searchParams: Promise<{ proyecto_id?: string }> }) {
  const { proyecto_id } = await searchParams
  const proyectos = await getProyectosOpciones()
  return (
    <div className="p-6 lg:p-10 max-w-2xl">
      <Link href="/cronos" className="font-body text-xs text-ch-muted hover:text-ch-cream transition-colors">← Cronos</Link>
      <h1 className="font-display italic text-4xl text-ch-cream leading-none mt-4 mb-2">Nuevo crono</h1>
      <p className="font-body text-sm text-ch-muted mb-8">Nace suelto o dentro de un proyecto. Las etapas y los hitos se ponen después, en una sola pantalla.</p>
      <NuevoCronoForm proyectos={proyectos} proyectoInicial={proyecto_id} />
    </div>
  )
}
