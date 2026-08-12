'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  actualizarCliente,
  crearProyecto,
  crearContacto,
  actualizarContacto,
  eliminarContacto,
  toggleTarea,
} from '@/app/actions/clientes'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import type { Cliente, Proyecto, ClienteContacto, ProyectoTarea, EstadoProyecto } from '@/types'
import { ESTADO_PROYECTO_LABELS, ESTADO_PROYECTO_ACTIVOS, formatCLP } from '@/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<EstadoProyecto, string> = {
  prospecto:  'text-ch-muted border-ch-muted/40',
  activo:     'text-ch-green border-ch-green/40',
  en_rodaje:  'text-amber-400 border-amber-400/40',
  post:       'text-blue-400 border-blue-400/40',
  entregado:  'text-ch-muted border-ch-muted/40',
  cerrado:    'text-ch-muted/50 border-ch-muted/20',
  cancelado:  'text-red-400/60 border-red-400/20',
}

type TareaConProyecto = ProyectoTarea & { proyecto_nombre: string; proyecto_id: string }

interface Props {
  cliente: Cliente
  proyectos: Proyecto[]
  contactos: ClienteContacto[]
  tareas: TareaConProyecto[]
  todosLosClientes: Cliente[]
}

// ─── Sección colapsable ───────────────────────────────────────────────────────
function Seccion({ titulo, count, children, defaultOpen = true }: {
  titulo: string; count?: number; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [abierta, setAbierta] = useState(defaultOpen)
  return (
    <div className="border border-ch-border">
      <button
        onClick={() => setAbierta(a => !a)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors"
      >
        <span className="font-body text-[10px] tracking-[0.4em] uppercase text-ch-muted flex items-center gap-2">
          {titulo}
          {count !== undefined && (
            <span className="text-ch-cream/60">{count}</span>
          )}
        </span>
        <span className="text-ch-muted text-xs">{abierta ? '▲' : '▼'}</span>
      </button>
      {abierta && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FichaCliente({ cliente: clienteInicial, proyectos: proyectosIniciales, contactos: contactosIniciales, tareas: tareasIniciales, todosLosClientes }: Props) {
  const [cliente, setCliente] = useState(clienteInicial)
  const [proyectos, setProyectos] = useState(proyectosIniciales)
  const [contactos, setContactos] = useState(contactosIniciales)
  const [tareas, setTareas] = useState(tareasIniciales)
  const [isPending, startTransition] = useTransition()

  // Edición de identidad
  const [editando, setEditando] = useState(false)
  const [formCliente, setFormCliente] = useState({
    nombre: cliente.nombre,
    empresa: cliente.empresa ?? '',
    email: cliente.email ?? '',
    telefono: cliente.telefono ?? '',
    rut: cliente.rut ?? '',
    direccion: cliente.direccion ?? '',
    ciudad: cliente.ciudad ?? '',
    pais: cliente.pais ?? 'Chile',
    parent_id: cliente.parent_id ?? '',
    notas: cliente.notas ?? '',
  })

  // Nuevo proyecto
  const [mostrarFormProyecto, setMostrarFormProyecto] = useState(false)
  const [formProyecto, setFormProyecto] = useState({ nombre: '', estado: 'activo' as EstadoProyecto })

  // Nuevo contacto
  const [mostrarFormContacto, setMostrarFormContacto] = useState(false)
  const [editandoContacto, setEditandoContacto] = useState<ClienteContacto | null>(null)
  const [formContacto, setFormContacto] = useState({ nombre: '', cargo: '', email: '', telefono: '', area: '', notas: '' })
  const [confirmBorrarContacto, setConfirmBorrarContacto] = useState<string | null>(null)

  // ─── Guardar cliente ──────────────────────────────────────────────────────
  function guardarCliente() {
    startTransition(async () => {
      try {
        await actualizarCliente(cliente.id, {
          nombre: formCliente.nombre.trim(),
          empresa: formCliente.empresa.trim() || undefined,
          email: formCliente.email.trim() || undefined,
          telefono: formCliente.telefono.trim() || undefined,
          rut: formCliente.rut.trim() || undefined,
          direccion: formCliente.direccion.trim() || undefined,
          ciudad: formCliente.ciudad.trim() || null,
          pais: formCliente.pais.trim() || 'Chile',
          parent_id: formCliente.parent_id || null,
          notas: formCliente.notas.trim() || null,
        })
        setCliente(c => ({ ...c, ...formCliente,
          empresa: formCliente.empresa || undefined,
          email: formCliente.email || undefined,
          parent_id: formCliente.parent_id || null,
        }))
        setEditando(false)
        // Después del await: confirmado por el servidor, no por el gesto.
        momento('guardado', { mensaje: 'Cliente guardado' })
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al guardar cliente')
        momento('error', { mensaje: 'Error al guardar cliente' })
      }
    })
  }

  // ─── Crear proyecto ───────────────────────────────────────────────────────
  function crearNuevoProyecto() {
    if (!formProyecto.nombre.trim()) return
    startTransition(async () => {
      try {
        const nuevo = await crearProyecto({
          nombre: formProyecto.nombre.trim(),
          estado: formProyecto.estado,
          cliente_id: cliente.id,
          created_by: undefined,
        })
        setProyectos(p => [nuevo, ...p])
        setFormProyecto({ nombre: '', estado: 'activo' })
        setMostrarFormProyecto(false)
        momento('creado', { mensaje: 'Proyecto creado' })
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al crear proyecto')
        momento('error', { mensaje: 'Error al crear proyecto' })
      }
    })
  }

  // ─── Guardar contacto ─────────────────────────────────────────────────────
  function guardarContacto() {
    if (!formContacto.nombre.trim()) return
    startTransition(async () => {
      try {
        if (editandoContacto) {
          await actualizarContacto(editandoContacto.id, cliente.id, {
            nombre: formContacto.nombre.trim(),
            cargo: formContacto.cargo.trim() || null,
            email: formContacto.email.trim() || null,
            telefono: formContacto.telefono.trim() || null,
            area: formContacto.area.trim() || null,
            notas: formContacto.notas.trim() || null,
          })
          setContactos(cs => cs.map(c => c.id === editandoContacto.id
            ? { ...c, ...formContacto }
            : c
          ))
          setEditandoContacto(null)
        } else {
          const nuevo = await crearContacto(cliente.id, {
            nombre: formContacto.nombre.trim(),
            cargo: formContacto.cargo.trim() || null,
            email: formContacto.email.trim() || null,
            telefono: formContacto.telefono.trim() || null,
            area: formContacto.area.trim() || null,
            notas: formContacto.notas.trim() || null,
          })
          setContactos(cs => [...cs, nuevo])
          setMostrarFormContacto(false)
        }
        setFormContacto({ nombre: '', cargo: '', email: '', telefono: '', area: '', notas: '' })
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al guardar contacto')
      }
    })
  }

  function abrirEditarContacto(c: ClienteContacto) {
    setEditandoContacto(c)
    setFormContacto({
      nombre: c.nombre,
      cargo: c.cargo ?? '',
      email: c.email ?? '',
      telefono: c.telefono ?? '',
      area: c.area ?? '',
      notas: c.notas ?? '',
    })
    setMostrarFormContacto(false)
  }

  function borrarContacto(id: string) {
    startTransition(async () => {
      try {
        await eliminarContacto(id, cliente.id)
        momento('item.eliminado')
        setContactos(cs => cs.filter(c => c.id !== id))
        setConfirmBorrarContacto(null)
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al eliminar contacto')
      }
    })
  }

  // ─── Toggle tarea ─────────────────────────────────────────────────────────
  function handleToggleTarea(tarea: TareaConProyecto) {
    startTransition(async () => {
      try {
        await toggleTarea(tarea.id, !tarea.completada, tarea.proyecto_id)
        setTareas(ts => ts.map(t => t.id === tarea.id ? { ...t, completada: !t.completada } : t))
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al actualizar tarea')
      }
    })
  }

  // ─── Clasificación proyectos ──────────────────────────────────────────────
  const proyectosVigentes = proyectos.filter(p => ESTADO_PROYECTO_ACTIVOS.includes(p.estado))
  const proyectosHistorico = proyectos.filter(p => !ESTADO_PROYECTO_ACTIVOS.includes(p.estado))
  const tareasPendientes = tareas.filter(t => !t.completada)
  const tareasCompletadas = tareas.filter(t => t.completada)

  const inputCls = 'w-full bg-transparent border border-ch-border text-ch-cream font-body text-sm px-3 py-2 focus:outline-none focus:border-ch-cream transition-colors placeholder:text-ch-muted'
  const labelCls = 'block font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] mb-1'

  return (
    <div>
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            <Link href="/clientes" className="hover:text-ch-cream transition-colors">Clientes</Link>
            {' · '}Ficha
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            {cliente.nombre}
          </h1>
          {cliente.empresa && (
            <p className="text-ch-muted font-body text-sm mt-1">{cliente.empresa}</p>
          )}
        </div>
        <button
          onClick={() => setEditando(e => !e)}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors flex-shrink-0"
        >
          {editando ? 'Cancelar' : 'Editar'}
        </button>
      </div>

      {/* ─── Identidad ──────────────────────────────────────────────────── */}
      {editando ? (
        <div className="border border-ch-border p-5 mb-6 space-y-4">
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-2">Editar datos</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div><label className={labelCls}>Nombre *</label>
              <input value={formCliente.nombre} onChange={e => setFormCliente(f => ({ ...f, nombre: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Empresa</label>
              <input value={formCliente.empresa} onChange={e => setFormCliente(f => ({ ...f, empresa: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Email</label>
              <input value={formCliente.email} onChange={e => setFormCliente(f => ({ ...f, email: e.target.value }))} type="email" className={inputCls} /></div>
            <div><label className={labelCls}>Teléfono</label>
              <input value={formCliente.telefono} onChange={e => setFormCliente(f => ({ ...f, telefono: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>RUT</label>
              <input value={formCliente.rut} onChange={e => setFormCliente(f => ({ ...f, rut: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Dirección</label>
              <input value={formCliente.direccion} onChange={e => setFormCliente(f => ({ ...f, direccion: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Ciudad</label>
              <input value={formCliente.ciudad} onChange={e => setFormCliente(f => ({ ...f, ciudad: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>País</label>
              <input value={formCliente.pais} onChange={e => setFormCliente(f => ({ ...f, pais: e.target.value }))} className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>Cliente padre</label>
            <select value={formCliente.parent_id} onChange={e => setFormCliente(f => ({ ...f, parent_id: e.target.value }))} className={inputCls}>
              <option value="">— Sin padre —</option>
              {todosLosClientes.filter(c => c.id !== cliente.id).map(c => (
                <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}</option>
              ))}
            </select>
          </div>
          <div><label className={labelCls}>Notas</label>
            <textarea value={formCliente.notas} onChange={e => setFormCliente(f => ({ ...f, notas: e.target.value }))} rows={2} className={`${inputCls} resize-none`} /></div>
          <button onClick={guardarCliente} disabled={isPending || !formCliente.nombre.trim()}
            className="border border-ch-cream text-ch-cream hover:bg-ch-cream hover:text-ch-dark font-body text-[10px] tracking-[0.35em] uppercase px-6 py-2 transition-colors disabled:opacity-50">
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-2 mb-8 text-sm">
          {cliente.rut && <Dato label="RUT" valor={cliente.rut} />}
          {cliente.email && <Dato label="Email" valor={cliente.email} />}
          {cliente.telefono && <Dato label="Teléfono" valor={cliente.telefono} />}
          {(cliente.ciudad || cliente.pais) && (
            <Dato label="Ubicación" valor={[cliente.ciudad, cliente.pais].filter(Boolean).join(', ')} />
          )}
          {cliente.direccion && <Dato label="Dirección" valor={cliente.direccion} />}
          {cliente.parent && <Dato label="Parte de" valor={cliente.parent.nombre} />}
          {cliente.notas && <div className="col-span-2 lg:col-span-4 mt-1">
            <Dato label="Notas" valor={cliente.notas} />
          </div>}
        </div>
      )}

      {/* ─── Secciones ──────────────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* PROYECTOS VIGENTES */}
        <Seccion titulo="Proyectos vigentes" count={proyectosVigentes.length}>
          {proyectosVigentes.length === 0 && !mostrarFormProyecto && (
            <p className="text-ch-muted font-body text-xs mb-3">Sin proyectos activos.</p>
          )}
          <div className="space-y-1 mb-3">
            {proyectosVigentes.map(p => (
              <Link key={p.id} href={`/proyectos/${p.id}`}
                className="flex items-center justify-between py-2 border-b border-ch-border/40 hover:text-ch-cream group transition-colors">
                <span className="font-body text-sm text-ch-cream group-hover:text-white">{p.nombre}</span>
                <span className={`font-body text-[9px] tracking-[0.3em] uppercase border px-2 py-0.5 ${ESTADO_COLOR[p.estado]}`}>
                  {ESTADO_PROYECTO_LABELS[p.estado]}
                </span>
              </Link>
            ))}
          </div>

          {mostrarFormProyecto ? (
            <div className="border border-ch-border/50 p-4 space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nombre del proyecto *</label>
                  <input value={formProyecto.nombre} onChange={e => setFormProyecto(f => ({ ...f, nombre: e.target.value }))}
                    autoFocus className={inputCls} placeholder="Ej: Campaña verano 2026" />
                </div>
                <div>
                  <label className={labelCls}>Estado inicial</label>
                  <select value={formProyecto.estado} onChange={e => setFormProyecto(f => ({ ...f, estado: e.target.value as EstadoProyecto }))}
                    className={inputCls}>
                    {(['prospecto','activo'] as EstadoProyecto[]).map(e => (
                      <option key={e} value={e}>{ESTADO_PROYECTO_LABELS[e]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={crearNuevoProyecto} disabled={isPending || !formProyecto.nombre.trim()}
                  className="border border-ch-cream text-ch-cream hover:bg-ch-cream hover:text-ch-dark font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2 transition-colors disabled:opacity-50">
                  {isPending ? 'Creando…' : 'Crear proyecto'}
                </button>
                <button onClick={() => setMostrarFormProyecto(false)}
                  className="text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setMostrarFormProyecto(true)}
              className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted hover:text-ch-cream transition-colors mt-1">
              + Nuevo proyecto
            </button>
          )}
        </Seccion>

        {/* TO-DO AGREGADO */}
        <Seccion titulo="Tareas pendientes" count={tareasPendientes.length}>
          {tareasPendientes.length === 0 && tareasCompletadas.length === 0 && (
            <p className="text-ch-muted font-body text-xs">Sin tareas. Agrégalas desde cada proyecto.</p>
          )}
          {tareasPendientes.length === 0 && tareasPendientes.length !== tareas.length && (
            <p className="text-ch-green font-body text-xs mb-2">✓ Todas las tareas completadas.</p>
          )}
          <div className="space-y-1">
            {[...tareasPendientes, ...tareasCompletadas].map(t => (
              <div key={t.id} className="flex items-center gap-3 py-1.5 border-b border-ch-border/30">
                <button onClick={() => handleToggleTarea(t)} disabled={isPending}
                  className={`w-3.5 h-3.5 border flex-shrink-0 transition-colors ${t.completada ? 'bg-ch-green border-ch-green' : 'border-ch-border hover:border-ch-cream'}`}
                />
                <span className={`font-body text-sm flex-1 ${t.completada ? 'line-through text-ch-muted/50' : 'text-ch-cream'}`}>
                  {t.texto}
                </span>
                <Link href={`/proyectos/${t.proyecto_id}`}
                  className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-muted/60 hover:text-ch-muted transition-colors flex-shrink-0">
                  {t.proyecto_nombre}
                </Link>
              </div>
            ))}
          </div>
          {proyectos.length > 0 && (
            <p className="text-ch-muted/50 font-body text-[10px] mt-3">
              Para agregar tareas, entra a cada proyecto.
            </p>
          )}
        </Seccion>

        {/* HISTORIAL */}
        {proyectosHistorico.length > 0 && (
          <Seccion titulo="Historial de proyectos" count={proyectosHistorico.length} defaultOpen={false}>
            <div className="space-y-1">
              {proyectosHistorico.map(p => (
                <Link key={p.id} href={`/proyectos/${p.id}`}
                  className="flex items-center justify-between py-2 border-b border-ch-border/40 hover:text-ch-cream group transition-colors">
                  <span className="font-body text-sm text-ch-muted group-hover:text-ch-cream">{p.nombre}</span>
                  <span className={`font-body text-[9px] tracking-[0.3em] uppercase border px-2 py-0.5 ${ESTADO_COLOR[p.estado]}`}>
                    {ESTADO_PROYECTO_LABELS[p.estado]}
                  </span>
                </Link>
              ))}
            </div>
          </Seccion>
        )}

        {/* CONTACTOS */}
        <Seccion titulo="Contactos" count={contactos.length} defaultOpen={false}>
          <div className="space-y-2 mb-3">
            {contactos.map(c => (
              <div key={c.id}>
                {confirmBorrarContacto === c.id ? (
                  <div className="flex items-center gap-3 py-2 text-xs font-body">
                    <span className="text-ch-muted">¿Eliminar <strong className="text-ch-cream">{c.nombre}</strong>?</span>
                    <button onClick={() => borrarContacto(c.id)} disabled={isPending}
                      className="text-red-400 hover:text-red-300 uppercase tracking-widest transition-colors">Sí</button>
                    <button onClick={() => setConfirmBorrarContacto(null)}
                      className="text-ch-muted hover:text-ch-cream uppercase tracking-widest transition-colors">No</button>
                  </div>
                ) : editandoContacto?.id === c.id ? (
                  <div className="border border-ch-border/50 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={labelCls}>Nombre *</label>
                        <input value={formContacto.nombre} onChange={e => setFormContacto(f => ({ ...f, nombre: e.target.value }))} className={inputCls} /></div>
                      <div><label className={labelCls}>Cargo</label>
                        <input value={formContacto.cargo} onChange={e => setFormContacto(f => ({ ...f, cargo: e.target.value }))} className={inputCls} /></div>
                      <div><label className={labelCls}>Email</label>
                        <input value={formContacto.email} onChange={e => setFormContacto(f => ({ ...f, email: e.target.value }))} type="email" className={inputCls} /></div>
                      <div><label className={labelCls}>Teléfono</label>
                        <input value={formContacto.telefono} onChange={e => setFormContacto(f => ({ ...f, telefono: e.target.value }))} className={inputCls} /></div>
                      <div><label className={labelCls}>Área</label>
                        <input value={formContacto.area} onChange={e => setFormContacto(f => ({ ...f, area: e.target.value }))} className={inputCls} /></div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={guardarContacto} disabled={isPending || !formContacto.nombre.trim()}
                        className="border border-ch-cream text-ch-cream hover:bg-ch-cream hover:text-ch-dark font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2 transition-colors disabled:opacity-50">
                        {isPending ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button onClick={() => setEditandoContacto(null)}
                        className="text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase transition-colors">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between py-2 border-b border-ch-border/30">
                    <div>
                      <p className="font-body text-sm text-ch-cream">{c.nombre}
                        {c.cargo && <span className="text-ch-muted ml-2 text-xs">· {c.cargo}</span>}
                        {c.area && <span className="text-ch-muted/60 ml-1 text-xs">{c.area}</span>}
                      </p>
                      <p className="font-body text-xs text-ch-muted mt-0.5">
                        {[c.email, c.telefono].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="flex gap-3 flex-shrink-0 ml-4">
                      <button onClick={() => abrirEditarContacto(c)}
                        className="font-body text-[9px] tracking-widest uppercase text-ch-muted hover:text-ch-cream transition-colors">
                        Editar
                      </button>
                      <button onClick={() => setConfirmBorrarContacto(c.id)}
                        className="font-body text-[9px] tracking-widest uppercase text-ch-muted hover:text-red-400 transition-colors">
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {mostrarFormContacto ? (
            <div className="border border-ch-border/50 p-4 space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Nombre *</label>
                  <input value={formContacto.nombre} onChange={e => setFormContacto(f => ({ ...f, nombre: e.target.value }))}
                    autoFocus className={inputCls} /></div>
                <div><label className={labelCls}>Cargo</label>
                  <input value={formContacto.cargo} onChange={e => setFormContacto(f => ({ ...f, cargo: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Email</label>
                  <input value={formContacto.email} onChange={e => setFormContacto(f => ({ ...f, email: e.target.value }))} type="email" className={inputCls} /></div>
                <div><label className={labelCls}>Teléfono</label>
                  <input value={formContacto.telefono} onChange={e => setFormContacto(f => ({ ...f, telefono: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Área / Departamento</label>
                  <input value={formContacto.area} onChange={e => setFormContacto(f => ({ ...f, area: e.target.value }))} className={inputCls} /></div>
              </div>
              <div className="flex gap-3">
                <button onClick={guardarContacto} disabled={isPending || !formContacto.nombre.trim()}
                  className="border border-ch-cream text-ch-cream hover:bg-ch-cream hover:text-ch-dark font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2 transition-colors disabled:opacity-50">
                  {isPending ? 'Guardando…' : 'Agregar contacto'}
                </button>
                <button onClick={() => setMostrarFormContacto(false)}
                  className="text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setEditandoContacto(null); setMostrarFormContacto(true) }}
              className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted hover:text-ch-cream transition-colors mt-1">
              + Agregar contacto
            </button>
          )}
        </Seccion>

      </div>
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em]">{label}</p>
      <p className="font-body text-sm text-ch-cream mt-0.5">{valor}</p>
    </div>
  )
}
