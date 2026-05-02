'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { calcularRetencion } from '@/types'
import type { Rendicion } from '@/types'

// Formato Santander: línea de 634 caracteres, campo fijo
// Campos principales: tipo_registro(2), rut_empresa(12), rut_destino(12), nombre(40),
// banco_destino(3), tipo_cuenta(2), numero_cuenta(20), monto(15), ...
function padRight(str: string, len: number) {
  return str.substring(0, len).padEnd(len, ' ')
}
function padLeft(str: string, len: number) {
  return str.substring(0, len).padStart(len, '0')
}

// Mapeo bancos Chile → código Santander
const BANCO_COD: Record<string, string> = {
  'Santander': '037',
  'BancoEstado': '012',
  'Banco Estado': '012',
  'Chile': '001',
  'Banco de Chile': '001',
  'BCI': '016',
  'Scotiabank': '014',
  'Itaú': '039',
  'BICE': '028',
  'Security': '049',
  'Falabella': '051',
  'Ripley': '053',
  'Consorcio': '055',
}

const TIPO_CTA: Record<string, string> = {
  'corriente': '01',
  'vista': '02',
  'ahorro': '03',
  'rut': '02',
}

function formatearRut(rut: string) {
  return rut.replace(/\./g, '').replace('-', '').replace('K', 'k').padStart(12, '0')
}

function generarLineaSantander(r: Rendicion, rutEmpresa: string) {
  const col = r.colaborador as any
  const retencion = r.tipo_documento ? calcularRetencion(r) : { neto: r.monto }
  const monto = retencion.neto

  const rutDest = formatearRut(col?.rut || '0')
  const nombre = padRight(col?.nombre || r.nombre_libre || '', 40)
  const banco = BANCO_COD[col?.banco || ''] || '000'
  const tipoCta = TIPO_CTA[(col?.tipo_cuenta || '').toLowerCase()] || '01'
  const numCta = padRight(col?.numero_cuenta || '', 20)
  const montoStr = padLeft(Math.round(monto).toString(), 15)

  // Línea de 634 chars (simplificado — formato Santander TEF masivo)
  const linea = [
    '03',                              // tipo_registro (2)
    padLeft(rutEmpresa.replace(/[.\-kK]/g, ''), 12), // rut empresa (12)
    rutDest,                           // rut destino (12)
    nombre,                            // nombre (40)
    banco,                             // banco (3)
    tipoCta,                           // tipo cuenta (2)
    numCta,                            // numero cuenta (20)
    montoStr,                          // monto (15)
    padRight('CLP', 3),                // moneda (3)
    padRight(r.descripcion || '', 40), // glosa (40)
    padRight('', 485),                 // relleno hasta 634
  ].join('')

  return linea.substring(0, 634)
}

interface Props {
  rodajes: { id: string; nombre: string; fecha?: string }[]
  rendiciones: Rendicion[]
  rodajeFiltro?: string
}

export default function ExportSantander({ rodajes, rendiciones, rodajeFiltro }: Props) {
  const router = useRouter()
  const [rutEmpresa, setRutEmpresa] = useState('76.123.456-7')

  const totalNeto = rendiciones.reduce((s, r) => {
    const ret = r.tipo_documento ? calcularRetencion(r) : { neto: r.monto }
    return s + ret.neto
  }, 0)

  const descargar = () => {
    const lineas = rendiciones.map(r => generarLineaSantander(r, rutEmpresa))
    const contenido = lineas.join('\r\n')
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const rodajeNombre = rodajes.find(r => r.id === rodajeFiltro)?.nombre || 'export'
    a.download = `santander_${rodajeNombre.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-4xl">
      {/* Selector rodaje */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Rodaje</label>
          <select
            value={rodajeFiltro || ''}
            onChange={e => router.push(e.target.value ? `/rendiciones/admin/export?rodaje=${e.target.value}` : '/rendiciones/admin/export')}
            className="input-ch w-full">
            <option value="">— Seleccionar rodaje —</option>
            {rodajes.map(r => (
              <option key={r.id} value={r.id}>{r.nombre} {r.fecha ? `(${r.fecha})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">RUT empresa</label>
          <input
            value={rutEmpresa}
            onChange={e => setRutEmpresa(e.target.value)}
            placeholder="76.123.456-7"
            className="input-ch w-full"
          />
        </div>
      </div>

      {!rodajeFiltro && (
        <div className="border border-dashed border-ch-border p-12 text-center">
          <p className="text-ch-muted font-body text-sm">Selecciona un rodaje para generar el archivo.</p>
        </div>
      )}

      {rodajeFiltro && rendiciones.length === 0 && (
        <div className="border border-dashed border-ch-border p-12 text-center">
          <p className="text-ch-muted font-body text-sm">No hay rendiciones aprobadas en este rodaje.</p>
        </div>
      )}

      {rodajeFiltro && rendiciones.length > 0 && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="border border-ch-border p-4">
              <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">Transferencias</p>
              <p className="font-body text-2xl font-mono text-ch-cream">{rendiciones.length}</p>
            </div>
            <div className="border border-ch-border p-4">
              <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">Total bruto</p>
              <p className="font-body text-2xl font-mono text-ch-cream">${rendiciones.reduce((s, r) => s + r.monto, 0).toLocaleString('es-CL')}</p>
            </div>
            <div className="border border-ch-border p-4">
              <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">Total neto</p>
              <p className="font-body text-2xl font-mono text-ch-green">${totalNeto.toLocaleString('es-CL')}</p>
            </div>
          </div>

          {/* Tabla preview */}
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
                      <td className="font-body text-xs text-ch-cream py-2.5 pr-4">{col?.nombre || r.nombre_libre || '—'}</td>
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

          {/* Advertencias */}
          {rendiciones.some(r => !(r.colaborador as any)?.numero_cuenta) && (
            <div className="border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
              <p className="font-body text-xs text-amber-400">
                ⚠ Algunos colaboradores no tienen cuenta bancaria registrada. Revisa sus fichas antes de exportar.
              </p>
            </div>
          )}

          <button
            onClick={descargar}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-8 py-3 transition-colors">
            Descargar archivo Santander →
          </button>
        </>
      )}
    </div>
  )
}
