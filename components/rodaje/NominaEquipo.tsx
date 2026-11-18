'use client'

import { useMemo, useState } from 'react'
import { actualizarNomina } from '@/app/actions/rodaje'
import { toastError } from '@/lib/toast'
import { filasNomina, resumenNomina, type PersonaNomina, type FilaNomina } from '@/lib/nomina'

// Nómina del equipo: una tabla tipo planilla con lo que producción necesita de
// cada persona. Cada celda se guarda sola al salir de ella. Lo que se imprime
// es la misma tabla (hoja blanca), igual que el timeline.

type Campo = Parameters<typeof actualizarNomina>[2]

const COLS = '170px 140px 100px 110px 110px 190px 200px 170px 78px 98px 90px 70px'

export default function NominaEquipo({ rodajeId, nombreRodaje, equipo, onCambio }: {
  rodajeId: string
  nombreRodaje: string
  equipo: PersonaNomina[]
  onCambio: () => void
}) {
  const filas = useMemo(() => filasNomina(equipo), [equipo])
  const resumen = resumenNomina(filas)
  const [guardando, setGuardando] = useState<string | null>(null)

  const guardar = async (id: string, campos: Campo) => {
    setGuardando(id)
    try {
      await actualizarNomina(id, rodajeId, campos)
      onCambio()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(null)
    }
  }

  const texto = (f: FilaNomina, campo: 'nombre' | 'rol' | 'rut' | 'telefono' | 'email' | 'direccion' | 'patente', valor: string, bd: string) => (
    <input
      key={`${f.id}-${campo}-${valor}`}
      defaultValue={valor}
      onBlur={e => { const v = e.target.value.trim(); if (v !== valor) guardar(f.id, { [campo]: v }) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder="—"
      title={bd}
      className="w-full bg-transparent px-1 py-1 text-xs focus:outline-none focus:bg-black/5 rounded-[2px] placeholder:text-[#bbb]"
      style={campo === 'patente' ? { textTransform: 'uppercase', fontFamily: 'monospace' } : undefined}
    />
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3 print:hidden">
        <div className="flex gap-4 text-xs text-ch-muted flex-wrap">
          <span>{resumen.personas} personas</span>
          <span>🚐 {resumen.transporte} con transporte</span>
          <span>🅿 {resumen.estacionamiento} con estacionamiento</span>
          <span>🍽 {resumen.conRestriccion} con restricción</span>
          {resumen.sinPatente > 0 && <span className="text-amber-500">⚠ {resumen.sinPatente} sin patente</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()}
            className="text-xs text-ch-muted border border-ch-border px-3 py-1.5 rounded-[2px] hover:border-ch-muted transition-colors ch-press">
            Imprimir
          </button>
          <a href={`/api/rodaje/${rodajeId}/nomina`}
            className="text-xs bg-ch-cream text-ch-dark font-medium px-3 py-1.5 rounded-[2px] hover:bg-white transition-colors ch-press">
            Exportar Excel
          </a>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-ch-subtle py-10 text-center">Agrega personas al equipo para armar la nómina.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="nomina-imprimible" style={{ minWidth: 1520, background: '#ffffff', color: '#111111', border: '1px solid #e2e2e2', padding: '14px 16px' }}>
            <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '2px solid #111111' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Nómina del equipo — {nombreRodaje}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: COLS, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666666', padding: '0 0 4px', borderBottom: '1px solid #cfcfcf' }}>
              {['Nombre', 'Cargo', 'Depto.', 'RUT', 'Teléfono', 'Email', 'Dirección', 'Restricción alimentaria', 'Transp.', 'Estacion.', 'Patente', 'Llamado'].map(t => (
                <span key={t} style={{ padding: '0 4px' }}>{t}</span>
              ))}
            </div>

            {filas.map((f, i) => {
              const eq = equipo.find(p => p.id === f.id)
              const nuevoDepto = i === 0 || filas[i - 1].departamento !== f.departamento
              return (
                <div key={f.id}>
                  {nuevoDepto && (
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600, color: '#111111', background: '#f3f1f6', padding: '3px 4px', marginTop: i === 0 ? 0 : 6, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                      {f.departamento}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'start', borderBottom: '1px solid #eeeeee', opacity: guardando === f.id ? 0.6 : 1, breakInside: 'avoid' }}>
                    <div>{texto(f, 'nombre', f.nombre, '')}</div>
                    <div>{texto(f, 'rol', f.rol, '')}</div>
                    <span style={{ fontSize: 11, padding: '4px', color: '#666666' }}>{f.departamento === 'Sin departamento' ? '' : f.departamento}</span>
                    <div>{texto(f, 'rut', f.rut, eq?.colaborador?.rut && !eq.rut ? 'Viene del directorio' : '')}</div>
                    <div>{texto(f, 'telefono', f.telefono, '')}</div>
                    <div>{texto(f, 'email', f.email, '')}</div>
                    <div>{texto(f, 'direccion', f.direccion, '')}</div>
                    <div>
                      <input
                        key={`${f.id}-restr-${f.restriccion}`}
                        defaultValue={f.restriccion}
                        onBlur={e => { const v = e.target.value.trim(); if (v !== f.restriccion) guardar(f.id, { restriccion_alimentaria: v }) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        placeholder="—"
                        className="w-full bg-transparent px-1 py-1 text-xs focus:outline-none focus:bg-black/5 rounded-[2px] placeholder:text-[#bbb]"
                      />
                    </div>
                    <label style={{ display: 'flex', justifyContent: 'center', padding: '5px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={f.transporte} onChange={e => guardar(f.id, { necesita_transporte: e.target.checked })} />
                    </label>
                    <label style={{ display: 'flex', justifyContent: 'center', padding: '5px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={f.estacionamiento} onChange={e => guardar(f.id, { necesita_estacionamiento: e.target.checked })} />
                    </label>
                    <div style={f.estacionamiento && !f.patente ? { background: '#fff4d6' } : undefined}>{texto(f, 'patente', f.patente, '')}</div>
                    <span style={{ fontSize: 11, padding: '5px 4px', fontFamily: 'monospace', color: '#444444' }}>{f.llamado || '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
