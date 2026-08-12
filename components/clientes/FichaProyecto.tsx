'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  actualizarProyecto,
  crearTarea,
  toggleTarea,
  eliminarTarea,
  vincularContactoProyecto,
  desvincularContactoProyecto,
} from '@/app/actions/clientes'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import type {
  Proyecto,
  ProyectoTarea,
  ProyectoContacto,
  ClienteContacto,
  EstadoProyecto,
} from '@/types'
import type { MetricasProyecto } from '@/app/actions/clientes'
import { ESTADO_PROYECTO_LABELS, formatCLP } from '@/types'

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

const TODOS_ESTADOS: EstadoProyecto[] = [
  'prospecto', 'activo', 'en_rodaje', 'post', 'entregado', 'cerrado', 'cancelado',
]

const COT_ESTADO_LABEL: Record<string, string> = {
  borrador:  'Borrador',
  enviada:   'Enviada',
  aprobada:  'Aprobada',
  rechazada: 'Rechazada',
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
          {count !== undefined && <span className="text-ch-cream/60">{count}</span>}
        </span>
        <span className="text-ch-muted text-xs">{abierta ? '▲' : '▼'}</span>
      </button>
      {abierta && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  proyecto: Proyecto
  metricas: MetricasProyecto
  tareas: ProyectoTarea[]
  contactosProyecto: ProyectoContacto[]
  contactosCliente: ClienteContacto[]
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FichaProyecto({
  proyecto: proyectoInicial,
  metricas,
  tareas: tareasIniciales,
  contactosProyecto: contactosProyectoIniciales,
  contactosCliente,
}: Props) {
  const [proyecto, setProyecto] = useState(proyectoInicial)
  const [tareas, setTareas] = useState(tareasIniciales)
  const [contactosProyecto, setContactosProyecto] = useState(contactosProyectoIniciales)
  const [isPending, startTransition] = useTransition()

  // Edición
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({
    nombre: proyecto.nombre,
    estado: proyecto.estado,
    descripcion: proyecto.descripcion ?? '',
    notas: proyecto.notas ?? '',
    fecha_inicio: proyecto.fecha_inicio ?? '',
    fecha_cierre: proyecto.fecha_cierre ?? '',
  })

  // Nueva tarea
  const [textoTarea, setTextoTarea] = useState('')
  const [confirmBorrarTarea, setConfirmBorrarTarea] = useState<string | null>(null)

  const inputCls = 'w-full bg-transparent border border-ch-border text-ch-cream font-body text-sm px-3 py-2 focus:outline-none focus:border-ch-cream transition-colors placeholder:text-ch-muted'
  const labelCls = 'block font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] mb-1'

  // ─── Guardar proyecto ─────────────────────────────────────────────────────
  function guardar() {
    startTransition(async () => {
      try {
        await actualizarProyecto(proyecto.id, {
          nombre: form.nombre.trim(),
          estado: form.estado,
          descripcion: form.descripcion.trim() || null,
          notas: form.notas.trim() || null,
          fecha_inicio: form.fecha_inicio || null,
          fecha_cierre: form.fecha_cierre || null,
        })
        setProyecto(p => ({
          ...p,
          nombre: form.nombre.trim(),
          estado: form.estado,
          descripcion: form.descripcion.trim() || null,
          notas: form.notas.trim() || null,
          fecha_inicio: form.fecha_inicio || null,
          fecha_cierre: form.fecha_cierre || null,
        }))
        setEditando(false)
        momento('guardado', { mensaje: 'Proyecto guardado' })
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al guardar proyecto')
        momento('error', { mensaje: 'Error al guardar proyecto' })
      }
    })
  }

  // ─── Tareas ───────────────────────────────────────────────────────────────
  function agregarTarea() {
    if (!textoTarea.trim()) return
    startTransition(async () => {
      try {
        momento('item.agregado')
        const nueva = await crearTarea(proyecto.id, textoTarea.trim())
        setTareas(ts => [...ts, nueva])
        setTextoTarea('')
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al agregar tarea')
      }
    })
  }

  function handleToggle(tarea: ProyectoTarea) {
    startTransition(async () => {
      try {
        // Marcar suma, desmarcar es neutro: nunca un castigo.
        momento(!tarea.completada ? 'checklist.marcado' : 'checklist.desmarcado')
        await toggleTarea(tarea.id, !tarea.completada, proyecto.id)
        setTareas(ts => ts.map(t => t.id === tarea.id ? { ...t, completada: !t.completada } : t))
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al actualizar tarea')
      }
    })
  }

  function handleBorrarTarea(id: string) {
    startTransition(async () => {
      try {
        await eliminarTarea(id, proyecto.id)
        momento('item.eliminado')
        setTareas(ts => ts.filter(t => t.id !== id))
        setConfirmBorrarTarea(null)
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al eliminar tarea')
      }
    })
  }

  // ─── Contactos ────────────────────────────────────────────────────────────
  const vinculadosIds = new Set(contactosProyecto.map(cp => cp.contacto_id))

  function handleVincular(contactoId: string) {
    startTransition(async () => {
      try {
        await vincularContactoProyecto(proyecto.id, contactoId)
        momento('item.agregado')
        const contacto = contactosCliente.find(c => c.id === contactoId)
        if (contacto) {
          setContactosProyecto(cs => [...cs, {
            id: crypto.randomUUID(),
            proyecto_id: proyecto.id,
            contacto_id: contactoId,
            contacto,
            rol_en_proyecto: null,
          }])
        }
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al vincular contacto')
      }
    })
  }

  function handleDesvincular(contactoId: string) {
    startTransition(async () => {
      try {
        await desvincularContactoProyecto(proyecto.id, contactoId)
        setContactosProyecto(cs => cs.filter(cp => cp.contacto_id !== contactoId))
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al desvincular contacto')
      }
    })
  }

  // ─── Clasificación tareas ─────────────────────────────────────────────────
  const tareasPendientes = tareas.filter(t => !t.completada)
  const tareasCompletadas = tareas.filter(t => t.completada)

  return (
    <div>
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            {proyecto.cliente ? (
              <>
                <Link href="/clientes" className="hover:text-ch-cream transition-colors">Clientes</Link>
                {' · '}
                <Link href={`/clientes/${proyecto.cliente.id}`} className="hover:text-ch-cream transition-colors">
                  {proyecto.cliente.nombre}
                </Link>
                {' · '}Proyecto
              </>
            ) : (
              <>
                <Link href="/clientes" className="hover:text-ch-cream transition-colors">Clientes</Link>
                {' · '}Proyecto
              </>
            )}
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            {proyecto.nombre}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`font-body text-[9px] tracking-[0.3em] uppercase border px-2 py-0.5 ${ESTADO_COLOR[proyecto.estado]}`}>
              {ESTADO_PROYECTO_LABELS[proyecto.estado]}
            </span>
            {proyecto.fecha_inicio && (
              <span className="font-body text-xs text-ch-muted">
                Inicio: {proyecto.fecha_inicio}
              </span>
            )}
            {proyecto.fecha_cierre && (
              <span className="font-body text-xs text-ch-muted">
                Cierre: {proyecto.fecha_cierre}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditando(e => !e)}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors flex-shrink-0"
        >
          {editando ? 'Cancelar' : 'Editar'}
        </button>
      </div>

      {/* ─── Edición ────────────────────────────────────────────────────── */}
      {editando && (
        <div className="border border-ch-border p-5 mb-6 space-y-4">
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-2">Editar proyecto</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nombre *</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Estado</label>
              <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as EstadoProyecto }))} className={inputCls}>
                {TODOS_ESTADOS.map(e => (
                  <option key={e} value={e}>{ESTADO_PROYECTO_LABELS[e]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha inicio</label>
              <input type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fecha cierre estimado</label>
              <input type="date" value={form.fecha_cierre} onChange={e => setForm(f => ({ ...f, fecha_cierre: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Descripción</label>
            <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Notas internas</label>
            <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              rows={2} className={`${inputCls} resize-none`} />
          </div>
          <button onClick={guardar} disabled={isPending || !form.nombre.trim()}
            className="border border-ch-cream text-ch-cream hover:bg-ch-cream hover:text-ch-dark font-body text-[10px] tracking-[0.35em] uppercase px-6 py-2 transition-colors disabled:opacity-50">
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}

      {/* ─── Info rápida (cuando no edita) ──────────────────────────────── */}
      {!editando && (proyecto.descripcion || proyecto.notas) && (
        <div className="mb-6 space-y-2 text-sm">
          {proyecto.descripcion && (
            <div>
              <p className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em]">Descripción</p>
              <p className="font-body text-ch-cream mt-0.5">{proyecto.descripcion}</p>
            </div>
          )}
          {proyecto.notas && (
            <div>
              <p className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em]">Notas</p>
              <p className="font-body text-ch-cream/80 mt-0.5">{proyecto.notas}</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Secciones ──────────────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* MÉTRICAS */}
        <Seccion titulo="Métricas financieras" count={metricas.cotizaciones.length}>
          {/* Resumen */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6 pt-2">
            <MetricaBox label="Cotizado" valor={metricas.total_cotizado} />
            <MetricaBox label="Facturado" valor={metricas.total_facturado} />
            <MetricaBox label="Cobrado" valor={metricas.total_cobrado} />
            <MetricaBox label="Rendido" valor={metricas.total_rendido} />
            <MetricaBox label="Margen bruto" valor={metricas.margen_bruto} highlight />
          </div>

          {/* Tabla cotizaciones */}
          {metricas.cotizaciones.length === 0 ? (
            <p className="text-ch-muted font-body text-xs">Sin cotizaciones asociadas.</p>
          ) : (
            <div className="border border-ch-border/50">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-ch-border/50 px-3 py-2 hidden lg:grid">
                <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Cotización</span>
                <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Total</span>
                <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-center">N° Factura</span>
                <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-center">F. Factura</span>
                <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-center">F. Cobro</span>
              </div>
              {metricas.cotizaciones.map(c => (
                <Link
                  key={c.id}
                  href={`/cotizaciones/${c.id}`}
                  className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-ch-border/30 px-3 py-2.5 hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm text-ch-cream group-hover:text-white">{c.nombre}</span>
                    <span className="font-body text-[9px] tracking-widest uppercase text-ch-muted/60">
                      {COT_ESTADO_LABEL[c.estado] ?? c.estado}
                    </span>
                  </div>
                  <span className="font-body text-xs text-ch-cream lg:text-right">{formatCLP(c.total)}</span>
                  <span className="font-body text-xs text-ch-muted lg:text-center">{c.numero_factura ?? '—'}</span>
                  <span className="font-body text-xs text-ch-muted lg:text-center">{c.fecha_factura_emitida ?? '—'}</span>
                  <span className="font-body text-xs text-ch-muted lg:text-center">{c.fecha_pago_recibido ?? '—'}</span>
                </Link>
              ))}
            </div>
          )}
        </Seccion>

        {/* TAREAS */}
        <Seccion titulo="Tareas" count={tareasPendientes.length}>
          <div className="space-y-1 mb-4">
            {tareasPendientes.length === 0 && tareasCompletadas.length === 0 && (
              <p className="text-ch-muted font-body text-xs mb-3">Sin tareas registradas.</p>
            )}
            {[...tareasPendientes, ...tareasCompletadas].map(t => (
              <div key={t.id} className="flex items-center gap-3 py-1.5 border-b border-ch-border/30">
                <button
                  onClick={() => handleToggle(t)}
                  disabled={isPending}
                  className={`w-3.5 h-3.5 border flex-shrink-0 transition-colors ${
                    t.completada ? 'bg-ch-green border-ch-green' : 'border-ch-border hover:border-ch-cream'
                  }`}
                />
                <span className={`font-body text-sm flex-1 ${t.completada ? 'line-through text-ch-muted/50' : 'text-ch-cream'}`}>
                  {t.texto}
                </span>
                {confirmBorrarTarea === t.id ? (
                  <span className="flex items-center gap-2 text-xs font-body flex-shrink-0">
                    <button onClick={() => handleBorrarTarea(t.id)} disabled={isPending}
                      className="text-red-400 hover:text-red-300 uppercase tracking-widest transition-colors">Sí</button>
                    <button onClick={() => setConfirmBorrarTarea(null)}
                      className="text-ch-muted hover:text-ch-cream uppercase tracking-widest transition-colors">No</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmBorrarTarea(t.id)}
                    className="text-ch-muted/40 hover:text-red-400 font-body text-xs flex-shrink-0 transition-colors">✕</button>
                )}
              </div>
            ))}
          </div>

          {/* Agregar tarea */}
          <div className="flex gap-2 mt-2">
            <input
              value={textoTarea}
              onChange={e => setTextoTarea(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agregarTarea()}
              placeholder="Nueva tarea…"
              className="flex-1 bg-transparent border border-ch-border text-ch-cream font-body text-sm px-3 py-2 focus:outline-none focus:border-ch-cream transition-colors placeholder:text-ch-muted"
            />
            <button
              onClick={agregarTarea}
              disabled={isPending || !textoTarea.trim()}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-4 py-2 transition-colors disabled:opacity-40"
            >
              + Agregar
            </button>
          </div>
        </Seccion>

        {/* CONTACTOS */}
        {contactosCliente.length > 0 && (
          <Seccion titulo="Contactos del proyecto" count={contactosProyecto.length} defaultOpen={false}>
            {contactosProyecto.length === 0 && (
              <p className="text-ch-muted font-body text-xs mb-3">Sin contactos vinculados.</p>
            )}
            <div className="space-y-1 mb-4">
              {contactosProyecto.map(cp => {
                const c = cp.contacto!
                return (
                  <div key={cp.contacto_id} className="flex items-start justify-between py-2 border-b border-ch-border/30">
                    <div>
                      <p className="font-body text-sm text-ch-cream">
                        {c.nombre}
                        {c.cargo && <span className="text-ch-muted ml-2 text-xs">· {c.cargo}</span>}
                      </p>
                      <p className="font-body text-xs text-ch-muted mt-0.5">
                        {[c.email, c.telefono].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDesvincular(cp.contacto_id)}
                      disabled={isPending}
                      className="font-body text-[9px] tracking-widest uppercase text-ch-muted hover:text-red-400 transition-colors flex-shrink-0 ml-4"
                    >
                      Desvincular
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Contactos disponibles para vincular */}
            {contactosCliente.filter(c => !vinculadosIds.has(c.id)).length > 0 && (
              <div>
                <p className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] mb-2 mt-3">Agregar contacto del cliente</p>
                <div className="space-y-1">
                  {contactosCliente.filter(c => !vinculadosIds.has(c.id)).map(c => (
                    <div key={c.id} className="flex items-center justify-between py-1.5">
                      <div>
                        <span className="font-body text-sm text-ch-muted">{c.nombre}</span>
                        {c.cargo && <span className="text-ch-muted/50 ml-2 text-xs">· {c.cargo}</span>}
                      </div>
                      <button
                        onClick={() => handleVincular(c.id)}
                        disabled={isPending}
                        className="font-body text-[9px] tracking-widest uppercase text-ch-muted hover:text-ch-cream transition-colors flex-shrink-0 ml-4"
                      >
                        + Vincular
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Seccion>
        )}

      </div>
    </div>
  )
}

// ─── MetricaBox ──────────────────────────────────────────────────────────────
function MetricaBox({ label, valor, highlight }: { label: string; valor: number; highlight?: boolean }) {
  return (
    <div className={`border border-ch-border/40 p-3 ${highlight ? 'border-ch-cream/30' : ''}`}>
      <p className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] mb-1">{label}</p>
      <p className={`font-body text-sm font-medium ${highlight ? (valor >= 0 ? 'text-ch-green' : 'text-red-400') : 'text-ch-cream'}`}>
        {formatCLP(valor)}
      </p>
    </div>
  )
}
