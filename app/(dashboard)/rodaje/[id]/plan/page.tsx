'use client'

import { use, useEffect, useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import {
  getBloques,
  getLocaciones,
  crearBloque,
  actualizarBloque,
  actualizarVisibilidadBloque,
  dividirBloque,
  eliminarBloque,
  reordenarBloques,
} from '@/app/actions/rodaje-plan'
import {
  RodajeBloque,
  RodajeLocacion,
  TipoBloque,
  calcularInicioBloque,
  calcularDuracionBloque,
  minutosAHora,
} from '@/types'

const TIPO_CONFIG: Record<TipoBloque, { label: string; color: string }> = {
  rodaje:   { label: 'Rodaje',    color: 'bg-zinc-700 text-zinc-200' },
  pausa:    { label: 'Pausa',     color: 'bg-amber-950 text-amber-400' },
  traslado: { label: 'Traslado',  color: 'bg-blue-950 text-blue-400' },
  montaje:  { label: 'Montaje',   color: 'bg-purple-950 text-purple-400' },
  otro:     { label: 'Otro',      color: 'bg-zinc-800 text-zinc-500' },
}

export default function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [bloques, setBloques] = useState<RodajeBloque[]>([])
  const [locaciones, setLocaciones] = useState<RodajeLocacion[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [expandido, setExpandido] = useState<string | null>(null)
  const [visibilidadAbierta, setVisibilidadAbierta] = useState<string | null>(null)

  const recargar = async () => {
    const [b, l] = await Promise.all([getBloques(id), getLocaciones(id)])
    setBloques(b)
    setLocaciones(l)
  }

  useEffect(() => { recargar().finally(() => setLoading(false)) }, [id])

  // Cerrar overlay de visibilidad al hacer click fuera
  useEffect(() => {
    const handler = () => setVisibilidadAbierta(null)
    if (visibilidadAbierta) document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [visibilidadAbierta])

  if (loading) return <div className="p-6 text-zinc-600 text-sm">Cargando...</div>

  // Separar bloques raíz e hijos
  const bloquesRaiz = bloques.filter(b => !b.padre_id).sort((a, b) => a.orden - b.orden)
  const hijos = (padreId: string) => bloques.filter(b => b.padre_id === padreId).sort((a, b) => a.orden - b.orden)

  const duracionTotal = bloquesRaiz.reduce((acc, b) => {
    // No sumar paralelos al total (solo el más largo del grupo)
    if (b.encadenado_a && bloquesRaiz.find(x => x.id === b.encadenado_a)) {
      return acc
    }
    return acc + calcularDuracionBloque(b, bloques)
  }, 0)

  const agregarBloque = (padreId?: string, encadenadoA?: string) => {
    startTransition(async () => {
      await crearBloque(id, {
        titulo: 'Nuevo bloque',
        tipo: 'rodaje',
        padre_id: padreId,
        encadenado_a: encadenadoA,
        duracion_min: 30,
      })
      await recargar()
    })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href={`/rodaje/${id}`} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
        ← Volver al rodaje
      </Link>

      <div className="flex items-center justify-between mt-3 mb-6">
        <div>
          <h1 className="text-lg font-medium text-zinc-100">Plan de rodaje</h1>
          {duracionTotal > 0 && (
            <p className="text-xs text-zinc-600 mt-0.5">
              {Math.floor(duracionTotal / 60)}h {duracionTotal % 60}min estimados
            </p>
          )}
        </div>
        <button
          onClick={() => agregarBloque()}
          disabled={isPending}
          className="text-xs bg-[#E6E2ED] text-zinc-900 font-medium px-3 py-1.5 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50"
        >
          + Bloque
        </button>
      </div>

      {bloques.length === 0 ? (
        <div className="text-center py-16 text-zinc-600 text-sm">
          <p>El plan está vacío.</p>
          <button onClick={() => agregarBloque()} className="text-[#E6E2ED] mt-2 inline-block hover:underline text-sm">
            Agregar primer bloque →
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {bloquesRaiz.map((bloque, idx) => (
            <BloqueItem
              key={bloque.id}
              bloque={bloque}
              hijos={hijos(bloque.id)}
              todosBloques={bloques}
              locaciones={locaciones}
              expandido={expandido}
              setExpandido={setExpandido}
              visibilidadAbierta={visibilidadAbierta}
              setVisibilidadAbierta={setVisibilidadAbierta}
              isPending={isPending}
              rodajeId={id}
              esUltimo={idx === bloquesRaiz.length - 1}
              onGuardar={async (data) => {
                startTransition(async () => {
                  await actualizarBloque(bloque.id, id, data)
                  await recargar()
                })
              }}
              onDividir={async () => {
                startTransition(async () => {
                  await dividirBloque(bloque.id, id)
                  await recargar()
                })
              }}
              onEliminar={async () => {
                if (!confirm(`¿Eliminar "${bloque.titulo}"?`)) return
                startTransition(async () => {
                  await eliminarBloque(bloque.id, id)
                  await recargar()
                })
              }}
              onAgregarHijo={() => agregarBloque(bloque.id)}
              onAgregarEncadenado={() => agregarBloque(undefined, bloque.id)}
              onVisibilidad={async (vis) => {
                startTransition(async () => {
                  await actualizarVisibilidadBloque(bloque.id, id, vis)
                  await recargar()
                })
              }}
              onMoverArriba={idx > 0 ? async () => {
                const nuevo = [...bloquesRaiz]
                ;[nuevo[idx - 1], nuevo[idx]] = [nuevo[idx], nuevo[idx - 1]]
                startTransition(async () => {
                  await reordenarBloques(id, nuevo.map(b => b.id))
                  await recargar()
                })
              } : undefined}
              onMoverAbajo={idx < bloquesRaiz.length - 1 ? async () => {
                const nuevo = [...bloquesRaiz]
                ;[nuevo[idx], nuevo[idx + 1]] = [nuevo[idx + 1], nuevo[idx]]
                startTransition(async () => {
                  await reordenarBloques(id, nuevo.map(b => b.id))
                  await recargar()
                })
              } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Bloque Item ──────────────────────────────────────────────────────────────

function BloqueItem({
  bloque, hijos, todosBloques, locaciones,
  expandido, setExpandido, visibilidadAbierta, setVisibilidadAbierta,
  isPending, rodajeId, esUltimo,
  onGuardar, onDividir, onEliminar, onAgregarHijo, onAgregarEncadenado, onVisibilidad,
  onMoverArriba, onMoverAbajo,
}: {
  bloque: RodajeBloque
  hijos: RodajeBloque[]
  todosBloques: RodajeBloque[]
  locaciones: RodajeLocacion[]
  expandido: string | null
  setExpandido: (id: string | null) => void
  visibilidadAbierta: string | null
  setVisibilidadAbierta: (id: string | null) => void
  isPending: boolean
  rodajeId: string
  esUltimo: boolean
  onGuardar: (data: Partial<RodajeBloque>) => void
  onDividir: () => void
  onEliminar: () => void
  onAgregarHijo: () => void
  onAgregarEncadenado: () => void
  onVisibilidad: (v: { visible_equipo: boolean; visible_catering: boolean; visible_extras: boolean; visible_cliente: boolean }) => void
  onMoverArriba?: () => void
  onMoverAbajo?: () => void
}) {
  const isExpanded = expandido === bloque.id
  const cfg = TIPO_CONFIG[bloque.tipo]
  const inicioMin = calcularInicioBloque(bloque, todosBloques)
  const duracion = calcularDuracionBloque(bloque, todosBloques)
  const esContenedor = hijos.length > 0

  // Form state
  const [form, setForm] = useState<Partial<RodajeBloque>>({
    titulo: bloque.titulo,
    tipo: bloque.tipo,
    locacion_id: bloque.locacion_id,
    descripcion: bloque.descripcion,
    nota_previa: bloque.nota_previa,
    hora_inicio_fija: bloque.hora_inicio_fija,
    duracion_min: bloque.duracion_min,
    encadenado_a: bloque.encadenado_a,
    offset_min: bloque.offset_min,
    visible_equipo: bloque.visible_equipo,
    visible_catering: bloque.visible_catering,
    visible_extras: bloque.visible_extras,
    visible_cliente: bloque.visible_cliente,
  })

  // Sync form cuando bloque cambia desde afuera
  useEffect(() => {
    setForm({
      titulo: bloque.titulo,
      tipo: bloque.tipo,
      locacion_id: bloque.locacion_id,
      descripcion: bloque.descripcion,
      nota_previa: bloque.nota_previa,
      hora_inicio_fija: bloque.hora_inicio_fija,
      duracion_min: bloque.duracion_min,
      encadenado_a: bloque.encadenado_a,
      offset_min: bloque.offset_min,
      visible_equipo: bloque.visible_equipo,
      visible_catering: bloque.visible_catering,
      visible_extras: bloque.visible_extras,
      visible_cliente: bloque.visible_cliente,
    })
  }, [bloque])

  // Bloques disponibles para encadenar (todos excepto este y sus hijos)
  const bloquesParaEncadenar = todosBloques.filter(b =>
    b.id !== bloque.id && !b.padre_id
  )

  const encadenadoBloque = bloque.encadenado_a
    ? todosBloques.find(b => b.id === bloque.encadenado_a)
    : null

  return (
    <div className={`${bloque.encadenado_a ? 'ml-0' : ''}`}>
      {/* Nota previa */}
      {bloque.nota_previa && (
        <div className="flex items-center gap-2 px-3 py-1 text-xs text-zinc-600 italic">
          <span className="text-zinc-800">→</span> {bloque.nota_previa}
        </div>
      )}

      {/* Fila principal del bloque */}
      <div className={`border rounded-[2px] ${isExpanded ? 'border-zinc-600 bg-zinc-900' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'} transition-colors`}>

        {/* Header del bloque */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Ordenar */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <button onClick={onMoverArriba} disabled={!onMoverArriba} className="text-zinc-800 hover:text-zinc-500 disabled:opacity-0 text-xs leading-none transition-colors">▲</button>
            <button onClick={onMoverAbajo} disabled={!onMoverAbajo} className="text-zinc-800 hover:text-zinc-500 disabled:opacity-0 text-xs leading-none transition-colors">▼</button>
          </div>

          {/* Hora */}
          <div className="w-12 shrink-0 text-center">
            {inicioMin !== undefined ? (
              <span className="text-xs font-medium text-zinc-300">{minutosAHora(inicioMin)}</span>
            ) : (
              <span className="text-xs text-zinc-700">—</span>
            )}
          </div>

          {/* Tipo badge */}
          <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${cfg.color}`}>{cfg.label}</span>

          {/* Título — click expande */}
          <button
            className="flex-1 text-left text-sm text-zinc-100 hover:text-white truncate"
            onClick={() => setExpandido(isExpanded ? null : bloque.id)}
          >
            {bloque.titulo}
          </button>

          {/* Duración */}
          <span className="text-xs text-zinc-600 shrink-0">{duracion}min</span>

          {/* Encadenado */}
          {encadenadoBloque && (
            <span className="text-xs text-zinc-700 shrink-0 hidden sm:block truncate max-w-[80px]" title={`↳ ${encadenadoBloque.titulo}`}>
              ↳ {encadenadoBloque.titulo}
            </span>
          )}

          {/* Contenedor badge */}
          {esContenedor && (
            <span className="text-xs text-zinc-700 shrink-0">[{hijos.length}]</span>
          )}

          {/* Visibilidad */}
          <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setVisibilidadAbierta(visibilidadAbierta === bloque.id ? null : bloque.id)}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                !bloque.visible_equipo || !bloque.visible_catering
                  ? 'text-amber-500'
                  : 'text-zinc-700 hover:text-zinc-400'
              }`}
              title="Visibilidad"
            >
              👁
            </button>

            {visibilidadAbierta === bloque.id && (
              <div className="absolute right-0 top-6 z-20 bg-zinc-800 border border-zinc-700 rounded-[2px] p-3 shadow-xl min-w-[160px]">
                <p className="text-xs text-zinc-500 mb-2">Visible para</p>
                {([
                  ['visible_equipo', 'Equipo técnico'],
                  ['visible_catering', 'Catering'],
                  ['visible_extras', 'Extras'],
                  ['visible_cliente', 'Cliente'],
                ] as [keyof RodajeBloque, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={!!bloque[key]}
                      onChange={(e) => {
                        onVisibilidad({
                          visible_equipo: bloque.visible_equipo,
                          visible_catering: bloque.visible_catering,
                          visible_extras: bloque.visible_extras,
                          visible_cliente: bloque.visible_cliente,
                          [key]: e.target.checked,
                        })
                      }}
                      className="accent-[#E6E2ED]"
                    />
                    <span className="text-xs text-zinc-300">{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpandido(isExpanded ? null : bloque.id)}
            className="text-zinc-700 hover:text-zinc-400 text-xs transition-colors shrink-0"
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>

        {/* Panel expandido — edición inline */}
        {isExpanded && (
          <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">Título</label>
                <input
                  value={form.titulo || ''}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">Tipo</label>
                <select
                  value={form.tipo || 'rodaje'}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoBloque }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                >
                  {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">Duración (min)</label>
                <input
                  type="number"
                  min="0"
                  value={form.duracion_min ?? ''}
                  onChange={e => setForm(f => ({ ...f, duracion_min: e.target.value ? parseInt(e.target.value) : undefined }))}
                  placeholder="30"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* Locación */}
              {locaciones.length > 0 && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Locación</label>
                  <select
                    value={form.locacion_id || ''}
                    onChange={e => setForm(f => ({ ...f, locacion_id: e.target.value || undefined }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="">Sin locación</option>
                    {locaciones.map(l => (
                      <option key={l.id} value={l.id}>{l.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Inicio */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Inicio</label>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`inicio-${bloque.id}`}
                      checked={!form.hora_inicio_fija && !form.encadenado_a}
                      onChange={() => setForm(f => ({ ...f, hora_inicio_fija: undefined, encadenado_a: undefined }))}
                      className="accent-[#E6E2ED]"
                    />
                    <span className="text-xs text-zinc-400">Libre</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`inicio-${bloque.id}`}
                      checked={!!form.hora_inicio_fija}
                      onChange={() => setForm(f => ({ ...f, encadenado_a: undefined, hora_inicio_fija: '08:00' }))}
                      className="accent-[#E6E2ED]"
                    />
                    <input
                      type="time"
                      value={form.hora_inicio_fija?.slice(0, 5) || ''}
                      onChange={e => setForm(f => ({ ...f, hora_inicio_fija: e.target.value, encadenado_a: undefined }))}
                      className="bg-zinc-800 border border-zinc-700 rounded-[2px] px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="radio"
                      name={`inicio-${bloque.id}`}
                      checked={!!form.encadenado_a}
                      onChange={() => setForm(f => ({ ...f, hora_inicio_fija: undefined, encadenado_a: bloquesParaEncadenar[0]?.id }))}
                      className="accent-[#E6E2ED]"
                    />
                    <span className="text-xs text-zinc-400">Tras</span>
                    <select
                      value={form.encadenado_a || ''}
                      onChange={e => setForm(f => ({ ...f, encadenado_a: e.target.value || undefined, hora_inicio_fija: undefined }))}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-[2px] px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                    >
                      <option value="">— elige bloque —</option>
                      {bloquesParaEncadenar.map(b => (
                        <option key={b.id} value={b.id}>{b.titulo}</option>
                      ))}
                    </select>
                    <span className="text-xs text-zinc-500">+</span>
                    <input
                      type="number"
                      min="0"
                      value={form.offset_min ?? 0}
                      onChange={e => setForm(f => ({ ...f, offset_min: parseInt(e.target.value) || 0 }))}
                      className="w-14 bg-zinc-800 border border-zinc-700 rounded-[2px] px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                    />
                    <span className="text-xs text-zinc-500">min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Nota previa */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Nota previa (aparece antes del bloque en el plan)</label>
              <input
                value={form.nota_previa || ''}
                onChange={e => setForm(f => ({ ...f, nota_previa: e.target.value }))}
                placeholder="ej: → Arte empieza montaje Set 2 aquí"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Descripción / Escenas</label>
              <textarea
                rows={2}
                value={form.descripcion || ''}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Esc. 3, 5, 7 — exterior jardín"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
              />
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onGuardar(form)}
                disabled={isPending}
                className="text-xs bg-[#E6E2ED] text-zinc-900 font-medium px-3 py-1.5 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50"
              >
                {isPending ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={onAgregarEncadenado}
                disabled={isPending}
                className="text-xs border border-zinc-700 text-zinc-400 px-3 py-1.5 rounded-[2px] hover:border-zinc-500 hover:text-zinc-200 transition-colors"
              >
                + Encadenar bloque
              </button>
              {!esContenedor && (
                <button
                  onClick={onAgregarHijo}
                  disabled={isPending}
                  className="text-xs border border-zinc-700 text-zinc-400 px-3 py-1.5 rounded-[2px] hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  + Sub-bloque
                </button>
              )}
              <button
                onClick={onDividir}
                disabled={isPending}
                className="text-xs border border-zinc-700 text-zinc-400 px-3 py-1.5 rounded-[2px] hover:border-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Dividir en 2
              </button>
              <button
                onClick={onEliminar}
                disabled={isPending}
                className="text-xs text-zinc-700 hover:text-red-400 transition-colors ml-auto"
              >
                Eliminar
              </button>
            </div>
          </div>
        )}

        {/* Sub-bloques */}
        {esContenedor && (
          <div className="border-t border-zinc-800 px-3 py-2 space-y-1">
            {hijos.map((hijo, hidx) => (
              <SubBloqueItem
                key={hijo.id}
                bloque={hijo}
                todosBloques={todosBloques}
                locaciones={locaciones}
                expandido={expandido}
                setExpandido={setExpandido}
                isPending={isPending}
                rodajeId={rodajeId}
                esUltimo={hidx === hijos.length - 1}
                onGuardar={async (data) => {
                  startTransition(async () => {
                    await actualizarBloque(hijo.id, rodajeId, data)
                    await recargar()
                  })
                }}
                onEliminar={async () => {
                  if (!confirm(`¿Eliminar "${hijo.titulo}"?`)) return
                  startTransition(async () => {
                    await eliminarBloque(hijo.id, rodajeId)
                    await recargar()
                  })
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // Necesitamos recargar desde el padre — forward ref workaround
  function recargar() {
    return Promise.all([getBloques(id), getLocaciones(id)]).then(([b, l]) => {
      setBloques(b)
      setLocaciones(l)
    })
  }
}

// ─── Sub-bloque (versión simplificada sin anidamiento) ────────────────────────

function SubBloqueItem({ bloque, todosBloques, locaciones, expandido, setExpandido, isPending, rodajeId, esUltimo, onGuardar, onEliminar }: any) {
  const isExpanded = expandido === bloque.id
  const cfg = TIPO_CONFIG[bloque.tipo as TipoBloque]
  const inicioMin = calcularInicioBloque(bloque, todosBloques)
  const duracion = calcularDuracionBloque(bloque, todosBloques)

  const [form, setForm] = useState<Partial<RodajeBloque>>({
    titulo: bloque.titulo,
    tipo: bloque.tipo,
    descripcion: bloque.descripcion,
    hora_inicio_fija: bloque.hora_inicio_fija,
    duracion_min: bloque.duracion_min,
    encadenado_a: bloque.encadenado_a,
    offset_min: bloque.offset_min,
  })

  useEffect(() => {
    setForm({
      titulo: bloque.titulo,
      tipo: bloque.tipo,
      descripcion: bloque.descripcion,
      hora_inicio_fija: bloque.hora_inicio_fija,
      duracion_min: bloque.duracion_min,
      encadenado_a: bloque.encadenado_a,
      offset_min: bloque.offset_min,
    })
  }, [bloque])

  const hermanosParaEncadenar = todosBloques.filter((b: RodajeBloque) =>
    b.padre_id === bloque.padre_id && b.id !== bloque.id
  )

  return (
    <div className="border border-zinc-800 rounded-[2px] bg-zinc-950">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-10 shrink-0 text-center">
          {inicioMin !== undefined ? (
            <span className="text-xs text-zinc-400">{minutosAHora(inicioMin)}</span>
          ) : (
            <span className="text-xs text-zinc-700">—</span>
          )}
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${cfg.color}`}>{cfg.label}</span>
        <button
          className="flex-1 text-left text-xs text-zinc-300 hover:text-white truncate"
          onClick={() => setExpandido(isExpanded ? null : bloque.id)}
        >
          {bloque.titulo}
        </button>
        <span className="text-xs text-zinc-700 shrink-0">{duracion}min</span>
        <button onClick={() => setExpandido(isExpanded ? null : bloque.id)} className="text-zinc-700 text-xs">
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>

      {isExpanded && (
        <div className="border-t border-zinc-800 px-3 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Título</label>
              <input value={form.titulo || ''} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Tipo</label>
              <select value={form.tipo || 'rodaje'} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoBloque }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-[2px] px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500">
                {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Duración (min)</label>
              <input type="number" min="0" value={form.duracion_min ?? ''} onChange={e => setForm(f => ({ ...f, duracion_min: e.target.value ? parseInt(e.target.value) : undefined }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-[2px] px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500" />
            </div>
          </div>

          {hermanosParaEncadenar.length > 0 && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Encadenar tras</label>
              <div className="flex items-center gap-2">
                <select value={form.encadenado_a || ''} onChange={e => setForm(f => ({ ...f, encadenado_a: e.target.value || undefined }))} className="flex-1 bg-zinc-800 border border-zinc-700 rounded-[2px] px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500">
                  <option value="">Libre / paralelo</option>
                  {hermanosParaEncadenar.map((b: RodajeBloque) => <option key={b.id} value={b.id}>{b.titulo}</option>)}
                </select>
                <span className="text-xs text-zinc-500">+</span>
                <input type="number" min="0" value={form.offset_min ?? 0} onChange={e => setForm(f => ({ ...f, offset_min: parseInt(e.target.value) || 0 }))} className="w-14 bg-zinc-800 border border-zinc-700 rounded-[2px] px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500" />
                <span className="text-xs text-zinc-500">min</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Descripción</label>
            <textarea rows={2} value={form.descripcion || ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none" />
          </div>

          <div className="flex gap-2">
            <button onClick={() => onGuardar(form)} disabled={isPending} className="text-xs bg-[#E6E2ED] text-zinc-900 font-medium px-3 py-1.5 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50">
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={onEliminar} disabled={isPending} className="text-xs text-zinc-700 hover:text-red-400 transition-colors ml-auto">
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
