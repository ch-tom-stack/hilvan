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

export type EstadoEquipo = 'disponible' | 'en_uso' | 'en_mantenimiento' | 'pendiente_compra'

export interface CategoriaEquipo {
  id: string
  codigo: string
  nombre: string
  activa: boolean
  orden: number
  created_at: string
}

export interface Equipo {
  id: string
  codigo: string
  nombre: string
  categoria_codigo: string
  descripcion: string | null
  notas: string | null
  cantidad: number
  rentable: boolean
  estado: EstadoEquipo
  precio_jornada: number | null
  fotos: string[]
  created_at: string
  updated_at: string
  categoria?: CategoriaEquipo
}
