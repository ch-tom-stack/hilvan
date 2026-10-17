'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatCLP } from '@/types'
import { toastError, toastOk } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { BANCOS, nombreBanco } from '@/lib/bancos'
import { rutConPuntos } from '@/lib/pagos-masivos'
import {
  agregarPagoLibre, anularPagoMasivo, asignarCuentaPago, crearLoteMasivo, editarPagoMasivo, eliminarLoteMasivo,
  type DatosMasivas,
} from '@/app/actions/pagos'
import type { Lote, ItemLote } from '@/lib/pagos-masivos-io'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const ESTADO_LOTE: Record<Lote['estado'], { label: string; cls: string }> = {
  borrador: { label: 'Borrador', cls: 'border-ch-border text-ch-muted' },
  generado: { label: 'Planilla descargada', cls: 'border-ch-gold/50 text-ch-gold' },
  cerrado: { label: 'Pagado completo', cls: 'border-ch-green/50 text-ch-green' },
}

function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

const label = 'font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted'
const boton = 'border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.3em] uppercase px-4 py-2 transition-colors disabled:opacity-40 ch-press'
const botonVerde = 'bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ch-press'

export default function TransferenciasMasivas({ datos, loteAbierto }: { datos: DatosMasivas; loteAbierto?: string }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [fecha, setFecha] = useState(hoy())
  const [nombre, setNombre] = useState('')
  const [conNomina, setConNomina] = useState(false)
  const [gastosSel, setGastosSel] = useState<Set<string>>(new Set())

  const mes = MESES[Number(fecha.slice(5, 7)) - 1]
  const totalNuevo = useMemo(() =>
    (conNomina ? datos.nomina.reduce((s, p) => s + p.monto, 0) : 0) +
    datos.gastos.filter(g => gastosSel.has(`${g.tabla}:${g.id}`)).reduce((s, g) => s + g.neto, 0),
  [conNomina, gastosSel, datos])

  function correr(fn: () => Promise<{ error?: string; rechazados?: string[] } | void>, ok?: string) {
    startTransition(async () => {
      try {
        const r = await fn()
        if (r && r.error) { toastError(r.error); momento('error', { mensaje: r.error }); return }
        if (r && r.rechazados?.length) toastError(`Quedaron fuera: ${r.rechazados.join('; ')}`)
        if (ok) toastOk(ok)
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error')
      }
    })
  }

  function armar() {
    const gastos = datos.gastos.filter(g => gastosSel.has(`${g.tabla}:${g.id}`)).map(g => ({ tabla: g.tabla, id: g.id }))
    correr(async () => {
      const r = await crearLoteMasivo({ nombre: nombre || undefined, fecha, nomina: conNomina, gastos })
      if (!r.error) { setConNomina(false); setGastosSel(new Set()); setNombre('') }
      return r
    }, 'Lote armado')
  }

  return (
    <div className="space-y-14 max-w-5xl">
      {/* ── Nuevo lote ─────────────────────────────────────────────────── */}
      <section className="border border-ch-border p-5 space-y-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className={label}>Nuevo lote</p>
            <p className="font-body text-[10px] text-ch-muted mt-1">
              Elige qué pagar. Hilván pone la cuenta de cada persona (la que el banco ya confirmó) y arma la planilla para Office Banking.
            </p>
          </div>
          <span className="font-mono text-sm text-ch-cream">{formatCLP(totalNuevo)}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={`${label} block mb-1.5`}>Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder={`Transferencia masiva ${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`} className="input-ch w-full" />
          </div>
          <div>
            <label className={`${label} block mb-1.5`}>Fecha de pago</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value || hoy())} className="input-ch w-full" />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={conNomina} onChange={e => setConNomina(e.target.checked)} />
            <span className="font-body text-xs text-ch-cream">Nómina de {mes}</span>
            <span className="font-mono text-[10px] text-ch-muted">{formatCLP(datos.nomina.reduce((s, p) => s + p.monto, 0))}</span>
          </label>
          <div className="ml-6 mt-1.5 space-y-0.5">
            {datos.nomina.map(p => (
              <p key={p.nombre} className="font-body text-[10px] text-ch-muted">
                {p.nombre} · {formatCLP(p.monto)} · {p.tipo === 'contrato' ? 'contrato' : 'BH'}
                {!p.rut ? <span className="text-ch-gold"> · sin RUT (agrégalo en Estado de resultados → Nómina)</span>
                  : !p.tiene_cuenta ? <span className="text-ch-gold"> · sin cuenta conocida</span> : null}
              </p>
            ))}
          </div>
        </div>

        <div>
          <p className={`${label} mb-2`}>Boletas y gastos por pagar ({datos.gastos.length})</p>
          {datos.gastos.length === 0 ? (
            <p className="font-body text-[10px] text-ch-muted">No hay gastos aprobados sin pagar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody>
                  {datos.gastos.map(g => {
                    const k = `${g.tabla}:${g.id}`
                    return (
                      <tr key={k} className="border-b border-ch-border/30">
                        <td className="py-1.5 pr-3 w-6">
                          <input type="checkbox" checked={gastosSel.has(k)} onChange={e => setGastosSel(prev => {
                            const n = new Set(prev); if (e.target.checked) n.add(k); else n.delete(k); return n
                          })} />
                        </td>
                        <td className="font-body text-xs text-ch-cream py-1.5 pr-3">{g.proveedor}</td>
                        <td className="font-body text-[10px] text-ch-muted py-1.5 pr-3">{g.contexto}</td>
                        <td className="font-body text-[10px] text-ch-muted py-1.5 pr-3">{g.glosa}</td>
                        <td className="font-body text-[10px] py-1.5 pr-3 whitespace-nowrap">
                          {!g.rut ? <span className="text-ch-gold">sin RUT</span> : !g.tiene_cuenta ? <span className="text-ch-gold">sin cuenta</span> : <span className="text-ch-subtle">{rutConPuntos(g.rut)}</span>}
                        </td>
                        <td className="font-mono text-xs text-ch-cream py-1.5 text-right">{formatCLP(g.neto)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <button onClick={armar} disabled={pendiente || (!conNomina && gastosSel.size === 0)} className={botonVerde}>
          Armar lote →
        </button>
      </section>

      {/* ── Lotes ──────────────────────────────────────────────────────── */}
      <section className="space-y-8">
        <p className={label}>Lotes</p>
        {datos.lotes.length === 0 && (
          <div className="border border-dashed border-ch-border p-10 text-center">
            <p className="text-ch-muted font-body text-sm">Todavía no hay lotes.</p>
          </div>
        )}
        {datos.lotes.map(l => (
          <TarjetaLote key={l.id} lote={l} abierto={loteAbierto ? loteAbierto === l.id : l.estado !== 'cerrado'} correr={correr} pendiente={pendiente} />
        ))}
      </section>

      {datos.cuentasSinColaborador > 0 && (
        <p className="font-body text-[10px] text-ch-muted border-t border-ch-border pt-4">
          Hay {datos.cuentasSinColaborador} persona(s) o empresa(s) a las que ya se les transfirió y que no están en Colaboradores.
          El operador las puede dar de alta con sus datos bancarios (hilvan_cuentas_bancarias → hilvan_colaborador_guardar).
        </p>
      )}
    </div>
  )
}

type Correr = (fn: () => Promise<{ error?: string; rechazados?: string[] } | void>, ok?: string) => void

function TarjetaLote({ lote, abierto: abiertoInicial, correr, pendiente }: { lote: Lote; abierto: boolean; correr: Correr; pendiente: boolean }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [libre, setLibre] = useState({ rut: '', nombre: '', monto: '', glosa: '' })
  const est = ESTADO_LOTE[lote.estado]
  const vivos = lote.items.filter(i => i.estado !== 'anulado')
  const porMandar = vivos.filter(i => i.estado === 'pendiente')
  const conError = porMandar.filter(i => i.errores.length)

  async function descargar() {
    try {
      const res = await fetch(`/api/pagos/lotes/${lote.id}/planilla`)
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'No se pudo generar la planilla' }))
        toastError(error)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = decodeURIComponent(res.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? '') || `${lote.nombre}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      momento('subido', { mensaje: `Planilla lista · ${porMandar.length} pagos` })
      correr(async () => {}, undefined)
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al descargar')
    }
  }

  return (
    <div className="border border-ch-border">
      <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center justify-between gap-4 p-4 text-left flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-body text-sm text-ch-cream">{lote.nombre}</span>
          <span className="font-body text-[10px] text-ch-muted">{lote.fecha.split('-').reverse().join('-')}</span>
          <span className={`border font-body text-[9px] tracking-[0.25em] uppercase px-2 py-0.5 ${est.cls}`}>{est.label}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-body text-[10px] text-ch-muted">{vivos.filter(i => i.estado === 'pagado').length}/{vivos.length} pagados</span>
          <span className="font-mono text-sm text-ch-cream">{formatCLP(lote.total)}</span>
        </div>
      </button>

      {abierto && (
        <div className="border-t border-ch-border p-4 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ch-border">
                  {['Destinatario', 'Cuenta', 'Glosa', 'Monto', 'Estado', ''].map(h => (
                    <th key={h} className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-muted text-left pb-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lote.items.map(i => <FilaPago key={i.id} item={i} correr={correr} pendiente={pendiente} />)}
              </tbody>
            </table>
          </div>

          {lote.estado !== 'cerrado' && (
            <div className="flex items-end gap-2 flex-wrap">
              <input value={libre.rut} onChange={e => setLibre({ ...libre, rut: e.target.value })} placeholder="RUT" className="input-ch w-32" />
              <input value={libre.nombre} onChange={e => setLibre({ ...libre, nombre: e.target.value })} placeholder="Nombre (si es nuevo)" className="input-ch w-44" />
              <input value={libre.monto} onChange={e => setLibre({ ...libre, monto: e.target.value.replace(/\D/g, '') })} placeholder="Monto" className="input-ch w-28 font-mono" />
              <input value={libre.glosa} onChange={e => setLibre({ ...libre, glosa: e.target.value })} placeholder="Glosa (ej. BH 549)" className="input-ch w-40" />
              <button className={boton} disabled={pendiente || !libre.rut || !libre.monto}
                onClick={() => correr(async () => {
                  const r = await agregarPagoLibre(lote.id, { rut: libre.rut, nombre: libre.nombre, monto: Number(libre.monto), glosa: libre.glosa })
                  if (!r.error) setLibre({ rut: '', nombre: '', monto: '', glosa: '' })
                  return r
                }, 'Pago agregado')}>
                + Agregar pago
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap pt-2">
            {porMandar.length > 0 && (
              <button onClick={descargar} disabled={pendiente || conError.length > 0} className={botonVerde}
                title={conError.length ? 'Hay pagos con errores: corrígelos o anúlalos' : undefined}>
                Descargar planilla ({porMandar.length}) →
              </button>
            )}
            {!lote.items.some(i => i.estado === 'pagado') && (
              <button className={boton} disabled={pendiente}
                onClick={() => { if (confirm(`¿Borrar el lote "${lote.nombre}"?`)) correr(() => eliminarLoteMasivo(lote.id), 'Lote borrado') }}>
                Borrar lote
              </button>
            )}
            {conError.length > 0 && <span className="font-body text-[10px] text-red-400">{conError.length} pago(s) con errores: no se puede generar la planilla.</span>}
          </div>
          {lote.estado === 'generado' && porMandar.length > 0 && (
            <p className="font-body text-[10px] text-ch-muted">
              Cuando Santander mande el aviso de cada transferencia (o llegue la cartola), el pago se marca solo como pagado y su boleta queda pagada.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function FilaPago({ item, correr, pendiente }: { item: ItemLote; correr: Correr; pendiente: boolean }) {
  const [editando, setEditando] = useState(false)
  const [monto, setMonto] = useState(String(item.monto))
  const [glosa, setGlosa] = useState(item.glosa ?? '')
  const [banco, setBanco] = useState('')
  const [cuenta, setCuenta] = useState('')
  const anulado = item.estado === 'anulado'
  const pagado = item.estado === 'pagado'
  const sinCuenta = !item.banco_codigo || !item.numero_cuenta

  return (
    <>
      <tr className={`border-b border-ch-border/30 align-top ${anulado ? 'opacity-40' : ''}`}>
        <td className="py-2 pr-3">
          <p className="font-body text-xs text-ch-cream">{item.nombre}</p>
          <p className="font-mono text-[10px] text-ch-subtle">{rutConPuntos(item.rut)}</p>
        </td>
        <td className="font-body text-[10px] text-ch-muted py-2 pr-3">
          {sinCuenta ? <span className="text-ch-gold">sin cuenta</span> : <>{nombreBanco(item.banco_codigo)}<br /><span className="font-mono">{item.numero_cuenta}</span></>}
        </td>
        <td className="font-body text-[10px] text-ch-muted py-2 pr-3">
          {editando ? <input value={glosa} onChange={e => setGlosa(e.target.value)} className="input-ch w-32" /> : (item.glosa || '—')}
        </td>
        <td className="font-mono text-xs text-ch-cream py-2 pr-3 whitespace-nowrap">
          {editando ? <input value={monto} onChange={e => setMonto(e.target.value.replace(/\D/g, ''))} className="input-ch w-24 font-mono" /> : formatCLP(item.monto)}
        </td>
        <td className="font-body text-[10px] py-2 pr-3 whitespace-nowrap">
          {pagado ? <span className="text-ch-green">pagado {item.pagado_en?.split('-').reverse().join('-')}</span>
            : anulado ? <span className="text-ch-muted">anulado</span>
            : <span className="text-ch-gold">pendiente</span>}
        </td>
        <td className="py-2 whitespace-nowrap text-right">
          {!pagado && (
            <div className="flex gap-3 justify-end">
              {!anulado && (editando ? (
                <button disabled={pendiente} className="font-body text-[10px] text-ch-green hover:text-ch-green-light ch-press"
                  onClick={() => correr(async () => { const r = await editarPagoMasivo(item.id, { monto: Number(monto), glosa }); if (!r.error) setEditando(false); return r })}>
                  guardar
                </button>
              ) : (
                <button className="font-body text-[10px] text-ch-subtle hover:text-ch-cream ch-press" onClick={() => setEditando(true)}>editar</button>
              ))}
              <button disabled={pendiente} className="font-body text-[10px] text-ch-subtle hover:text-ch-cream ch-press"
                onClick={() => correr(() => anularPagoMasivo(item.id, !anulado))}>
                {anulado ? 'reactivar' : 'anular'}
              </button>
            </div>
          )}
        </td>
      </tr>
      {!anulado && !pagado && (item.errores.length > 0 || item.avisos.length > 0 || sinCuenta) && (
        <tr className="border-b border-ch-border/30">
          <td colSpan={6} className="pb-2 pt-0">
            {item.errores.map(e => <p key={e} className="font-body text-[10px] text-red-400">✕ {e}</p>)}
            {item.avisos.map(a => <p key={a} className="font-body text-[10px] text-ch-gold">! {a}</p>)}
            {sinCuenta && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <select value={banco} onChange={e => setBanco(e.target.value)} className="input-ch w-40">
                  <option value="">— Banco —</option>
                  {BANCOS.map(b => <option key={b.codigo} value={b.codigo}>{b.nombre}</option>)}
                </select>
                <input value={cuenta} onChange={e => setCuenta(e.target.value)} placeholder="N° de cuenta" className="input-ch w-40 font-mono" />
                <button className={boton} disabled={pendiente || !banco || !cuenta}
                  onClick={() => correr(() => asignarCuentaPago(item.id, { banco_codigo: banco, numero_cuenta: cuenta }), 'Cuenta guardada')}>
                  Guardar cuenta
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
