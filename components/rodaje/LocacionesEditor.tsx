'use client'

import { useState, useTransition } from 'react'
import { useConfirm } from '@/components/ui/useConfirm'
import {
  crearLocacion,
  actualizarLocacion,
  eliminarLocacion,
  geocodificarDireccion,
} from '@/app/actions/rodaje-plan'
import { RodajeLocacion } from '@/types'

interface Props {
  rodajeId: string
  locaciones: RodajeLocacion[]
  onActualizar: () => void
}

export function LocacionesEditor({ rodajeId, locaciones, onActualizar }: Props) {
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [geocodificando, setGeocodificando] = useState<string | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()

  const FormLocacion = ({
    inicial,
    onGuardar,
    onCancelar,
  }: {
    inicial?: Partial<RodajeLocacion>
    onGuardar: (data: any) => void
    onCancelar: () => void
  }) => {
    const [form, setForm] = useState({
      nombre: inicial?.nombre || '',
      direccion: inicial?.direccion || '',
      lat: inicial?.lat?.toString() || '',
      lng: inicial?.lng?.toString() || '',
      es_principal: inicial?.es_principal || false,
      notas: inicial?.notas || '',
    })
    const [buscando, setBuscando] = useState(false)
    const [errorGeo, setErrorGeo] = useState('')

    const geocodificar = async () => {
      if (!form.direccion) return
      setBuscando(true)
      setErrorGeo('')
      try {
        const resultado = await geocodificarDireccion(form.direccion)
        if (resultado) {
          setForm(f => ({
            ...f,
            lat: resultado.lat.toString(),
            lng: resultado.lng.toString(),
          }))
        } else {
          setErrorGeo('No se encontró la dirección. Verifica o ingresa coordenadas manualmente.')
        }
      } finally {
        setBuscando(false)
      }
    }

    return (
      <div className="space-y-3 bg-zinc-800 border border-zinc-700 rounded-[2px] p-4 mt-2">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Nombre *</label>
          <input
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="ej: Estudio EQUECO, Roof top Edificio X"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Dirección</label>
          <div className="flex gap-2">
            <input
              value={form.direccion}
              onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
              placeholder="Herrera 844, Santiago"
              onKeyDown={e => e.key === 'Enter' && geocodificar()}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <button
              type="button"
              onClick={geocodificar}
              disabled={buscando || !form.direccion}
              className="text-xs border border-zinc-700 text-zinc-400 px-3 py-1.5 rounded-[2px] hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40 shrink-0"
            >
              {buscando ? '...' : '📍 Geocodificar'}
            </button>
          </div>
          {errorGeo && <p className="text-xs text-red-400 mt-1">{errorGeo}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Latitud</label>
            <input
              value={form.lat}
              onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
              placeholder="-33.4351"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Longitud</label>
            <input
              value={form.lng}
              onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
              placeholder="-70.6783"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        {/* Mapa preview si hay coordenadas */}
        {form.lat && form.lng && (
          <a
            href={`https://maps.google.com/?q=${form.lat},${form.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#E6E2ED] hover:underline inline-block"
          >
            Verificar en Google Maps →
          </a>
        )}

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Notas</label>
          <input
            value={form.notas}
            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            placeholder="Acceso, estacionamiento, contacto..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.es_principal}
            onChange={e => setForm(f => ({ ...f, es_principal: e.target.checked }))}
            id="principal"
            className="accent-[#E6E2ED]"
          />
          <label htmlFor="principal" className="text-sm text-zinc-400 cursor-pointer">Locación principal</label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onGuardar({
              nombre: form.nombre,
              direccion: form.direccion || undefined,
              lat: form.lat ? parseFloat(form.lat) : undefined,
              lng: form.lng ? parseFloat(form.lng) : undefined,
              es_principal: form.es_principal,
              notas: form.notas || undefined,
            })}
            disabled={isPending || !form.nombre}
            className="text-xs bg-[#E6E2ED] text-zinc-900 font-medium px-3 py-1.5 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50"
          >
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
          <button type="button" onClick={onCancelar} className="text-xs text-zinc-500 px-3 py-1.5 hover:text-zinc-300">
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {ConfirmDialog}
      <div className="flex items-center justify-between mb-3">
        <label className="block text-xs text-zinc-400">Locaciones</label>
        {!agregando && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            + Agregar
          </button>
        )}
      </div>

      {/* Lista de locaciones */}
      <div className="space-y-2">
        {locaciones.map(loc => (
          <div key={loc.id}>
            {editando === loc.id ? (
              <FormLocacion
                inicial={loc}
                onGuardar={(data) => {
                  startTransition(async () => {
                    await actualizarLocacion(loc.id, rodajeId, data)
                    setEditando(null)
                    onActualizar()
                  })
                }}
                onCancelar={() => setEditando(null)}
              />
            ) : (
              <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-[2px] px-3 py-2.5 hover:border-zinc-700 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-zinc-200">{loc.nombre}</p>
                    {loc.es_principal && (
                      <span className="text-xs text-[#E6E2ED] bg-zinc-800 px-1.5 py-0.5 rounded">principal</span>
                    )}
                  </div>
                  {loc.direccion && (
                    <p className="text-xs text-zinc-600 mt-0.5">{loc.direccion}</p>
                  )}
                  {loc.lat && loc.lng && (
                    <a
                      href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-700 hover:text-[#E6E2ED] transition-colors"
                    >
                      Ver en mapa →
                    </a>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditando(loc.id)}
                    className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!await confirm(`¿Eliminar "${loc.nombre}"?`)) return
                      startTransition(async () => {
                        await eliminarLocacion(loc.id, rodajeId)
                        onActualizar()
                      })
                    }}
                    className="text-xs text-zinc-700 hover:text-red-400 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {locaciones.length === 0 && !agregando && (
          <p className="text-xs text-zinc-700 py-2">Sin locaciones registradas.</p>
        )}
      </div>

      {/* Form para agregar */}
      {agregando && (
        <FormLocacion
          onGuardar={(data) => {
            startTransition(async () => {
              await crearLocacion(rodajeId, data)
              setAgregando(false)
              onActualizar()
            })
          }}
          onCancelar={() => setAgregando(false)}
        />
      )}
    </div>
  )
}
