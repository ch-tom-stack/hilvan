#!/bin/bash

# ============================================
# Hilván — Setup Chat 1: Equipos
# ============================================

echo "🌿 Configurando módulo Equipos..."

# ── types/index.ts (actualizado) ────────────
cat > types/index.ts << 'EOF'
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
EOF
echo "✓ types/index.ts"

# ── lib/supabase/storage.ts ──────────────────
cat > lib/supabase/storage.ts << 'EOF'
import { createClient } from './client'

export async function subirFotoEquipo(
  file: File,
  equipoId: string
): Promise<string | null> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const path = `${equipoId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('equipos')
    .upload(path, file, { upsert: false })

  if (error) {
    console.error('Error subiendo foto:', error)
    return null
  }

  const { data } = supabase.storage.from('equipos').getPublicUrl(path)
  return data.publicUrl
}

export async function eliminarFotoEquipo(url: string): Promise<boolean> {
  const supabase = createClient()
  const path = url.split('/equipos/')[1]
  if (!path) return false

  const { error } = await supabase.storage.from('equipos').remove([path])
  return !error
}
EOF
echo "✓ lib/supabase/storage.ts"

# ── app/actions/equipos.ts ───────────────────
cat > app/actions/equipos.ts << 'EOF'
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function crearEquipo(formData: FormData) {
  const supabase = await createClient()

  const data = {
    codigo:          formData.get('codigo') as string,
    nombre:          formData.get('nombre') as string,
    categoria_codigo: formData.get('categoria_codigo') as string,
    descripcion:     formData.get('descripcion') as string || null,
    notas:           formData.get('notas') as string || null,
    cantidad:        parseInt(formData.get('cantidad') as string) || 1,
    rentable:        formData.get('rentable') === 'true',
    estado:          formData.get('estado') as string || 'disponible',
    precio_jornada:  formData.get('precio_jornada')
                       ? parseInt(formData.get('precio_jornada') as string)
                       : null,
    fotos:           JSON.parse(formData.get('fotos') as string || '[]'),
  }

  const { error } = await supabase.from('equipos').insert(data)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/equipos')
  return { success: true }
}

export async function actualizarEquipo(id: string, formData: FormData) {
  const supabase = await createClient()

  const data = {
    nombre:          formData.get('nombre') as string,
    categoria_codigo: formData.get('categoria_codigo') as string,
    descripcion:     formData.get('descripcion') as string || null,
    notas:           formData.get('notas') as string || null,
    cantidad:        parseInt(formData.get('cantidad') as string) || 1,
    rentable:        formData.get('rentable') === 'true',
    estado:          formData.get('estado') as string,
    precio_jornada:  formData.get('precio_jornada')
                       ? parseInt(formData.get('precio_jornada') as string)
                       : null,
    fotos:           JSON.parse(formData.get('fotos') as string || '[]'),
  }

  const { error } = await supabase.from('equipos').update(data).eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/equipos')
  return { success: true }
}

export async function eliminarEquipo(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('equipos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/equipos')
  return { success: true }
}

export async function getCategorias() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorias_equipo')
    .select('*')
    .eq('activa', true)
    .order('orden')
  if (error) return []
  return data
}

export async function getSiguienteCodigo(categoriaCodigo: string): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('equipos')
    .select('codigo')
    .like('codigo', `CH-${categoriaCodigo}-%`)
    .order('codigo', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) {
    return `CH-${categoriaCodigo}-001`
  }

  const ultimo = data[0].codigo
  const num = parseInt(ultimo.split('-').pop() || '0') + 1
  return `CH-${categoriaCodigo}-${String(num).padStart(3, '0')}`
}
EOF
echo "✓ app/actions/equipos.ts"

# ── components/equipos/FormularioEquipo.tsx ──
mkdir -p components/equipos
cat > components/equipos/FormularioEquipo.tsx << 'EOF'
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { subirFotoEquipo } from '@/lib/supabase/storage'
import { crearEquipo, actualizarEquipo, getSiguienteCodigo } from '@/app/actions/equipos'
import type { Equipo, CategoriaEquipo, EstadoEquipo } from '@/types'

interface Props {
  categorias: CategoriaEquipo[]
  equipo?: Equipo
}

const ESTADOS: { value: EstadoEquipo; label: string }[] = [
  { value: 'disponible',          label: 'Disponible' },
  { value: 'en_uso',              label: 'En uso' },
  { value: 'en_mantenimiento',    label: 'En mantenimiento' },
  { value: 'pendiente_compra',    label: 'Pendiente de compra' },
]

export default function FormularioEquipo({ categorias, equipo }: Props) {
  const router = useRouter()
  const esEdicion = !!equipo

  const [nombre, setNombre]               = useState(equipo?.nombre || '')
  const [categoria, setCategoria]         = useState(equipo?.categoria_codigo || categorias[0]?.codigo || '')
  const [codigo, setCodigo]               = useState(equipo?.codigo || '')
  const [descripcion, setDescripcion]     = useState(equipo?.descripcion || '')
  const [notas, setNotas]                 = useState(equipo?.notas || '')
  const [cantidad, setCantidad]           = useState(equipo?.cantidad || 1)
  const [rentable, setRentable]           = useState(equipo?.rentable ?? true)
  const [estado, setEstado]               = useState<EstadoEquipo>(equipo?.estado || 'disponible')
  const [precioJornada, setPrecioJornada] = useState(equipo?.precio_jornada?.toString() || '')
  const [fotos, setFotos]                 = useState<string[]>(equipo?.fotos || [])
  const [subiendo, setSubiendo]           = useState(false)
  const [guardando, setGuardando]         = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [codigoAuto, setCodigoAuto]       = useState(!esEdicion)

  async function handleCategoriaChange(nuevaCategoria: string) {
    setCategoria(nuevaCategoria)
    if (codigoAuto) {
      const siguiente = await getSiguienteCodigo(nuevaCategoria)
      setCodigo(siguiente)
    }
  }

  async function handleSubirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setSubiendo(true)
    const tempId = equipo?.id || `temp-${Date.now()}`
    const urls: string[] = []

    for (const file of files) {
      const url = await subirFotoEquipo(file, tempId)
      if (url) urls.push(url)
    }

    setFotos(prev => [...prev, ...urls])
    setSubiendo(false)
  }

  function eliminarFoto(url: string) {
    setFotos(prev => prev.filter(f => f !== url))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    const formData = new FormData()
    formData.set('codigo',          codigo)
    formData.set('nombre',          nombre)
    formData.set('categoria_codigo', categoria)
    formData.set('descripcion',     descripcion)
    formData.set('notas',           notas)
    formData.set('cantidad',        cantidad.toString())
    formData.set('rentable',        rentable.toString())
    formData.set('estado',          estado)
    formData.set('precio_jornada',  precioJornada)
    formData.set('fotos',           JSON.stringify(fotos))

    const result = esEdicion
      ? await actualizarEquipo(equipo.id, formData)
      : await crearEquipo(formData)

    if (result.error) {
      setError(result.error)
      setGuardando(false)
      return
    }

    router.push('/equipos')
    router.refresh()
  }

  const labelClass = "block text-ch-muted text-[10px] font-body tracking-[0.35em] uppercase mb-2"
  const inputClass = "w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-border focus:outline-none focus:border-ch-green transition-colors duration-200"
  const selectClass = inputClass

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">

      {/* Nombre y código */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelClass}>Nombre del equipo</label>
          <input
            type="text" required value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Sony A7S III"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Categoría</label>
          <select
            value={categoria}
            onChange={e => handleCategoriaChange(e.target.value)}
            className={selectClass}
          >
            {categorias.map(cat => (
              <option key={cat.codigo} value={cat.codigo}>{cat.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>
            Código
            {codigoAuto && !esEdicion && (
              <span className="ml-2 text-ch-green normal-case tracking-normal">automático</span>
            )}
          </label>
          <input
            type="text" required value={codigo}
            onChange={e => { setCodigo(e.target.value); setCodigoAuto(false) }}
            placeholder="CH-CAM-001"
            className={inputClass}
            readOnly={esEdicion}
          />
        </div>
      </div>

      {/* Descripción */}
      <div>
        <label className={labelClass}>Descripción</label>
        <textarea
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Características, incluye, etc."
          rows={3}
          className={inputClass + ' resize-none'}
        />
      </div>

      {/* Notas internas */}
      <div>
        <label className={labelClass}>Notas internas</label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Notas de uso, estado, pendientes..."
          rows={2}
          className={inputClass + ' resize-none'}
        />
      </div>

      {/* Cantidad, estado, rentable */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Cantidad</label>
          <input
            type="number" min={1} value={cantidad}
            onChange={e => setCantidad(parseInt(e.target.value) || 1)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Estado</label>
          <select
            value={estado}
            onChange={e => setEstado(e.target.value as EstadoEquipo)}
            className={selectClass}
          >
            {ESTADOS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Precio jornada (CLP)</label>
          <input
            type="number" min={0} value={precioJornada}
            onChange={e => setPrecioJornada(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </div>
      </div>

      {/* Rentable toggle */}
      <div className="flex items-center gap-4 py-2">
        <button
          type="button"
          onClick={() => setRentable(!rentable)}
          className={`w-11 h-6 rounded-full transition-colors duration-200 relative flex-shrink-0 ${
            rentable ? 'bg-ch-green' : 'bg-ch-border'
          }`}
        >
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
            rentable ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        <div>
          <p className="text-ch-cream font-body text-sm">Disponible para rental</p>
          <p className="text-ch-muted font-body text-xs">Aparece en el catálogo de clientes</p>
        </div>
      </div>

      {/* Fotos */}
      <div>
        <label className={labelClass}>Fotos</label>

        {fotos.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-3">
            {fotos.map((url, i) => (
              <div key={i} className="relative group aspect-square">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => eliminarFoto(url)}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100
                             transition-opacity flex items-center justify-center
                             text-white font-body text-xs tracking-widest"
                >
                  QUITAR
                </button>
              </div>
            ))}
          </div>
        )}

        <label className={`flex items-center gap-3 px-4 py-3 border border-dashed border-ch-border
                          text-ch-muted hover:text-ch-cream hover:border-ch-green
                          transition-colors cursor-pointer ${subiendo ? 'opacity-50 cursor-wait' : ''}`}>
          <span className="font-body text-sm">
            {subiendo ? 'Subiendo...' : '+ Agregar fotos'}
          </span>
          <input
            type="file" accept="image/*" multiple
            onChange={handleSubirFotos}
            className="hidden"
            disabled={subiendo}
          />
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-900/50 bg-red-950/40 px-4 py-3">
          <p className="text-red-400 text-xs font-body">{error}</p>
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={guardando}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium
                     text-[10px] tracking-[0.35em] uppercase px-8 py-4
                     transition-colors duration-200 disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Agregar equipo'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/equipos')}
          className="border border-ch-border text-ch-muted hover:text-ch-cream
                     font-body text-[10px] tracking-[0.35em] uppercase px-8 py-4
                     transition-colors duration-200"
        >
          Cancelar
        </button>
      </div>

    </form>
  )
}
EOF
echo "✓ components/equipos/FormularioEquipo.tsx"

# ── components/equipos/TagEstado.tsx ────────
cat > components/equipos/TagEstado.tsx << 'EOF'
import type { EstadoEquipo } from '@/types'

const config: Record<EstadoEquipo, { label: string; color: string }> = {
  disponible:       { label: 'Disponible',      color: 'text-ch-green  bg-ch-green/10  border-ch-green/30'  },
  en_uso:           { label: 'En uso',           color: 'text-ch-gold   bg-ch-gold/10   border-ch-gold/30'   },
  en_mantenimiento: { label: 'Mantenimiento',    color: 'text-orange-400 bg-orange-400/10 border-orange-400/30' },
  pendiente_compra: { label: 'Pend. compra',     color: 'text-ch-muted  bg-ch-surface   border-ch-border'   },
}

export default function TagEstado({ estado }: { estado: EstadoEquipo }) {
  const { label, color } = config[estado]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 border font-body text-[10px] tracking-wider ${color}`}>
      {label}
    </span>
  )
}
EOF
echo "✓ components/equipos/TagEstado.tsx"

# ── app/(dashboard)/equipos/page.tsx ────────
mkdir -p "app/(dashboard)/equipos"
cat > "app/(dashboard)/equipos/page.tsx" << 'EOF'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TagEstado from '@/components/equipos/TagEstado'
import type { Equipo, CategoriaEquipo } from '@/types'

export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>
}) {
  const { categoria, q } = await searchParams
  const supabase = await createClient()

  const { data: categorias } = await supabase
    .from('categorias_equipo')
    .select('*')
    .eq('activa', true)
    .order('orden')

  let query = supabase
    .from('equipos')
    .select('*, categoria:categorias_equipo(*)')
    .order('codigo')

  if (categoria) query = query.eq('categoria_codigo', categoria)
  if (q) query = query.ilike('nombre', `%${q}%`)

  const { data: equipos } = await query

  return (
    <div className="p-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
            Módulo CH-1
          </p>
          <h1 className="font-display italic text-5xl text-ch-cream leading-none">
            Equipos
          </h1>
        </div>
        <Link
          href="/equipos/nuevo"
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body
                     font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3
                     transition-colors duration-200"
        >
          + Agregar equipo
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Link
          href="/equipos"
          className={`px-4 py-2 font-body text-xs border transition-colors ${
            !categoria
              ? 'border-ch-green text-ch-cream bg-ch-surface'
              : 'border-ch-border text-ch-muted hover:text-ch-cream'
          }`}
        >
          Todos
        </Link>
        {(categorias as CategoriaEquipo[])?.map(cat => (
          <Link
            key={cat.codigo}
            href={`/equipos?categoria=${cat.codigo}`}
            className={`px-4 py-2 font-body text-xs border transition-colors ${
              categoria === cat.codigo
                ? 'border-ch-green text-ch-cream bg-ch-surface'
                : 'border-ch-border text-ch-muted hover:text-ch-cream'
            }`}
          >
            {cat.nombre}
          </Link>
        ))}
      </div>

      {/* Tabla */}
      {!equipos || equipos.length === 0 ? (
        <div className="border border-dashed border-ch-border p-16 text-center">
          <p className="text-ch-muted font-body text-sm">No hay equipos registrados aún.</p>
          <Link href="/equipos/nuevo" className="text-ch-green font-body text-sm mt-2 inline-block hover:text-ch-green-light">
            Agregar el primero →
          </Link>
        </div>
      ) : (
        <div className="border border-ch-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ch-border bg-ch-surface/50">
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Código</th>
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Nombre</th>
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Categoría</th>
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Cant.</th>
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Estado</th>
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Rental</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(equipos as Equipo[]).map((eq, i) => (
                <tr
                  key={eq.id}
                  className={`border-b border-ch-border/50 hover:bg-ch-surface/30 transition-colors ${
                    i % 2 === 0 ? '' : 'bg-ch-surface/20'
                  }`}
                >
                  <td className="px-5 py-4">
                    <span className="font-body text-xs text-ch-muted font-mono">{eq.codigo}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {eq.fotos?.[0] && (
                        <img src={eq.fotos[0]} alt="" className="w-8 h-8 object-cover flex-shrink-0" />
                      )}
                      <span className="font-body text-sm text-ch-cream">{eq.nombre}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-body text-xs text-ch-muted">{eq.categoria?.nombre}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-body text-xs text-ch-cream">{eq.cantidad}</span>
                  </td>
                  <td className="px-5 py-4">
                    <TagEstado estado={eq.estado} />
                  </td>
                  <td className="px-5 py-4">
                    <span className={`font-body text-[10px] tracking-wider ${eq.rentable ? 'text-ch-green' : 'text-ch-muted'}`}>
                      {eq.rentable ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/equipos/${eq.id}/editar`}
                      className="text-ch-muted hover:text-ch-cream font-body text-xs transition-colors"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
EOF
echo "✓ app/(dashboard)/equipos/page.tsx"

# ── app/(dashboard)/equipos/nuevo/page.tsx ──
mkdir -p "app/(dashboard)/equipos/nuevo"
cat > "app/(dashboard)/equipos/nuevo/page.tsx" << 'EOF'
import { getCategorias, getSiguienteCodigo } from '@/app/actions/equipos'
import FormularioEquipo from '@/components/equipos/FormularioEquipo'

export default async function NuevoEquipoPage() {
  const categorias = await getCategorias()
  return (
    <div className="p-10 max-w-3xl">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
          Equipos · Nuevo
        </p>
        <h1 className="font-display italic text-5xl text-ch-cream leading-none">
          Agregar equipo
        </h1>
      </div>
      <FormularioEquipo categorias={categorias} />
    </div>
  )
}
EOF
echo "✓ app/(dashboard)/equipos/nuevo/page.tsx"

# ── app/(dashboard)/equipos/[id]/editar/page.tsx ──
mkdir -p "app/(dashboard)/equipos/[id]/editar"
cat > "app/(dashboard)/equipos/[id]/editar/page.tsx" << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { getCategorias } from '@/app/actions/equipos'
import FormularioEquipo from '@/components/equipos/FormularioEquipo'
import { notFound } from 'next/navigation'
import type { Equipo } from '@/types'

export default async function EditarEquipoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: equipo } = await supabase
    .from('equipos')
    .select('*')
    .eq('id', id)
    .single<Equipo>()

  if (!equipo) notFound()

  const categorias = await getCategorias()

  return (
    <div className="p-10 max-w-3xl">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
          Equipos · Editar
        </p>
        <h1 className="font-display italic text-5xl text-ch-cream leading-none">
          {equipo.nombre}
        </h1>
        <p className="text-ch-muted font-body text-sm mt-1 font-mono">{equipo.codigo}</p>
      </div>
      <FormularioEquipo categorias={categorias} equipo={equipo} />
    </div>
  )
}
EOF
echo "✓ app/(dashboard)/equipos/[id]/editar/page.tsx"

# ── Actualizar Sidebar para habilitar Equipos ──
sed -i '' 's/{ label: .Equipos.,.*href: .\/equipos.*disponible: false }/{ label: '"'"'Equipos'"'"',      href: '"'"'\/equipos'"'"',      disponible: true  }/' components/layout/Sidebar.tsx 2>/dev/null || true

# Reescribir navItems en Sidebar
cat > /tmp/sidebar_patch.py << 'PYEOF'
import re

with open('components/layout/Sidebar.tsx', 'r') as f:
    content = f.read()

old = """const navItems = [
  { label: 'Dashboard',    href: '/dashboard',   disponible: true  },
  { label: 'Equipos',      href: '/equipos',      disponible: false },"""

new = """const navItems = [
  { label: 'Dashboard',    href: '/dashboard',   disponible: true  },
  { label: 'Equipos',      href: '/equipos',      disponible: true  },"""

content = content.replace(old, new)

with open('components/layout/Sidebar.tsx', 'w') as f:
    f.write(content)

print('Sidebar actualizado')
PYEOF
python3 /tmp/sidebar_patch.py

echo "✓ components/layout/Sidebar.tsx (Equipos habilitado)"

echo ""
echo "✅ Módulo Equipos configurado."
echo "   Ejecuta: npm run dev"
