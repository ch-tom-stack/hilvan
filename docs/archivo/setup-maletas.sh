#!/bin/bash

echo "🌿 Configurando módulo Maletas + QR..."

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

export interface MaletaItem {
  id: string
  maleta_id: string
  equipo_id: string
  cantidad: number
  notas: string | null
  equipo?: Equipo
}

export interface MaletaNota {
  id: string
  maleta_id: string
  autor_id: string | null
  autor_nombre: string | null
  contenido: string
  created_at: string
}

export interface Maleta {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  foto_empaque: string | null
  activa: boolean
  created_at: string
  updated_at: string
  items?: MaletaItem[]
  notas?: MaletaNota[]
}
EOF
echo "✓ types/index.ts"

# ── app/actions/maletas.ts ───────────────────
cat > app/actions/maletas.ts << 'EOF'
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function crearMaleta(formData: FormData) {
  const supabase = await createClient()

  const data = {
    codigo:       formData.get('codigo') as string,
    nombre:       formData.get('nombre') as string,
    descripcion:  formData.get('descripcion') as string || null,
    foto_empaque: formData.get('foto_empaque') as string || null,
  }

  const { data: maleta, error } = await supabase
    .from('maletas')
    .insert(data)
    .select()
    .single()

  if (error) return { error: error.message }

  // Insertar ítems
  const itemsRaw = formData.get('items') as string
  if (itemsRaw) {
    const items = JSON.parse(itemsRaw)
    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('maleta_items')
        .insert(items.map((item: { equipo_id: string; cantidad: number; notas: string }) => ({
          maleta_id: maleta.id,
          equipo_id: item.equipo_id,
          cantidad:  item.cantidad,
          notas:     item.notas || null,
        })))
      if (itemsError) return { error: itemsError.message }
    }
  }

  revalidatePath('/equipos/maletas')
  return { success: true, id: maleta.id }
}

export async function actualizarMaleta(id: string, formData: FormData) {
  const supabase = await createClient()

  const data = {
    nombre:       formData.get('nombre') as string,
    descripcion:  formData.get('descripcion') as string || null,
    foto_empaque: formData.get('foto_empaque') as string || null,
  }

  const { error } = await supabase.from('maletas').update(data).eq('id', id)
  if (error) return { error: error.message }

  // Reemplazar ítems
  await supabase.from('maleta_items').delete().eq('maleta_id', id)
  const itemsRaw = formData.get('items') as string
  if (itemsRaw) {
    const items = JSON.parse(itemsRaw)
    if (items.length > 0) {
      await supabase.from('maleta_items').insert(
        items.map((item: { equipo_id: string; cantidad: number; notas: string }) => ({
          maleta_id: id,
          equipo_id: item.equipo_id,
          cantidad:  item.cantidad,
          notas:     item.notas || null,
        }))
      )
    }
  }

  revalidatePath('/equipos/maletas')
  return { success: true }
}

export async function agregarNota(maletaId: string, contenido: string, autorNombre: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('maleta_notas').insert({
    maleta_id:    maletaId,
    autor_id:     user?.id || null,
    autor_nombre: autorNombre,
    contenido,
  })

  if (error) return { error: error.message }
  revalidatePath(`/m/${maletaId}`)
  return { success: true }
}

export async function getMaletas() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('maletas')
    .select('*, items:maleta_items(*, equipo:equipos(*))')
    .order('codigo')
  return data || []
}

export async function getMaleta(codigo: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('maletas')
    .select('*, items:maleta_items(*, equipo:equipos(*)), notas:maleta_notas(*)')
    .eq('codigo', codigo)
    .single()
  return data
}
EOF
echo "✓ app/actions/maletas.ts"

# ── lib/supabase/storage-maletas.ts ─────────
cat > lib/supabase/storage-maletas.ts << 'EOF'
import { createClient } from './client'

export async function subirFotoMaleta(file: File, maletaId: string): Promise<string | null> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const path = `${maletaId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('maletas')
    .upload(path, file, { upsert: false })

  if (error) return null

  const { data } = supabase.storage.from('maletas').getPublicUrl(path)
  return data.publicUrl
}
EOF
echo "✓ lib/supabase/storage-maletas.ts"

# ── components/maletas/GeneradorQR.tsx ───────
mkdir -p components/maletas
cat > components/maletas/GeneradorQR.tsx << 'EOF'
'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

interface Props {
  codigo: string
  nombre: string
}

export default function GeneradorQR({ codigo, nombre }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [listo, setListo] = useState(false)

  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/m/${codigo}`

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, url, {
      width: 240,
      margin: 2,
      color: { dark: '#111110', light: '#f5f0e8' },
    }, () => setListo(true))
  }, [url])

  function descargar() {
    if (!canvasRef.current) return
    const link = document.createElement('a')
    link.download = `QR-${codigo}.png`
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  function imprimir() {
    if (!canvasRef.current) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>QR ${codigo}</title>
      <style>
        body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; background: white; }
        img { width: 240px; height: 240px; }
        p { margin: 8px 0 4px; font-size: 14px; font-weight: 600; }
        small { font-size: 11px; color: #666; }
      </style></head>
      <body>
        <img src="${dataUrl}" />
        <p>${nombre}</p>
        <small>${codigo}</small>
      </body></html>
    `)
    win.document.close()
    win.print()
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="bg-ch-cream p-4">
        <canvas ref={canvasRef} />
      </div>
      <p className="text-ch-muted font-body text-xs text-center break-all max-w-[240px]">{url}</p>
      {listo && (
        <div className="flex gap-3">
          <button
            onClick={descargar}
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors"
          >
            Descargar
          </button>
          <button
            onClick={imprimir}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors"
          >
            Imprimir
          </button>
        </div>
      )}
    </div>
  )
}
EOF
echo "✓ components/maletas/GeneradorQR.tsx"

# ── components/maletas/FormularioMaleta.tsx ──
cat > components/maletas/FormularioMaleta.tsx << 'EOF'
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { subirFotoMaleta } from '@/lib/supabase/storage-maletas'
import { crearMaleta, actualizarMaleta } from '@/app/actions/maletas'
import type { Maleta, Equipo } from '@/types'

interface ItemForm {
  equipo_id: string
  cantidad: number
  notas: string
}

interface Props {
  equipos: Equipo[]
  maleta?: Maleta
}

export default function FormularioMaleta({ equipos, maleta }: Props) {
  const router = useRouter()
  const esEdicion = !!maleta

  const [nombre, setNombre]           = useState(maleta?.nombre || '')
  const [codigo, setCodigo]           = useState(maleta?.codigo || '')
  const [descripcion, setDescripcion] = useState(maleta?.descripcion || '')
  const [fotoEmpaque, setFotoEmpaque] = useState(maleta?.foto_empaque || '')
  const [items, setItems]             = useState<ItemForm[]>(
    maleta?.items?.map(i => ({
      equipo_id: i.equipo_id,
      cantidad:  i.cantidad,
      notas:     i.notas || '',
    })) || []
  )
  const [subiendo, setSubiendo]   = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    const tempId = maleta?.id || `temp-${Date.now()}`
    const url = await subirFotoMaleta(file, tempId)
    if (url) setFotoEmpaque(url)
    setSubiendo(false)
  }

  function agregarItem() {
    if (equipos.length === 0) return
    setItems(prev => [...prev, { equipo_id: equipos[0].id, cantidad: 1, notas: '' }])
  }

  function actualizarItem(i: number, campo: keyof ItemForm, valor: string | number) {
    setItems(prev => prev.map((item, idx) =>
      idx === i ? { ...item, [campo]: valor } : item
    ))
  }

  function eliminarItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    const formData = new FormData()
    formData.set('codigo',       codigo)
    formData.set('nombre',       nombre)
    formData.set('descripcion',  descripcion)
    formData.set('foto_empaque', fotoEmpaque)
    formData.set('items',        JSON.stringify(items))

    const result = esEdicion
      ? await actualizarMaleta(maleta.id, formData)
      : await crearMaleta(formData)

    if (result.error) {
      setError(result.error)
      setGuardando(false)
      return
    }

    router.push('/equipos/maletas')
    router.refresh()
  }

  const labelClass = "block text-ch-muted text-[10px] font-body tracking-[0.35em] uppercase mb-2"
  const inputClass = "w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-border focus:outline-none focus:border-ch-green transition-colors duration-200"

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelClass}>Nombre de la maleta</label>
          <input
            type="text" required value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Maleta Sony G Master"
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Código</label>
          <input
            type="text" required value={codigo}
            onChange={e => setCodigo(e.target.value)}
            placeholder="Ej: CH-KIT-001"
            className={inputClass}
            readOnly={esEdicion}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Descripción</label>
        <textarea
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Contenido general, uso, notas de empaque..."
          rows={3}
          className={inputClass + ' resize-none'}
        />
      </div>

      {/* Foto de empaque */}
      <div>
        <label className={labelClass}>Foto de empaque</label>
        {fotoEmpaque && (
          <div className="mb-3 relative group w-48">
            <img src={fotoEmpaque} alt="" className="w-full object-cover" />
            <button
              type="button"
              onClick={() => setFotoEmpaque('')}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-body text-xs tracking-widest"
            >
              QUITAR
            </button>
          </div>
        )}
        <label
          className="flex items-center gap-3 px-4 py-3 border border-dashed border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-green transition-colors cursor-pointer"
          style={{ opacity: subiendo ? 0.5 : 1 }}
        >
          <span className="font-body text-sm">{subiendo ? 'Subiendo...' : fotoEmpaque ? 'Cambiar foto' : '+ Agregar foto de empaque'}</span>
          <input type="file" accept="image/*" onChange={handleFoto} className="hidden" disabled={subiendo} />
        </label>
      </div>

      {/* Ítems */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className={labelClass + ' mb-0'}>Contenido</label>
          <button
            type="button"
            onClick={agregarItem}
            className="text-ch-green hover:text-ch-green-light font-body text-xs transition-colors"
          >
            + Agregar ítem
          </button>
        </div>

        {items.length === 0 ? (
          <div className="border border-dashed border-ch-border p-6 text-center">
            <p className="text-ch-muted font-body text-sm">Sin ítems aún.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => {
              const equipo = equipos.find(e => e.id === item.equipo_id)
              return (
                <div key={i} className="border border-ch-border bg-ch-surface/30 p-4 grid grid-cols-12 gap-3 items-start">
                  <div className="col-span-5">
                    <select
                      value={item.equipo_id}
                      onChange={e => actualizarItem(i, 'equipo_id', e.target.value)}
                      className={inputClass + ' py-2 text-xs'}
                    >
                      {equipos.map(eq => (
                        <option key={eq.id} value={eq.id}>{eq.nombre} ({eq.codigo})</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number" min={1} value={item.cantidad}
                      onChange={e => actualizarItem(i, 'cantidad', parseInt(e.target.value) || 1)}
                      className={inputClass + ' py-2 text-xs text-center'}
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="text" value={item.notas}
                      onChange={e => actualizarItem(i, 'notas', e.target.value)}
                      placeholder="Nota opcional"
                      className={inputClass + ' py-2 text-xs'}
                    />
                  </div>
                  <div className="col-span-1 flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => eliminarItem(i)}
                      className="text-ch-muted hover:text-red-400 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="border border-red-900/50 bg-red-950/40 px-4 py-3">
          <p className="text-red-400 text-xs font-body">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit" disabled={guardando}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-8 py-4 transition-colors disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear maleta'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/equipos/maletas')}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-8 py-4 transition-colors"
        >
          Cancelar
        </button>
      </div>

    </form>
  )
}
EOF
echo "✓ components/maletas/FormularioMaleta.tsx"

# ── app/(dashboard)/equipos/maletas/page.tsx ─
mkdir -p "app/(dashboard)/equipos/maletas"
cat > "app/(dashboard)/equipos/maletas/page.tsx" << 'EOF'
import { getMaletas } from '@/app/actions/maletas'
import Link from 'next/link'
import type { Maleta } from '@/types'

export default async function MaletasPage() {
  const maletas = await getMaletas() as Maleta[]

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Equipos · Maletas
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Maletas
          </h1>
        </div>
        <div className="flex gap-3">
          <Link
            href="/equipos"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors"
          >
            ← Equipos
          </Link>
          <Link
            href="/equipos/maletas/nueva"
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors"
          >
            + Nueva maleta
          </Link>
        </div>
      </div>

      {maletas.length === 0 ? (
        <div className="border border-dashed border-ch-border p-16 text-center">
          <p className="text-ch-muted font-body text-sm">No hay maletas registradas aún.</p>
          <Link href="/equipos/maletas/nueva" className="text-ch-green font-body text-sm mt-2 inline-block hover:text-ch-green-light">
            Crear la primera →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {maletas.map(maleta => (
            <div key={maleta.id} className="border border-ch-border bg-ch-surface/30 overflow-hidden">
              {maleta.foto_empaque ? (
                <img src={maleta.foto_empaque} alt="" className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-ch-surface flex items-center justify-center">
                  <span className="text-ch-border font-body text-xs tracking-widest">SIN FOTO</span>
                </div>
              )}
              <div className="p-5">
                <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-1">{maleta.codigo}</p>
                <h3 className="font-display italic text-xl text-ch-cream mb-2">{maleta.nombre}</h3>
                <p className="text-ch-muted font-body text-xs mb-4">
                  {maleta.items?.length || 0} ítems
                </p>
                <div className="flex gap-2">
                  <Link
                    href={`/m/${maleta.codigo}`}
                    target="_blank"
                    className="flex-1 text-center border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-widest uppercase py-2 transition-colors"
                  >
                    Ver QR
                  </Link>
                  <Link
                    href={`/equipos/maletas/${maleta.id}/editar`}
                    className="flex-1 text-center border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-widest uppercase py-2 transition-colors"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
EOF
echo "✓ app/(dashboard)/equipos/maletas/page.tsx"

# ── app/(dashboard)/equipos/maletas/nueva/page.tsx ──
mkdir -p "app/(dashboard)/equipos/maletas/nueva"
cat > "app/(dashboard)/equipos/maletas/nueva/page.tsx" << 'EOF'
import { createClient } from '@/lib/supabase/server'
import FormularioMaleta from '@/components/maletas/FormularioMaleta'
import type { Equipo } from '@/types'

export default async function NuevaMaletaPage() {
  const supabase = await createClient()
  const { data: equipos } = await supabase
    .from('equipos')
    .select('*')
    .order('nombre')

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
          Maletas · Nueva
        </p>
        <h1 className="font-display italic text-5xl text-ch-cream leading-none">
          Nueva maleta
        </h1>
      </div>
      <FormularioMaleta equipos={equipos as Equipo[] || []} />
    </div>
  )
}
EOF
echo "✓ app/(dashboard)/equipos/maletas/nueva/page.tsx"

# ── app/(dashboard)/equipos/maletas/[id]/editar/page.tsx ──
mkdir -p "app/(dashboard)/equipos/maletas/[id]/editar"
cat > "app/(dashboard)/equipos/maletas/[id]/editar/page.tsx" << 'EOF'
import { createClient } from '@/lib/supabase/server'
import FormularioMaleta from '@/components/maletas/FormularioMaleta'
import GeneradorQR from '@/components/maletas/GeneradorQR'
import { notFound } from 'next/navigation'
import type { Equipo, Maleta } from '@/types'

export default async function EditarMaletaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: maleta } = await supabase
    .from('maletas')
    .select('*, items:maleta_items(*)')
    .eq('id', id)
    .single<Maleta>()

  if (!maleta) notFound()

  const { data: equipos } = await supabase
    .from('equipos')
    .select('*')
    .order('nombre')

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
          Maletas · Editar
        </p>
        <h1 className="font-display italic text-5xl text-ch-cream leading-none">{maleta.nombre}</h1>
        <p className="text-ch-muted font-body text-sm mt-1 font-mono">{maleta.codigo}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
          <FormularioMaleta equipos={equipos as Equipo[] || []} maleta={maleta} />
        </div>
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-6">Código QR</p>
          <GeneradorQR codigo={maleta.codigo} nombre={maleta.nombre} />
        </div>
      </div>
    </div>
  )
}
EOF
echo "✓ app/(dashboard)/equipos/maletas/[id]/editar/page.tsx"

# ── app/m/[codigo]/page.tsx (página pública QR) ──
mkdir -p "app/m/[codigo]"
cat > "app/m/[codigo]/page.tsx" << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Maleta } from '@/types'
import NotasMaleta from '@/components/maletas/NotasMaleta'

export default async function MaletaPublicaPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const supabase = await createClient()

  const { data: maleta } = await supabase
    .from('maletas')
    .select('*, items:maleta_items(*, equipo:equipos(*)), notas:maleta_notas(*)')
    .eq('codigo', codigo)
    .eq('activa', true)
    .single<Maleta>()

  if (!maleta) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  // Ordenar notas por fecha descendente
  const notas = [...(maleta.notas || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div className="min-h-screen bg-ch-black text-ch-cream">
      <div className="max-w-lg mx-auto px-5 py-8">

        {/* Header */}
        <div className="mb-8">
          <p className="text-ch-muted font-body text-[9px] tracking-[0.5em] uppercase mb-1">Casa Hiedra</p>
          <h1 className="font-display italic text-4xl text-ch-cream leading-tight">{maleta.nombre}</h1>
          <p className="text-ch-muted font-body text-xs font-mono mt-1">{maleta.codigo}</p>
        </div>

        {/* Foto de empaque */}
        {maleta.foto_empaque && (
          <div className="mb-8">
            <img src={maleta.foto_empaque} alt="Foto de empaque" className="w-full object-cover" />
            {maleta.descripcion && (
              <p className="text-ch-muted font-body text-sm mt-3 leading-relaxed">{maleta.descripcion}</p>
            )}
          </div>
        )}

        {/* Contenido */}
        <div className="mb-8">
          <p className="text-ch-muted font-body text-[10px] tracking-[0.4em] uppercase mb-4">
            Contenido — {maleta.items?.length || 0} ítems
          </p>
          <div className="space-y-0 border border-ch-border">
            {maleta.items?.map((item, i) => (
              <div
                key={item.id}
                className={`flex items-start gap-4 px-5 py-4 ${
                  i < (maleta.items?.length || 0) - 1 ? 'border-b border-ch-border/50' : ''
                }`}
              >
                {item.equipo?.fotos?.[0] && (
                  <img src={item.equipo.fotos[0]} alt="" className="w-10 h-10 object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm text-ch-cream">{item.equipo?.nombre}</p>
                  <p className="font-body text-[10px] text-ch-muted font-mono">{item.equipo?.codigo}</p>
                  {item.notas && (
                    <p className="font-body text-xs text-ch-muted mt-1 italic">{item.notas}</p>
                  )}
                </div>
                <span className="font-body text-xs text-ch-muted flex-shrink-0">×{item.cantidad}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notas */}
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.4em] uppercase mb-4">
            Notas del equipo
          </p>
          <NotasMaleta
            maletaId={maleta.id}
            notas={notas}
            usuarioLogueado={!!user}
            nombreUsuario={user?.email?.split('@')[0] || ''}
          />
        </div>

      </div>
    </div>
  )
}
EOF
echo "✓ app/m/[codigo]/page.tsx"

# ── components/maletas/NotasMaleta.tsx ───────
cat > components/maletas/NotasMaleta.tsx << 'EOF'
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { agregarNota } from '@/app/actions/maletas'
import type { MaletaNota } from '@/types'

interface Props {
  maletaId: string
  notas: MaletaNota[]
  usuarioLogueado: boolean
  nombreUsuario: string
}

export default function NotasMaleta({ maletaId, notas, usuarioLogueado, nombreUsuario }: Props) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)

  function formatFecha(iso: string) {
    return new Date(iso).toLocaleDateString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  async function handleEnviar() {
    if (!texto.trim()) return
    setGuardando(true)
    await agregarNota(maletaId, texto.trim(), nombreUsuario)
    setTexto('')
    setGuardando(false)
    router.refresh()
  }

  return (
    <div>
      {notas.length === 0 ? (
        <p className="text-ch-muted font-body text-sm italic mb-4">Sin notas aún.</p>
      ) : (
        <div className="space-y-3 mb-5">
          {notas.map(nota => (
            <div key={nota.id} className="border border-ch-border bg-ch-surface/30 px-4 py-3">
              <p className="font-body text-sm text-ch-cream leading-relaxed">{nota.contenido}</p>
              <p className="font-body text-[10px] text-ch-muted mt-2">
                {nota.autor_nombre || 'Anónimo'} · {formatFecha(nota.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}

      {usuarioLogueado ? (
        <div>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder='Ej: "Batería NP-3 mala"'
            rows={3}
            className="w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-border focus:outline-none focus:border-ch-green transition-colors resize-none mb-3"
          />
          <button
            onClick={handleEnviar}
            disabled={guardando || !texto.trim()}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Dejar nota'}
          </button>
        </div>
      ) : (
        <p className="text-ch-muted font-body text-xs italic">
          Inicia sesión en Hilván para dejar notas.
        </p>
      )}
    </div>
  )
}
EOF
echo "✓ components/maletas/NotasMaleta.tsx"

# ── Actualizar proxy.ts para ruta pública /m/* ──
cat > proxy.ts << 'EOF'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Rutas públicas — no requieren autenticación
  if (pathname.startsWith('/login') || pathname.startsWith('/m/')) {
    if (user && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // Rutas protegidas
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
EOF
echo "✓ proxy.ts"

# ── Agregar enlace a Maletas en página de Equipos ──
echo ""
echo "✅ Módulo Maletas + QR configurado."
echo "   Recuerda agregar el enlace a Maletas en la página de Equipos."
echo "   Ejecuta: npm run dev"
