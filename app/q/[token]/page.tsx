import { getPregunta } from '@/app/actions/crm-preguntas'
import { esRespuesta } from '@/lib/crm-preguntas'
import ResponderPregunta from '@/components/crm/ResponderPregunta'

export const metadata = { title: '¿En qué quedó? · Hilván', robots: { index: false } }

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen bg-ch-black flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-2">Hilván · Casa Hiedra</p>
        <h1 className="font-display italic text-3xl text-ch-cream mb-3">{titulo}</h1>
        <p className="font-body text-sm text-ch-muted">{texto}</p>
      </div>
    </div>
  )
}

// Página pública: se llega desde un botón del digest de la mañana. ABRIRLA NO
// CAMBIA NADA — los clientes de correo abren los links para revisarlos. Solo el
// botón "Guardar" escribe en el CRM.
export default async function PreguntaPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ r?: string }>
}) {
  const [{ token }, { r }] = await Promise.all([params, searchParams])
  const pregunta = await getPregunta(token)

  if (!pregunta) return <Aviso titulo="Link inválido" texto="Este link no corresponde a ninguna pregunta del CRM." />
  if (pregunta.estado === 'respondida') return <Aviso titulo="Anotado" texto={`Lo de ${pregunta.empresa} ya quedó registrado. Puedes cerrar esta página.`} />
  if (pregunta.estado === 'vencida') return <Aviso titulo="Link vencido" texto="Si sigue haciendo falta, la pregunta llega de nuevo en el próximo correo." />

  return <ResponderPregunta pregunta={pregunta} inicial={esRespuesta(r) ? r : null} />
}
