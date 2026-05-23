import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RentalSidebar from '@/components/rental/RentalSidebar'
import type { Profile } from '@/types'

export default async function RentalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  const esAdmin = ['admin', 'productor'].includes(profile?.rol ?? '')

  return (
    <div className="flex min-h-screen bg-ch-dark">
      <RentalSidebar
        nombre={profile?.nombre}
        rol={profile?.rol}
        esAdmin={esAdmin}
      />
      <main className="flex-1 overflow-auto pt-16 lg:pt-0">
        {children}
      </main>
    </div>
  )
}
