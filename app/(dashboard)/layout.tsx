import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import RevelacionMedalla from '@/components/perfil/RevelacionMedalla'
import type { Profile } from '@/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  if (!profile) {
    console.error('[DashboardLayout] No se pudo cargar el perfil del usuario', {
      userId: user.id,
      error: profileError?.message,
    })
  }

  return (
    <div className="flex min-h-screen bg-ch-dark">
      <Sidebar
        email={user.email}
        nombre={profile?.nombre}
        rol={profile?.rol}
      />
      {/* pt-14 en móvil para compensar el header fijo (h-14=56px), 0 en desktop */}
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        {children}
      </main>
      {/* Vive en el layout y no en cada página: la medalla se puede ganar en
          cualquier parte de la app. */}
      <RevelacionMedalla />
    </div>
  )
}
