import { leerClaveLink } from '@/lib/clave-link-io'
import DefinirClave from '@/components/usuarios/DefinirClave'
import { LARGO_MINIMO_CLAVE } from '@/lib/clave-link'

export const metadata = { title: 'Define tu contraseña · Hilván', robots: { index: false } }
export const dynamic = 'force-dynamic'

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen bg-ch-black flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-2">Hilván · Casa Hiedra</p>
        <h1 className="font-display italic text-3xl text-ch-cream mb-3">{titulo}</h1>
        <p className="font-body text-sm text-ch-muted mb-6">{texto}</p>
        <a href="/login" className="font-body text-xs text-ch-muted hover:text-ch-cream underline underline-offset-4">
          Ir al inicio de sesión
        </a>
      </div>
    </div>
  )
}

// Página pública. ABRIRLA NO CAMBIA NADA — WhatsApp y los clientes de correo
// abren los links para la vista previa. Solo "Guardar" consume el link.
export default async function ClavePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await leerClaveLink(token)

  if (link.estado === 'vencido') {
    return <Aviso titulo="Link vencido" texto="Pide uno nuevo a quien te lo mandó." />
  }
  if (link.estado !== 'valido') {
    return <Aviso titulo="Link inválido" texto="Este link no existe o ya se usó. Si necesitas cambiar tu contraseña, pide uno nuevo." />
  }

  return <DefinirClave token={token} email={link.email} nombre={link.nombre} minimo={LARGO_MINIMO_CLAVE} />
}
