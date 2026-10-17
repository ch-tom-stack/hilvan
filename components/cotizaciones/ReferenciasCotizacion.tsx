'use client'

// Sección "Referencias" del Panel de facturación: OC, HES y otras referencias que
// irán a la factura. Las propuestas (que detectó el operador en el correo) se
// confirman acá con un botón; las escritas a mano quedan confirmadas.

import { useCallback, useEffect, useState } from 'react'
import { toastError, toastOk } from '@/lib/toast'
import { formatCLP } from '@/lib/cotizaciones-calc'
import { parseFechaLocal } from '@/lib/fechas'
import { EVENTO_HISTORIAL } from '@/components/ui/AtajosGlobales'
import {
  agregarReferencia,
  confirmarReferencia,
  eliminarReferencia,
  listarReferencias,
  type ReferenciasCotizacion as Datos,
} from '@/app/actions/cotizacion-referencias'
import { ETIQUETA_REFERENCIA, TIPOS_REFERENCIA, type EstadoRef, type Referencia, type TipoReferencia } from '@/lib/cotizacion-referencias'

const VACIO = { tipo: 'oc' as TipoReferencia, folio: '', fecha: '', monto: '', glosa: '' }

const fecha = (s: string | null) => (s ? parseFechaLocal(s).toLocaleDateString('es-CL') : '—')

function Marca({ que, estado }: { que: string; estado: EstadoRef }) {
  if (estado === 'no_aplica') return null
  const estilo: Record<Exclude<EstadoRef, 'no_aplica'>, string> = {
    confirmada: 'border-ch-green/50 text-ch-green',
    propuesta: 'border-ch-gold/60 text-ch-gold',
    falta: 'border-ch-border text-ch-muted',
  }
  const texto = { confirmada: '✓', propuesta: 'por confirmar', falta: 'falta' }[estado]
  return (
    <span className={`font-body text-[9px] tracking-[0.2em] uppercase border px-1.5 py-0.5 rounded-[2px] ${estilo[estado]}`}>
      {que} · {texto}
    </span>
  )
}

export default function ReferenciasCotizacion({ cotizacionId }: { cotizacionId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [form, setForm] = useState(VACIO)
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<string | null>(null) // id de la propuesta que se completa
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setDatos(await listarReferencias(cotizacionId))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'No se pudieron cargar las referencias')
    }
  }, [cotizacionId])

  useEffect(() => {
    cargar()
    const recargar = () => { cargar() }
    window.addEventListener(EVENTO_HISTORIAL, recargar)
    return () => window.removeEventListener(EVENTO_HISTORIAL, recargar)
  }, [cargar])

  async function correr(fn: () => Promise<void>, ok: string) {
    setOcupado(true)
    try {
      await fn()
      toastOk(ok)
      setForm(VACIO)
      setAbierto(false)
      setEditando(null)
      await cargar()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setOcupado(false)
    }
  }

  function completar(r: Referencia) {
    setEditando(r.id)
    setAbierto(true)
    setForm({ tipo: r.tipo, folio: r.folio ?? '', fecha: r.fecha ?? '', monto: r.monto ? String(r.monto) : '', glosa: r.glosa ?? '' })
  }

  function guardar() {
    const valores = { tipo: form.tipo, folio: form.folio, fecha: form.fecha, monto: form.monto, glosa: form.glosa }
    if (editando) correr(() => confirmarReferencia(editando, valores), 'Referencia confirmada')
    else correr(() => agregarReferencia(cotizacionId, valores), 'Referencia agregada')
  }

  if (!datos) return <p className="font-body text-[10px] text-ch-subtle">Cargando referencias…</p>

  const { estado } = datos
  const referencias = datos.referencias.filter((r) => r.estado !== 'descartada')
  const propuestas = referencias.filter((r) => r.estado === 'propuesta')
  const confirmadas = referencias.filter((r) => r.estado === 'confirmada')

  return (
    <div className="space-y-3 border-t border-ch-border/40 pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Referencias</p>
        <div className="flex gap-1.5 flex-wrap">
          <Marca que="OC" estado={estado.oc} />
          <Marca que="HES" estado={estado.hes} />
        </div>
      </div>

      {propuestas.map((r) => (
        <div key={r.id} className="border border-ch-gold/40 rounded-[2px] p-2.5 space-y-2">
          <p className="font-body text-xs text-ch-cream">
            {ETIQUETA_REFERENCIA[r.tipo]} {r.folio ?? <span className="text-ch-gold">sin número</span>}
            <span className="text-ch-muted"> · {fecha(r.fecha)}</span>
          </p>
          <p className="font-body text-[10px] text-ch-muted leading-relaxed">
            Detectada en el correo{r.correo_fecha ? ` del ${new Date(r.correo_fecha).toLocaleDateString('es-CL')}` : ''}
            {r.correo_remitente ? ` de ${r.correo_remitente}` : ''}
            {r.correo_asunto ? ` — "${r.correo_asunto}"` : ''}
            {r.nota ? `. ${r.nota}` : ''}
          </p>
          <div className="flex gap-2 flex-wrap">
            {r.folio && r.fecha ? (
              <button disabled={ocupado} onClick={() => correr(() => confirmarReferencia(r.id), 'Referencia confirmada')}
                className="border border-ch-green/60 text-ch-green hover:bg-ch-green/10 font-body text-[9px] tracking-[0.3em] uppercase px-3 py-1.5 disabled:opacity-40 ch-press">
                Confirmar
              </button>
            ) : null}
            <button disabled={ocupado} onClick={() => completar(r)}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.3em] uppercase px-3 py-1.5 disabled:opacity-40 ch-press">
              {r.folio && r.fecha ? 'Corregir' : 'Escribir número'}
            </button>
            <button disabled={ocupado} onClick={() => correr(() => eliminarReferencia(r.id), 'Propuesta descartada')}
              className="text-ch-subtle hover:text-ch-cream font-body text-[9px] tracking-[0.3em] uppercase px-2 py-1.5 disabled:opacity-40">
              Descartar
            </button>
          </div>
        </div>
      ))}

      {confirmadas.length > 0 && (
        <ul className="space-y-1">
          {confirmadas.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="font-body text-xs text-ch-cream min-w-0 truncate">
                {ETIQUETA_REFERENCIA[r.tipo]} {r.folio}
                <span className="text-ch-muted"> · {fecha(r.fecha)}{r.monto ? ` · ${formatCLP(r.monto)}` : ''}</span>
              </span>
              <span className="flex gap-2 shrink-0">
                <button disabled={ocupado} onClick={() => completar(r)} className="font-body text-[9px] text-ch-subtle hover:text-ch-cream uppercase tracking-[0.2em]">
                  editar
                </button>
                <button disabled={ocupado} onClick={() => correr(() => eliminarReferencia(r.id), 'Referencia eliminada')} className="font-body text-[9px] text-ch-subtle hover:text-ch-cream uppercase tracking-[0.2em]">
                  quitar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {referencias.length === 0 && !abierto && (
        <p className="font-body text-[10px] text-ch-subtle">
          Sin referencias. {estado.oc === 'falta' || estado.hes === 'falta' ? 'Este cliente pide OC' + (estado.hes === 'falta' ? ' y HES' : '') + ' para facturar.' : ''}
        </p>
      )}

      {abierto ? (
        <div className="space-y-2 border border-ch-border/60 rounded-[2px] p-2.5">
          <div className="flex gap-2 flex-wrap">
            <div className="w-[120px]">
              <label htmlFor="ref-tipo" className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Tipo</label>
              <select id="ref-tipo" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoReferencia }))} className="input-ch w-full text-sm">
                {TIPOS_REFERENCIA.map((t) => <option key={t} value={t}>{ETIQUETA_REFERENCIA[t]}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <label htmlFor="ref-folio" className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Número *</label>
              <input id="ref-folio" type="text" maxLength={18} value={form.folio} onChange={(e) => setForm((f) => ({ ...f, folio: e.target.value }))} className="input-ch w-full text-sm" placeholder="Ej: 6001807651" />
            </div>
            <div className="w-[150px]">
              <label htmlFor="ref-fecha" className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Fecha *</label>
              <input id="ref-fecha" type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} className="input-ch w-full text-sm" />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="w-[150px]">
              <label htmlFor="ref-monto" className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Monto neto</label>
              <input id="ref-monto" type="number" min={0} value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} className="input-ch w-full text-sm" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label htmlFor="ref-glosa" className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Glosa de la OC</label>
              <input id="ref-glosa" type="text" value={form.glosa} onChange={(e) => setForm((f) => ({ ...f, glosa: e.target.value }))} className="input-ch w-full text-sm" placeholder="El texto de la línea, para copiarlo en la factura" />
            </div>
          </div>
          <div className="flex gap-2">
            <button disabled={ocupado || !form.folio || !form.fecha} onClick={guardar}
              className="border border-ch-green/60 text-ch-green hover:bg-ch-green/10 font-body text-[9px] tracking-[0.3em] uppercase px-3 py-1.5 disabled:opacity-40 ch-press">
              {editando ? 'Confirmar' : 'Agregar'}
            </button>
            <button disabled={ocupado} onClick={() => { setAbierto(false); setEditando(null); setForm(VACIO) }}
              className="text-ch-subtle hover:text-ch-cream font-body text-[9px] tracking-[0.3em] uppercase px-2 py-1.5">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAbierto(true)} className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream">
          + Agregar referencia
        </button>
      )}
    </div>
  )
}
