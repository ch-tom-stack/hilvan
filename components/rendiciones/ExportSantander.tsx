'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { calcularRetencion } from '@/types'
import type { RendicionGasto } from '@/types'
import { codigoBanco } from '@/lib/bancos'
import { glosaDeGasto, limpiarCuenta, type PagoPlanilla } from '@/lib/pagos-masivos'

// La fila sale de lib/pagos-masivos.ts (el mismo generador de Financiero →
// Transferencias masivas): código de banco CMF de 3 dígitos, RUT y cuenta
// limpios. Sin datos bancarios el servidor rechaza el archivo completo.
function buildPago(r: RendicionGasto): PagoPlanilla {
  const col = r.colaborador as any
  const ret = r.tipo_documento ? calcularRetencion(r) : { neto: r.monto }
  return {
    rut: col?.rut || r.rut_emisor || '',
    nombre: col?.nombre || r.nombre_libre || r.razon_social_emisor || '',
    banco_codigo: codigoBanco(col?.banco),
    numero_cuenta: limpiarCuenta(col?.numero_cuenta),
    monto: Math.round(ret.neto),
    glosa: glosaDeGasto(r as any) || r.descripcion || '',
    email: col?.email || null,
  }
}

interface Props {
  cotizaciones: { id: string; nombre: string; estado?: string; grupo?: any }[]
  rendiciones: RendicionGasto[]
  cotizacionFiltro?: string
}

export default function ExportSantander({ cotizaciones, rendiciones, cotizacionFiltro }: Props) {
  const router = useRouter()
  const [cuentaOrigen, setCuentaOrigen] = useState('000084616290')
  const [rutEmpresa, setRutEmpresa] = useState('77.151.117-1')

  const totalNeto = rendiciones.reduce((s, r) => {
    const ret = r.tipo_documento ? calcularRetencion(r) : { neto: r.monto }
    return s + ret.neto
  }, 0)

  const descargar = async () => {
    try {
      const filas = rendiciones.map(buildPago)
      const nombre = cotizaciones.find(c => c.id === cotizacionFiltro)?.nombre || 'export'

      const res = await fetch('/api/rendiciones/santander-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagos: filas, nombre, cuenta_origen: cuentaOrigen }),
      })

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error desconocido' }))
        toastError(error || 'Error al generar archivo')
        momento('error', { mensaje: error || 'Error al generar archivo' })
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
        ?? `santander_${nombre}_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      // El navegador descarga en silencio: sin esto no hay señal de que el
      // archivo se generó, y la tentación es volver a apretar.
      momento('subido', { mensaje: `Archivo generado · ${filas.length} filas` })
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al descargar')
      momento('error', { mensaje: 'Error al descargar' })
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-1">
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Cotización</label>
          <select
            value={cotizacionFiltro || ''}
            onChange={e => router.push(e.target.value ? `/costos/admin/export?cotizacion=${e.target.value}` : '/costos/admin/export')}
            className="input-ch w-full">
            <option value="">— Seleccionar —</option>
            {cotizaciones.map(c => (
              <option key={c.id} value={c.id}>
                {c.grupo?.numero_base ? `${c.grupo.numero_base} · ` : ''}{c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Cuenta origen Casa Hiedra</label>
          <input value={cuentaOrigen} onChange={e => setCuentaOrigen(e.target.value)}
            placeholder="Nº de cuenta Santander" className="input-ch w-full" />
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">RUT empresa</label>
          <input value={rutEmpresa} onChange={e => setRutEmpresa(e.target.value)}
            placeholder="76.XXX.XXX-X" className="input-ch w-full" />
        </div>
      </div>

      {!cotizacionFiltro && (
        <div className="border border-dashed border-ch-border p-12 text-center">
          <p className="text-ch-muted font-body text-sm">Selecciona una cotización para generar el archivo.</p>
        </div>
      )}

      {cotizacionFiltro && rendiciones.length === 0 && (
        <div className="border border-dashed border-ch-border p-12 text-center">
          <p className="text-ch-muted font-body text-sm">No hay rendiciones aprobadas en esta cotización.</p>
        </div>
      )}

      {cotizacionFiltro && rendiciones.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Transferencias', value: rendiciones.length, mono: false },
              { label: 'Total bruto', value: `$${rendiciones.reduce((s, r) => s + r.monto, 0).toLocaleString('es-CL')}`, mono: true },
              { label: 'Total neto', value: `$${totalNeto.toLocaleString('es-CL')}`, mono: true },
            ].map(s => (
              <div key={s.label} className="border border-ch-border p-4">
                <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">{s.label}</p>
                <p className={`font-body text-2xl text-ch-cream ${s.mono ? 'font-mono' : ''}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto mb-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ch-border">
                  {['Colaborador', 'RUT', 'Banco', 'Cuenta', 'Bruto', 'Ret.', 'Neto'].map(h => (
                    <th key={h} className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-muted text-left pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rendiciones.map(r => {
                  const col = r.colaborador as any
                  const ret = r.tipo_documento ? calcularRetencion(r) : { retencion: 0, neto: r.monto }
                  const faltaDatos = !col?.numero_cuenta || !col?.banco || !col?.rut
                  return (
                    <tr key={r.id} className={`border-b border-ch-border/30 ${faltaDatos ? 'bg-amber-500/5' : ''}`}>
                      <td className="font-body text-xs text-ch-cream py-2.5 pr-4">{col?.nombre || '—'}</td>
                      <td className="font-body text-[10px] text-ch-muted py-2.5 pr-4 font-mono">{col?.rut || '—'}</td>
                      <td className="font-body text-[10px] text-ch-muted py-2.5 pr-4">{col?.banco || <span className="text-amber-400">sin banco</span>}</td>
                      <td className="font-body text-[10px] text-ch-muted py-2.5 pr-4 font-mono">{col?.numero_cuenta || <span className="text-amber-400">sin cuenta</span>}</td>
                      <td className="font-body text-[10px] text-ch-muted py-2.5 pr-4 font-mono">${r.monto.toLocaleString('es-CL')}</td>
                      <td className="font-body text-[10px] text-red-400 py-2.5 pr-4 font-mono">
                        {ret.retencion > 0 ? `-$${ret.retencion.toLocaleString('es-CL')}` : '—'}
                      </td>
                      <td className="font-body text-xs text-ch-green py-2.5 font-mono">${ret.neto.toLocaleString('es-CL')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {rendiciones.some(r => {
            const col = r.colaborador as any
            return !col?.numero_cuenta || !col?.banco || !col?.rut
          }) && (
            <div className="border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
              <p className="font-body text-xs text-amber-400">
                ⚠ Algunos colaboradores no tienen banco, cuenta o RUT registrado. Completa sus fichas antes de exportar.
              </p>
            </div>
          )}

          {!cuentaOrigen && (
            <div className="border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
              <p className="font-body text-xs text-amber-400">
                ⚠ Ingresa la cuenta de origen de Casa Hiedra antes de exportar.
              </p>
            </div>
          )}

          <button
            onClick={descargar}
            disabled={!cuentaOrigen}
            className="bg-ch-green hover:bg-ch-green-light disabled:opacity-40 disabled:cursor-not-allowed text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-8 py-3 transition-colors">
            Descargar Excel Santander →
          </button>
        </>
      )}
    </div>
  )
}
