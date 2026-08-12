import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types'
import PerfilPage from '@/components/perfil/PerfilPage'
import MisionesPerfil from '@/components/misiones/MisionesPerfil'
import RegistroMisiones from '@/components/misiones/RegistroMisiones'

export const metadata = { title: 'Mi perfil — Hilván' }

export default async function MiPerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single<Profile>()

  return (
    <PerfilPage
      profile={profile!}
      email={user!.email!}
      misiones={
        <>
          <MisionesPerfil esAdmin={profile!.rol === 'admin'} />
          <RegistroMisiones />
        </>
      }
    />
  )
}
