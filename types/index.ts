export type Rol = 'admin' | 'productor' | 'colaborador' | 'cliente'

export interface Profile {
  id: string
  email: string
  nombre: string | null
  apellido: string | null
  rol: Rol
  activo: boolean
  created_at: string
  updated_at: string
}
