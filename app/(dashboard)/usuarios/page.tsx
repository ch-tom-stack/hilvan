import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listarUsuarios } from '@/app/actions/usuarios'
import GestorUsuarios from '@/components/usuarios/GestorUsuarios'
import type { Profile } from '@/types'

export const metadata = { title: 'Usuarios — Hilván' }

export default async function UsuariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: self } = await supabase
    .from('profiles')
    .select('rol, id')
    .eq('id', user!.id)
    .single<Pick<Profile, 'rol' | 'id'>>()

  if (self?.rol !== 'admin') redirect('/dashboard')

  const usuarios = await listarUsuarios()

  return (
    <div className="p-6 lg:p-10 max-w-4xl">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
          Administración
        </p>
        <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
          Usuarios
        </h1>
      </div>

      <GestorUsuarios usuarios={usuarios} selfId={self!.id} />
    </div>
  )
}
