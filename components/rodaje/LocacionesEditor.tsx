'use client'

import { useState, useTransition } from 'react'
import { useConfirm } from '@/components/ui/useConfirm'
import {
  crearLocacion,
  actualizarLocacion,
  eliminarLocacion,
  geocodificarDireccion,
} from '@/app/actions/rodaje-plan'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
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
      <div className="space-y-3 bg-ch-surface border border-ch-border rounded-[2px] p-4 mt-2">
        <div>
          <label className="block text-xs text-ch-muted mb-1">Nombre *</label>
          <input
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="ej: Estudio EQUECO, Roof top Edificio X"
            className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream placeholder:text-ch-border focus:outline-none focus:border-ch-muted"
          />
        </div>

        <div>
          <label className="block text-xs text-ch-muted mb-1">Dirección</label>
          <div className="flex gap-2">
            <input
              value={form.direccion}
              onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
              placeholder="Herrera 844, Santiago"
              onKeyDown={e => e.key === 'Enter' && geocodificar()}
              className="flex-1 bg-ch-black border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream placeholder:text-ch-border focus:outline-none focus:border-ch-muted"
            />
            <button
              type="button"
              onClick={geocodificar}
              disabled={buscando || !form.direccion}
              className="text-xs border border-ch-border text-ch-muted px-3 py-1.5 rounded-[2px] hover:border-ch-muted hover:text-ch-cream transition-colors disabled:opacity-40 shrink-0"
            >
              {buscando ? '...' : '📍 Geocodificar'}
            </button>
          </div>
          {errorGeo && <p className="text-xs text-red-400 mt-1">{errorGeo}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ch-muted mb-1">Latitud</label>
            <input
              value={form.lat}
              onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
              placeholder="-33.4351"
              className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream placeholder:text-ch-border focus:outline-none focus:border-ch-muted"
            />
          </div>
          <div>
            <label className="block text-xs text-ch-muted mb-1">Longitud</label>
            <input
              value={form.lng}
              onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
              placeholder="-70.6783"
              className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream placeholder:text-ch-border focus:outline-none focus:border-ch-muted"
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
          <label className="block text-xs text-ch-muted mb-1">Notas</label>
          <input
            value={form.notas}
            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            placeholder="Acceso, estacionamiento, contacto..."
            className="w-full bg-ch-black border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream placeholder:text-ch-border focus:outline-none focus:border-ch-muted"
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
          <label htmlFor="principal" className="text-sm text-ch-muted cursor-pointer">Locación principal</label>
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
            className="text-xs bg-[#E6E2ED] text-ch-black font-medium px-3 py-1.5 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50"
          >
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
          <button type="button" onClick={onCancelar} className="text-xs text-ch-muted px-3 py-1.5 hover:text-ch-cream">
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
        <label className="block text-xs text-ch-muted">Locaciones</label>
        {!agregando && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="text-xs text-ch-muted hover:text-ch-cream transition-colors"
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
                    try {
                      await actualizarLocacion(loc.id, rodajeId, data)
                      momento('guardado')
                      setEditando(null)
                      onActualizar()
                    } catch (e) {
                      toastError(e instanceof Error ? e.message : 'Error al actualizar locación')
                    }
                  })
                }}
                onCancelar={() => setEditando(null)}
              />
            ) : (
              <div className="flex items-center justify-between bg-ch-black border border-ch-dark rounded-[2px] px-3 py-2.5 hover:border-ch-border transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-ch-cream">{loc.nombre}</p>
                    {loc.es_principal && (
                      <span className="text-xs text-[#E6E2ED] bg-ch-surface px-1.5 py-0.5 rounded-[2px]">principal</span>
                    )}
                  </div>
                  {loc.direccion && (
                    <p className="text-xs text-ch-border mt-0.5">{loc.direccion}</p>
                  )}
                  {loc.lat && loc.lng && (
                    <a
                      href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-ch-border hover:text-[#E6E2ED] transition-colors"
                    >
                      Ver en mapa →
                    </a>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditando(loc.id)}
                    className="text-xs text-ch-border hover:text-ch-cream transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!await confirm(`¿Eliminar "${loc.nombre}"?`)) return
                      startTransition(async () => {
                        try {
                          await eliminarLocacion(loc.id, rodajeId)
                          momento('item.eliminado')
                          onActualizar()
                        } catch (e) {
                          toastError(e instanceof Error ? e.message : 'Error al eliminar locación')
                        }
                      })
                    }}
                    className="text-xs text-ch-border hover:text-red-400 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {locaciones.length === 0 && !agregando && (
          <p className="text-xs text-ch-border py-2">Sin locaciones registradas.</p>
        )}
      </div>

      {/* Form para agregar */}
      {agregando && (
        <FormLocacion
          onGuardar={(data) => {
            startTransition(async () => {
              try {
                await crearLocacion(rodajeId, data)
                momento('item.agregado')
                setAgregando(false)
                onActualizar()
              } catch (e) {
                toastError(e instanceof Error ? e.message : 'Error al crear locación')
              }
            })
          }}
          onCancelar={() => setAgregando(false)}
        />
      )}
    </div>
  )
}
