'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { calcularRetencion } from '@/types'
import type { Rendicion } from '@/types'

function padRight(str: string, len: number) { return str.substring(0, len).padEnd(len, ' ') }
function padLeft(str: string, len: number) { return str.substring(0, len).padStart(len, '0') }

const BANCO_COD: Record<string, string> = {
  'Santander': '037', 'BancoEstado': '012', 'Banco Estado': '012',
  'Chile': '001', 'Banco de Chile': '001', 'BCI': '016',
  'Scotiabank': '014', 'Itaú': '039', 'BICE': '028',
  'Security': '049', 'Falabella': '051', 'Ripley': '053', 'Consorcio': '055',
}
const TIPO_CTA: Record<string, string> = { corriente: '01', vista: '02', ahorro: '03', rut: '02' }

function formatearRut(rut: string) {
  return rut.replace(/\./g, '').replace('-', '').replace('K', 'k').padStart(12, '0')
}

function generarLinea(r: Rendicion, rutEmpresa: string) {
  const col = r.colaborador as any
  const ret = r.tipo_documento ? calcularRetencion(r) : { neto: r.monto }
  const monto = ret.neto
  const rutDest = formatearRut(col?.rut || '0')
  const nombre = padRight(col?.nombre || r.nombre_libre || '', 40)
  const banco = BANCO_COD[col?.banco || ''] || '000'
  const tipoCta = TIPO_CTA[(col?.tipo_cuenta || '').toLowerCase()] || '01'
  const numCta = padRight(col?.numero_cuenta || '', 20)
  const montoStr = padLeft(Math.round(monto).toString(), 15)
  const rutEmp = padLeft(rutEmpresa.replace(/[.\-kK]/g, ''), 12)
  const linea = `03${rutEmp}${rutDest}${nombre}${banco}${tipoCta}${numCta}${montoStr}${padRight('CLP', 3)}${padRight(r.descripcion || '', 40)}${padRight('', 485)}`
  return linea.substring(0, 634)
}

interface Props {
  cotizaciones: { id: string; nombre: string; estado?: string; grupo?: any }[]
  rendiciones: Rendicion[]
  cotizacionFiltro?: string
}

export default function ExportSantander({ cotizaciones, rendiciones, cotizacionFiltro }: Props) {
  const router = useRouter()
  const [rutEmpresa, setRutEmpresa] = useState('76.123.456-7')

  const totalNeto = rendiciones.reduce((s, r) => {
    const ret = r.tipo_documento ? calcularRetencion(r) : { neto: r.monto }
    return s + ret.neto
  }, 0)

  const descargar = () => {
    const contenido = rendiciones.map(r => generarLinea(r, rutEmpresa)).join('\r\n')
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const nombre = cotizaciones.find(c => c.id === cotizacionFiltro)?.nombre || 'export'
    a.download = `santander_${nombre.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-4xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Cotización</label>
          <select
            value={cotizacionFiltro || ''}
            onChange={e => router.push(e.target.value ? `/rendiciones/admin/export?cotizacion=${e.target.value}` : '/rendiciones/admin/export')}
            className="input-ch w-full">
            <option value="">— Seleccionar cotización —</option>
            {cotizaciones.map(c => (
              <option key={c.id} value={c.id}>
                {c.grupo?.numero_base ? `${c.grupo.numero_base} · ` : ''}{c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">RUT empresa</label>
          <input value={rutEmpresa} onChange={e => setRutEmpresa(e.target.value)} placeholder="76.123.456-7" className="input-ch w-full" />
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
                  return (
                    <tr key={r.id} className="border-b border-ch-border/30">
                      <td className="font-body text-xs text-ch-cream py-2.5 pr-4">{col?.nombre || '—'}</td>
                      <td className="font-body text-[10px] text-ch-muted py-2.5 pr-4 font-mono">{col?.rut || '—'}</td>
                      <td className="font-body text-[10px] text-ch-muted py-2.5 pr-4">{col?.banco || '—'}</td>
                      <td className="font-body text-[10px] text-ch-muted py-2.5 pr-4 font-mono">{col?.numero_cuenta || '—'}</td>
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

          {rendiciones.some(r => !(r.colaborador as any)?.numero_cuenta) && (
            <div className="border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
              <p className="font-body text-xs text-amber-400">
                ⚠ Algunos colaboradores no tienen cuenta bancaria registrada.
              </p>
            </div>
          )}

          <button onClick={descargar}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-8 py-3 transition-colors">
            Descargar archivo Santander →
          </button>
        </>
      )}
    </div>
  )
}
