import { validarLinkOnboarding } from '@/app/actions/colaboradores'
import { notFound } from 'next/navigation'
import OnboardingForm from './OnboardingForm'

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const link = await validarLinkOnboarding(token)
  if (!link) notFound()

  const diasRestantes = Math.ceil(
    (new Date(link.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  return (
    <div className="min-h-screen bg-ch-black text-ch-cream">
      <div className="max-w-xl mx-auto px-5 py-10">

        <div className="mb-10">
          <p className="text-ch-muted font-body text-[9px] tracking-[0.5em] uppercase mb-1">Casa Hiedra</p>
          <h1 className="font-display italic text-4xl text-ch-cream leading-tight">Hola, {link.colaborador.nombre.split(' ')[0]}</h1>
          <p className="text-ch-muted font-body text-xs mt-2">
            Completa tu ficha para trabajar con nosotros. Este link es válido por {diasRestantes} día{diasRestantes !== 1 ? 's' : ''} más.
          </p>
        </div>

        <OnboardingForm token={token} colaborador={link.colaborador} />

        <div className="mt-12 border-t border-ch-border pt-6 text-center">
          <p className="text-ch-muted font-body text-[10px]">Casa Hiedra · casahiedra.com</p>
        </div>
      </div>
    </div>
  )
}
