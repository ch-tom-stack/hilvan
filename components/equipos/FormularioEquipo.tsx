'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { subirFotoEquipo } from '@/lib/supabase/storage'
import { crearEquipo, actualizarEquipo, getSiguienteCodigo } from '@/app/actions/equipos'
import { toastError } from '@/lib/toast'
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

// Subcategorías disponibles por código de categoría.
// Claves = valor del campo `codigo` en categorias_equipo.
const SUBCATEGORIAS: Record<string, string[]> = {
  ILU:  ['Modificadores de focos', 'Fresneles', 'Tubos y paneles'],
  LUZ:  ['Modificadores de focos', 'Fresneles', 'Tubos y paneles'],
  OPT:  ['Lentes', 'Filtros'],
  ALM:  ['SD', 'SSD', 'CFExpress A', 'CFExpress B'],
  FON:  ['Fondo papel', 'Fondo tela/muslin', 'Fondo vinilo', 'Chroma key'],
}

export default function FormularioEquipo({ categorias, equipo }: Props) {
  const router = useRouter()
  const esEdicion = !!equipo

  const [nombre, setNombre]               = useState(equipo?.nombre || '')
  const [categoria, setCategoria]         = useState(equipo?.categoria_codigo || categorias[0]?.codigo || '')
  const [codigo, setCodigo]               = useState(equipo?.codigo || '')
  const [descripcion, setDescripcion]     = useState(equipo?.descripcion || '')
  const [notas, setNotas]                 = useState(equipo?.notas || '')
  const [marca, setMarca]                 = useState(equipo?.marca || '')
  const [modelo, setModelo]               = useState(equipo?.modelo || '')
  const [numeroSerie, setNumeroSerie]     = useState(equipo?.numero_serie || '')
  const [subcategoria, setSubcategoria]   = useState(equipo?.subcategoria || '')
  const [cantidad, setCantidad]           = useState(equipo?.cantidad || 1)
  const [rentable, setRentable]           = useState(equipo?.rentable ?? true)
  const [estado, setEstado]               = useState<EstadoEquipo>(equipo?.estado || 'disponible')
  const [precioJornada, setPrecioJornada] = useState(equipo?.precio_jornada?.toString() || '')
  const [fotos, setFotos]                 = useState<string[]>(equipo?.fotos || [])
  const [subiendo, setSubiendo]           = useState(false)
  const [guardando, setGuardando]         = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [codigoAuto, setCodigoAuto]       = useState(!esEdicion)

  const opcionesSubcat = SUBCATEGORIAS[categoria] ?? []

  useEffect(() => {
    if (!esEdicion && codigoAuto && categoria) {
      getSiguienteCodigo(categoria).then(setCodigo)
    }
  }, [])

  async function handleCategoriaChange(nuevaCategoria: string) {
    setCategoria(nuevaCategoria)
    setSubcategoria('')
    if (codigoAuto) {
      const siguiente = await getSiguienteCodigo(nuevaCategoria)
      setCodigo(siguiente)
    }
  }

  async function handleSubirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setSubiendo(true)
    try {
      const tempId = equipo?.id || `temp-${Date.now()}`
      const urls: string[] = []
      for (const file of files) {
        const url = await subirFotoEquipo(file, tempId)
        if (url) urls.push(url)
      }
      setFotos(prev => [...prev, ...urls])
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al subir fotos')
    } finally {
      setSubiendo(false)
    }
  }

  function eliminarFoto(url: string) {
    setFotos(prev => prev.filter(f => f !== url))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    const formData = new FormData()
    formData.set('codigo',           codigo)
    formData.set('nombre',           nombre)
    formData.set('categoria_codigo', categoria)
    formData.set('descripcion',      descripcion)
    formData.set('notas',            notas)
    formData.set('marca',            marca)
    formData.set('modelo',           modelo)
    formData.set('numero_serie',     numeroSerie)
    formData.set('subcategoria',     subcategoria)
    formData.set('cantidad',         cantidad.toString())
    formData.set('rentable',         rentable.toString())
    formData.set('estado',           estado)
    formData.set('precio_jornada',   precioJornada)
    formData.set('fotos',            JSON.stringify(fotos))

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
  const inputClass = "w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-subtle focus:outline-none focus:border-ch-green transition-colors duration-200"

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">

      <div>
        <label className={labelClass}>Nombre del equipo</label>
        <input
          type="text" required value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Ej: Sony A7S III"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Categoría</label>
          <select
            value={categoria}
            onChange={e => handleCategoriaChange(e.target.value)}
            className={inputClass}
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
          />
        </div>
      </div>

      {/* Subcategoría — solo si la categoría tiene opciones definidas */}
      {opcionesSubcat.length > 0 && (
        <div>
          <label className={labelClass}>Subcategoría</label>
          <select
            value={subcategoria}
            onChange={e => setSubcategoria(e.target.value)}
            className={inputClass}
          >
            <option value="">— Sin subcategoría —</option>
            {opcionesSubcat.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

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

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Marca</label>
          <input
            type="text" value={marca}
            onChange={e => setMarca(e.target.value)}
            placeholder="Ej: Sony"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Modelo</label>
          <input
            type="text" value={modelo}
            onChange={e => setModelo(e.target.value)}
            placeholder="Ej: A7S III"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>N° de serie</label>
          <input
            type="text" value={numeroSerie}
            onChange={e => setNumeroSerie(e.target.value)}
            placeholder="Opcional"
            className={inputClass}
          />
        </div>
      </div>

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
            className={inputClass}
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

      <div className="flex items-center gap-4 py-2">
        <button
          type="button"
          onClick={() => setRentable(!rentable)}
          style={{
            width: '44px',
            height: '24px',
            borderRadius: '12px',
            backgroundColor: rentable ? '#7a9e7e' : '#2e2e2b',
            position: 'relative',
            flexShrink: 0,
            transition: 'background-color 0.2s',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '4px',
              left: rentable ? '24px' : '4px',
              width: '16px',
              height: '16px',
              background: 'white',
              borderRadius: '50%',
              transition: 'left 0.2s',
            }}
          />
        </button>
        <div>
          <p className="text-ch-cream font-body text-sm">Disponible para rental</p>
          <p className="text-ch-muted font-body text-xs">Aparece en el catálogo de clientes</p>
        </div>
      </div>

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
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-body text-xs tracking-widest"
                >
                  QUITAR
                </button>
              </div>
            ))}
          </div>
        )}
        <label
          className="flex items-center gap-3 px-4 py-3 border border-dashed border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-green transition-colors cursor-pointer"
          style={{ opacity: subiendo ? 0.5 : 1, cursor: subiendo ? 'wait' : 'pointer' }}
        >
          <span className="font-body text-sm">{subiendo ? 'Subiendo...' : '+ Agregar fotos'}</span>
          <input
            type="file" accept="image/*" multiple
            onChange={handleSubirFotos}
            className="hidden"
            disabled={subiendo}
          />
        </label>
      </div>

      {error && (
        <div className="border border-red-900/50 bg-red-950/40 px-4 py-3">
          <p className="text-red-400 text-xs font-body">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={guardando}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-8 py-4 transition-colors duration-200 disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Agregar equipo'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/equipos')}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-8 py-4 transition-colors duration-200"
        >
          Cancelar
        </button>
      </div>

    </form>
  )
}
