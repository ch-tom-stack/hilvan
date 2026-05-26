'use client'

import { use, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/useConfirm'
import {
  getRodaje,
  getColaboradores,
  crearDepartamento,
  actualizarDepartamento,
  eliminarDepartamento,
  agregarPersonaEquipo,
  actualizarPersonaEquipo,
  eliminarPersonaEquipo,
} from '@/app/actions/rodaje'
import { formatHora, RodajeDepartamento, RodajeEquipoTecnico, Colaborador } from '@/types'

export default function EquipoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [rodaje, setRodaje] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  const [modalDept, setModalDept] = useState<{ open: boolean; editando?: RodajeDepartamento }>({ open: false })
  const [modalPersona, setModalPersona] = useState<{ open: boolean; editando?: RodajeEquipoTecnico }>({ open: false })

  const [busqueda, setBusqueda] = useState('')
  const [sugerencias, setSugerencias] = useState<Colaborador[]>([])
  const [colaboradorSeleccionado, setColaboradorSeleccionado] = useState<Colaborador | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()

  const recargar = () => getRodaje(id).then(setRodaje)

  useEffect(() => { recargar().finally(() => setLoading(false)) }, [id])

  useEffect(() => {
    if (busqueda.length < 2) { setSugerencias([]); return }
    getColaboradores(busqueda).then(setSugerencias)
  }, [busqueda])

  if (loading) return <div className="p-6 text-ch-subtle text-sm">Cargando...</div>

  const departamentos: RodajeDepartamento[] = rodaje?.departamentos || []
  const sinDepartamento = (rodaje?.equipo_tecnico || []).filter((p: RodajeEquipoTecnico) => !p.departamento_id)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {ConfirmDialog}
      <Link href={`/rodaje/${id}`} className="text-xs text-ch-muted hover:text-ch-cream transition-colors">
        ← Volver al rodaje
      </Link>
      <div className="flex items-center justify-between mt-3 mb-8">
        <div>
          <h1 className="text-lg font-medium text-ch-cream">Equipo técnico</h1>
          <p className="text-sm text-ch-muted mt-0.5">{rodaje?.nombre}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModalDept({ open: true })}
            className="text-xs text-ch-muted border border-ch-border px-3 py-1.5 rounded-[2px] hover:border-ch-muted transition-colors"
          >
            + Departamento
          </button>
          <button
            onClick={() => { setModalPersona({ open: true }); setColaboradorSeleccionado(null); setBusqueda('') }}
            className="text-xs bg-ch-cream text-ch-dark font-medium px-3 py-1.5 rounded-[2px] hover:bg-white transition-colors"
          >
            + Persona
          </button>
        </div>
      </div>

      {departamentos.length === 0 && sinDepartamento.length === 0 && (
        <div className="text-center py-16 text-ch-subtle text-sm">
          Agrega departamentos y personas para armar el equipo técnico.
        </div>
      )}

      <div className="space-y-6">
        {departamentos.map((dept) => (
          <DepartamentoCard
            key={dept.id}
            dept={dept}
            rodajeId={id}
            onEditDept={() => setModalDept({ open: true, editando: dept })}
            onEditPersona={(p: any) => setModalPersona({ open: true, editando: p })}
            onDelete={async () => {
              if (!await confirm('¿Eliminar departamento?')) return
              startTransition(async () => { await eliminarDepartamento(dept.id, id); recargar() })
            }}
            onDeletePersona={async (p: any) => {
              if (!await confirm(`¿Eliminar a ${p.nombre}?`)) return
              startTransition(async () => { await eliminarPersonaEquipo(p.id, id); recargar() })
            }}
          />
        ))}

        {sinDepartamento.length > 0 && (
          <div>
            <p className="text-xs text-ch-subtle uppercase tracking-wider mb-3">Sin departamento</p>
            <div className="space-y-2">
              {sinDepartamento.map((p: RodajeEquipoTecnico) => (
                <PersonaRow
                  key={p.id}
                  persona={p}
                  onEdit={() => setModalPersona({ open: true, editando: p })}
                  onDelete={async () => {
                    if (!await confirm(`¿Eliminar a ${p.nombre}?`)) return
                    startTransition(async () => { await eliminarPersonaEquipo(p.id, id); recargar() })
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal Departamento */}
      {modalDept.open && (
        <Modal onClose={() => setModalDept({ open: false })}>
          <h2 className="text-sm font-medium text-ch-cream mb-4">
            {modalDept.editando ? 'Editar departamento' : 'Nuevo departamento'}
          </h2>
          <form
            action={async (fd) => {
              startTransition(async () => {
                if (modalDept.editando) {
                  await actualizarDepartamento(modalDept.editando.id, id, fd)
                } else {
                  await crearDepartamento(id, fd)
                }
                setModalDept({ open: false })
                recargar()
              })
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Nombre *</label>
              <input
                name="nombre"
                required
                defaultValue={modalDept.editando?.nombre}
                placeholder="ej: Cámara, Arte, Sonido..."
                className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-muted"
              />
            </div>
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Hora de llamado del departamento</label>
              <input
                name="hora_llamado"
                type="time"
                defaultValue={modalDept.editando?.hora_llamado?.slice(0, 5)}
                className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
              />
              <p className="text-xs text-ch-subtle mt-1">Solo va al jefe del departamento. El resto hereda la hora general.</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={isPending} className="bg-ch-cream text-ch-dark text-sm font-medium px-4 py-2 rounded-[2px] hover:bg-white transition-colors">
                {isPending ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={() => setModalDept({ open: false })} className="text-sm text-ch-muted px-3 py-2 hover:text-ch-cream">
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Persona */}
      {modalPersona.open && (
        <Modal onClose={() => setModalPersona({ open: false })}>
          <h2 className="text-sm font-medium text-ch-cream mb-4">
            {modalPersona.editando ? 'Editar persona' : 'Agregar persona'}
          </h2>
          <form
            action={async (fd) => {
              startTransition(async () => {
                if (modalPersona.editando) {
                  await actualizarPersonaEquipo(modalPersona.editando.id, id, fd)
                } else {
                  await agregarPersonaEquipo(id, fd)
                }
                setModalPersona({ open: false })
                setBusqueda('')
                setColaboradorSeleccionado(null)
                recargar()
              })
            }}
            className="space-y-4"
          >
            {!modalPersona.editando && (
              <div className="relative">
                <label className="block text-xs text-ch-muted mb-1.5">Buscar en directorio</label>
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setColaboradorSeleccionado(null) }}
                  placeholder="Escribe un nombre..."
                  className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-muted"
                />
                {sugerencias.length > 0 && !colaboradorSeleccionado && (
                  <div className="absolute z-10 w-full bg-ch-surface border border-ch-border rounded-[2px] mt-1">
                    {sugerencias.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setColaboradorSeleccionado(c); setBusqueda(c.nombre); setSugerencias([]) }}
                        className="w-full text-left px-3 py-2 text-sm text-ch-cream hover:bg-ch-dark transition-colors"
                      >
                        <span>{c.nombre}</span>
                        {c.rol_habitual && <span className="text-ch-muted ml-2 text-xs">{c.rol_habitual}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {colaboradorSeleccionado && (
                  <input type="hidden" name="colaborador_id" value={colaboradorSeleccionado.id} />
                )}
              </div>
            )}

            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Nombre *</label>
              <input
                name="nombre"
                required
                defaultValue={colaboradorSeleccionado?.nombre || modalPersona.editando?.nombre}
                className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ch-muted mb-1.5">Rol</label>
                <input
                  name="rol"
                  defaultValue={colaboradorSeleccionado?.rol_habitual || modalPersona.editando?.rol || ''}
                  placeholder="ej: Director de fotografía"
                  className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-muted"
                />
              </div>
              <div>
                <label className="block text-xs text-ch-muted mb-1.5">Hora individual</label>
                <input
                  name="hora_llamado_individual"
                  type="time"
                  defaultValue={modalPersona.editando?.hora_llamado_individual?.slice(0, 5)}
                  className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ch-muted mb-1.5">Email</label>
                <input
                  name="email"
                  type="email"
                  defaultValue={colaboradorSeleccionado?.email || modalPersona.editando?.email || ''}
                  className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
                />
              </div>
              <div>
                <label className="block text-xs text-ch-muted mb-1.5">Teléfono</label>
                <input
                  name="telefono"
                  defaultValue={colaboradorSeleccionado?.telefono || modalPersona.editando?.telefono || ''}
                  placeholder="+56 9..."
                  className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-muted"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Departamento</label>
              <select
                name="departamento_id"
                defaultValue={modalPersona.editando?.departamento_id || ''}
                className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream focus:outline-none focus:border-ch-muted"
              >
                <option value="">Sin departamento</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" name="es_jefe_departamento" value="true" defaultChecked={modalPersona.editando?.es_jefe_departamento} id="esjefe" className="accent-ch-cream" />
              <label htmlFor="esjefe" className="text-sm text-ch-muted cursor-pointer">Jefe de departamento</label>
            </div>

            {!modalPersona.editando && !colaboradorSeleccionado && (
              <div className="flex items-center gap-2">
                <input type="checkbox" name="guardar_en_directorio" value="true" defaultChecked id="guardardir" className="accent-ch-cream" />
                <label htmlFor="guardardir" className="text-sm text-ch-muted cursor-pointer">Guardar en directorio para futuros rodajes</label>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={isPending} className="bg-ch-cream text-ch-dark text-sm font-medium px-4 py-2 rounded-[2px] hover:bg-white transition-colors">
                {isPending ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={() => setModalPersona({ open: false })} className="text-sm text-ch-muted px-3 py-2 hover:text-ch-cream">
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function DepartamentoCard({ dept, rodajeId, onEditDept, onEditPersona, onDelete, onDeletePersona }: any) {
  const miembros: RodajeEquipoTecnico[] = dept.miembros || []
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <p className="text-xs text-ch-muted uppercase tracking-wider font-medium">{dept.nombre}</p>
          {dept.hora_llamado && <span className="text-xs text-ch-subtle">{formatHora(dept.hora_llamado)}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={onEditDept} className="text-xs text-ch-subtle hover:text-ch-muted transition-colors">Editar</button>
          <button onClick={onDelete} className="text-xs text-zinc-600 hover:text-red-400 transition-colors">Eliminar</button>
        </div>
      </div>
      {miembros.length === 0 ? (
        <p className="text-xs text-ch-subtle py-3">Sin miembros en este departamento.</p>
      ) : (
        <div className="space-y-1">
          {miembros.map((p) => (
            <PersonaRow key={p.id} persona={p} onEdit={() => onEditPersona(p)} onDelete={() => onDeletePersona(p)} />
          ))}
        </div>
      )}
      <div className="border-b border-ch-border mt-4" />
    </div>
  )
}

function PersonaRow({ persona, onEdit, onDelete }: any) {
  return (
    <div className="flex items-center justify-between bg-ch-surface border border-ch-border rounded-[2px] px-4 py-3 hover:border-ch-muted transition-colors">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-ch-cream">{persona.nombre}</p>
          {persona.es_jefe_departamento && (
            <span className="text-xs text-amber-500/80 bg-amber-950/40 px-1.5 py-0.5 rounded">jefe</span>
          )}
        </div>
        {persona.rol && <p className="text-xs text-ch-muted">{persona.rol}</p>}
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          {persona.hora_llamado_individual && (
            <p className="text-xs text-ch-muted">{formatHora(persona.hora_llamado_individual)}</p>
          )}
          <div className="flex gap-2 justify-end">
            {persona.email && <span className="text-xs text-ch-subtle">✉</span>}
            {persona.telefono && <span className="text-xs text-ch-subtle">📱</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="text-xs text-ch-subtle hover:text-ch-muted transition-colors">Editar</button>
          <button onClick={onDelete} className="text-xs text-zinc-600 hover:text-red-400 transition-colors">Quitar</button>
        </div>
      </div>
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-ch-surface border border-ch-border rounded-[2px] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
