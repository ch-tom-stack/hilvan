import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import type { Profile } from '@/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  return (
    <div className="flex min-h-screen bg-ch-dark">
      <Sidebar email={user.email} nombre={profile?.nombre} rol={profile?.rol} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
