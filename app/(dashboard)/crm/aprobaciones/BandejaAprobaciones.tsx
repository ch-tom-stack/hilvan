'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resolverAprobacion, type AprobacionConProspecto } from '@/app/actions/crm'
import { ETAPA_PROSPECTO_LABELS, type EtapaProspecto } from '@/types'
import { CAMPOS_CORREGIBLES, LABEL_CAMPO, CAMPOS_OPCIONES } from '@/lib/crm-aprobaciones'
import { toastOk, toastError } from '@/lib/toast'
import { formatFecha } from '@/lib/fechas'

interface Props {
  aprobaciones: AprobacionConProspecto[]
}

// Orden de severidad: lo que requiere acción / crea cosas, primero.
const GRUPOS: { tipo: string; titulo: string; descripcion: string; verbo: string }[] = [
  { tipo: 'reasignacion',     titulo: 'Solicitudes de asignación', descripcion: 'Alguien del equipo pide llevar un prospecto', verbo: 'Asignar' },
  { tipo: 'prospecto_nuevo',  titulo: 'Leads nuevos detectados', descripcion: 'Altas propuestas (p. ej. desde correos)', verbo: 'Aprobar y crear' },
  { tipo: 'cambio_etapa',     titulo: 'Cambios de etapa sugeridos', descripcion: 'Movimientos propuestos en el pipeline', verbo: 'Aplicar' },
  { tipo: 'interaccion',      titulo: 'Interacciones sugeridas', descripcion: 'Toques propuestos para la bitácora', verbo: 'Aplicar' },
  { tipo: 'correo_borrador',  titulo: 'Borradores de correo', descripcion: 'Quedan como borrador en Gmail al aprobar', verbo: 'Aprobar' },
  { tipo: 'brief_cotizacion', titulo: 'Briefs de cotización', descripcion: 'Derivan al flujo de cotizaciones al aprobar', verbo: 'Derivar' },
]

export default function BandejaAprobaciones({ aprobaciones }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Guarda también la acción: la fila sale hacia adelante si se aprobó y se
  // hunde si se descartó. La dirección es la que lleva el significado.
  const [resolviendo, setResolviendo] = useState<{ id: string; accion: 'aprobado' | 'descartado' } | null>(null)

  const resolver = (id: string, accion: 'aprobado' | 'descartado', correcciones?: Record<string, string>) => {
    setResolviendo({ id, accion })
    startTransition(async () => {
      try {
        const res = await resolverAprobacion(id, accion, correcciones)
        if (res.error) { toastError(res.error); return }
        toastOk(accion === 'aprobado' ? 'Propuesta aplicada' : 'Propuesta descartada')
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al resolver')
      } finally {
        // Se suelta después de la salida (0.32s) para que la fila alcance a
        // irse; si el refresh llegó antes, la fila ya no existe y da igual.
        window.setTimeout(() => setResolviendo(null), 340)
      }
    })
  }

  const total = aprobaciones.length

  return (
    <>
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <Link href="/crm" className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors mb-2 inline-block">
            ← CRM
          </Link>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Bandeja de aprobación</h1>
          <p className="font-body text-sm text-ch-muted mt-2">
            {total === 0 ? 'Nada pendiente.' : `${total} ${total === 1 ? 'propuesta pendiente' : 'propuestas pendientes'}.`}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="border border-ch-border p-10 text-center">
          <p className="font-body text-sm text-ch-subtle">No hay propuestas esperando tu revisión.</p>
        </div>
      ) : (
        <div className="space-y-10 max-w-3xl">
          {GRUPOS.map(grupo => {
            const items = aprobaciones.filter(a => a.tipo === grupo.tipo)
            if (items.length === 0) return null
            return (
              <section key={grupo.tipo}>
                <div className="flex items-baseline gap-3 mb-4">
                  <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted">{grupo.titulo}</h2>
                  <span className="font-body text-[10px] text-ch-subtle">{items.length}</span>
                </div>
                <p className="font-body text-xs text-ch-subtle mb-4">{grupo.descripcion}</p>
                <div className="space-y-3">
                  {items.map(ap => (
                    <ItemAprobacion
                      key={ap.id}
                      ap={ap}
                      verbo={grupo.verbo}
                      ocupado={isPending && resolviendo?.id === ap.id}
                      saliendo={resolviendo?.id === ap.id ? resolviendo.accion : null}
                      onAprobar={(correcciones) => resolver(ap.id, 'aprobado', correcciones)}
                      onDescartar={() => resolver(ap.id, 'descartado')}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

function ItemAprobacion({
  ap, verbo, ocupado, saliendo, onAprobar, onDescartar,
}: {
  ap: AprobacionConProspecto
  verbo: string
  ocupado: boolean
  /** Si se resolvió, hacia dónde se va. null mientras sigue en la bandeja. */
  saliendo: 'aprobado' | 'descartado' | null
  onAprobar: (correcciones?: Record<string, string>) => void
  onDescartar: () => void
}) {
  const p: any = ap.payload ?? {}
  const titulo = ap.prospecto?.empresa ?? p.empresa ?? '—'

  // Corregir antes de aprobar. Nace de un caso real: un lead llegó con el correo
  // mal tipeado ("gmail.con"). Sin esto había que elegir entre crear el
  // prospecto con el dato malo o descartar y perder el lead.
  const campos = CAMPOS_CORREGIBLES[ap.tipo] ?? []
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState<Record<string, string>>({})

  const abrirEdicion = () => {
    const inicial: Record<string, string> = {}
    for (const c of campos) inicial[c] = p[c] ?? ''
    setBorrador(inicial)
    setEditando(true)
  }

  const hayCambios = Object.entries(borrador).some(([k, v]) => v.trim() !== (p[k] ?? ''))

  return (
    <div className={`border border-ch-border bg-ch-surface/30 p-5 ${
      saliendo === 'aprobado' ? 'ch-salir-ok' : saliendo === 'descartado' ? 'ch-salir-no' : 'ch-fade-up'
    }`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-display italic text-xl text-ch-cream leading-tight">{titulo}</h3>
        <span className="font-body text-[10px] text-ch-subtle shrink-0">{formatFecha(ap.created_at)}</span>
      </div>

      {editando ? (
        <div className="space-y-3">
          {campos.map(c => (
            <div key={c}>
              <label className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.2em] block mb-1">
                {LABEL_CAMPO[c] ?? c}
              </label>
              {CAMPOS_OPCIONES[c] ? (
                // Vocabulario cerrado: lista, no texto. Escribir "Moda" donde
                // el valor es `moda` deja el prospecto sin clasificar y sin
                // dueño, y no se nota hasta que no aparece en la lista de nadie.
                <select
                  value={borrador[c] ?? ''}
                  onChange={e => setBorrador({ ...borrador, [c]: e.target.value })}
                  className="w-full bg-ch-black border border-ch-border text-ch-cream font-body text-sm px-3 py-2 focus:border-ch-green outline-none rounded-[2px]"
                >
                  <option value="">—</option>
                  {CAMPOS_OPCIONES[c].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                </select>
              ) : c === 'cuerpo' ? (
                <textarea
                  value={borrador[c] ?? ''} rows={6}
                  onChange={e => setBorrador({ ...borrador, [c]: e.target.value })}
                  className="w-full bg-ch-black border border-ch-border text-ch-cream font-body text-sm px-3 py-2 focus:border-ch-green outline-none rounded-[2px]"
                />
              ) : (
                <input
                  type="text" value={borrador[c] ?? ''}
                  onChange={e => setBorrador({ ...borrador, [c]: e.target.value })}
                  className="w-full bg-ch-black border border-ch-border text-ch-cream font-body text-sm px-3 py-2 focus:border-ch-green outline-none rounded-[2px]"
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <PreviewPayload tipo={ap.tipo} payload={p} />
      )}

      {ap.nota_agente && (
        <p className="font-body text-xs text-ch-muted mt-3 border-l-2 border-ch-gold/50 pl-3">
          <span className="text-ch-subtle uppercase tracking-[0.15em] text-[9px]">Nota del agente · </span>
          {ap.nota_agente}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-ch-border">
        <button onClick={() => onAprobar(editando ? borrador : undefined)} disabled={ocupado}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 transition-colors disabled:opacity-50">
          {ocupado ? 'Procesando…' : editando && hayCambios ? `Corregir y ${verbo.toLowerCase()}` : verbo}
        </button>
        {campos.length > 0 && (
          <button onClick={() => (editando ? setEditando(false) : abrirEdicion())} disabled={ocupado}
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 transition-colors disabled:opacity-50">
            {editando ? 'Cancelar' : 'Corregir'}
          </button>
        )}
        <button onClick={onDescartar} disabled={ocupado}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 transition-colors disabled:opacity-50">
          Descartar
        </button>
      </div>
    </div>
  )
}

function PreviewPayload({ tipo, payload }: { tipo: string; payload: any }) {
  if (tipo === 'reasignacion') {
    return (
      <div className="font-body text-sm text-ch-cream space-y-1">
        <p>
          <span className="text-ch-muted">{payload.desde_nombre ?? 'Sin responsable'}</span>
          <span className="text-ch-subtle mx-2">→</span>
          <span className="text-ch-gold">{payload.hacia_nombre}</span>
        </p>
        {payload.motivo && <p className="text-xs text-ch-muted">{payload.motivo}</p>}
        {payload.pedido_por_nombre && (
          <p className="text-[11px] text-ch-subtle">Lo pide {payload.pedido_por_nombre}</p>
        )}
      </div>
    )
  }
  if (tipo === 'cambio_etapa') {
    const etapa = payload.etapa as EtapaProspecto
    return (
      <p className="font-body text-sm text-ch-cream">
        Mover a <span className="text-ch-gold">{ETAPA_PROSPECTO_LABELS[etapa] ?? etapa}</span>
      </p>
    )
  }
  if (tipo === 'interaccion') {
    return (
      <div className="font-body text-sm text-ch-cream space-y-1">
        {payload.resumen && <p>{payload.resumen}</p>}
        {payload.proximo_paso && <p className="text-xs text-ch-muted">Próximo: {payload.proximo_paso}{payload.fecha_proximo ? ` · ${formatFecha(payload.fecha_proximo)}` : ''}</p>}
      </div>
    )
  }
  if (tipo === 'correo_borrador') {
    return (
      <div className="font-body text-sm text-ch-cream whitespace-pre-wrap border border-ch-border/60 bg-ch-black/30 p-3 max-h-48 overflow-auto">
        {payload.asunto && <p className="text-ch-muted text-xs mb-2">Asunto: {payload.asunto}</p>}
        {payload.cuerpo ?? payload.texto ?? '(sin contenido)'}
      </div>
    )
  }
  if (tipo === 'brief_cotizacion') {
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-body text-sm">
        <Campo k="Producto" v={payload.producto_objetivo} />
        <Campo k="Arquetipo" v={payload.arquetipo} />
        <Campo k="Decisor" v={payload.decisor} />
        <Campo k="Ángulo" v={payload.angulo} />
        {payload.lectura?.dossier_ref && <Campo k="Lectura" v={payload.lectura.dossier_ref} />}
      </dl>
    )
  }
  // prospecto_nuevo
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-body text-sm">
      <Campo k="Contacto" v={payload.nombre_contacto} />
      <Campo k="Email" v={payload.email} />
      <Campo k="Origen" v={payload.origen} />
      <Campo k="Producto" v={payload.producto_objetivo} />
      <Campo k="Rubro" v={payload.rubro?.replace('_', ' ')} />
      <Campo k="Tamaño" v={payload.tamano} />
      <Campo k="Tipo de cliente" v={payload.tipo_cliente} />
    </dl>
  )
}

function Campo({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null
  return (
    <div>
      <dt className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.2em]">{k}</dt>
      <dd className="font-body text-sm text-ch-cream capitalize">{v}</dd>
    </div>
  )
}
