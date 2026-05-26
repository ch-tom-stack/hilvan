'use client'

import { useState, useTransition } from 'react'
import { useConfirm } from '@/components/ui/useConfirm'
import { useRouter } from 'next/navigation'
import {
  actualizarColaborador, eliminarColaborador, crearTarifa, eliminarTarifa,
  crearLinkTemporal, getLinksPorColaborador, crearLinkOnboarding,
} from '@/app/actions/colaboradores'
import type { Colaborador, ColaboradorTarifa, ContratoGenerado, RendicionGasto } from '@/types'

const BANCOS = [
  'Banco de Chile', 'BancoEstado', 'Santander', 'BCI', 'Itaú', 'Scotiabank',
  'Security', 'Falabella', 'Ripley', 'Consorcio', 'BICE', 'Otro',
]

const ESPECIALIDADES_SUGERIDAS = [
  'Cámara', 'Dirección', 'Fotografía', 'Arte', 'Producción', 'Sonido',
  'Edición', 'Colorización', 'Modelo', 'Cast', 'Maquillaje', 'Vestuario',
  'Gaffer', 'Grip', 'VFX', 'Música', 'Locución', 'Otro',
]

interface Props {
  colaborador: Colaborador
  tarifas: ColaboradorTarifa[]
  contratos: ContratoGenerado[]
  rodajes: { id: string; nombre: string; fecha?: string }[]
  cotizaciones?: any[]
  rendicionGastos?: RendicionGasto[]
}

export default function FichaColaborador({ colaborador, tarifas: tarifasIniciales, contratos, rodajes, cotizaciones = [], rendicionGastos = [] }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<Partial<Colaborador>>(colaborador)
  const [tarifas, setTarifas] = useState(tarifasIniciales)
  const [guardado, setGuardado] = useState(false)
  const [seccion, setSeccion] = useState<string>('identidad')
  const [gastos] = useState<RendicionGasto[]>(rendicionGastos)
  const { confirm, ConfirmDialog } = useConfirm()

  // Tarifa nueva
  const [nuevaTarifa, setNuevaTarifa] = useState({ rodaje_id: '', rol: '', monto_dia: '' })

  // Link temporal (rendiciones)
  const [linkGenerado, setLinkGenerado] = useState<string | null>(null)
  const [generandoLink, setGenerandoLink] = useState(false)

  // Link onboarding
  const [linkOnboarding, setLinkOnboarding] = useState<string | null>(null)
  const [generandoLinkOnboarding, setGenerandoLinkOnboarding] = useState(false)

  const set = (campo: keyof Colaborador, valor: any) =>
    setForm(prev => ({ ...prev, [campo]: valor }))

  const guardar = () => {
    startTransition(async () => {
      await actualizarColaborador(colaborador.id, form)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    })
  }

  const toggleEspecialidad = (esp: string) => {
    const actual = form.especialidades || []
    set('especialidades', actual.includes(esp) ? actual.filter(e => e !== esp) : [...actual, esp])
  }

  const agregarTarifa = () => {
    if (!nuevaTarifa.monto_dia) return
    startTransition(async () => {
      await crearTarifa({
        colaborador_id: colaborador.id,
        rodaje_id: nuevaTarifa.rodaje_id || undefined,
        rol: nuevaTarifa.rol || undefined,
        monto_dia: parseInt(nuevaTarifa.monto_dia),
      })
      setNuevaTarifa({ rodaje_id: '', rol: '', monto_dia: '' })
      router.refresh()
    })
  }

  const generarLink = async () => {
    setGenerandoLink(true)
    try {
      const link = await crearLinkTemporal(colaborador.id, undefined, 7)
      const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com'}/r/${link.token}`
      setLinkGenerado(url)
      await navigator.clipboard.writeText(url).catch(() => {})
    } finally {
      setGenerandoLink(false)
    }
  }

  const generarFichaLink = async () => {
    setGenerandoLinkOnboarding(true)
    try {
      const link = await crearLinkOnboarding(colaborador.id)
      const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com'}/col/${link.token}`
      setLinkOnboarding(url)
      await navigator.clipboard.writeText(url).catch(() => {})
    } finally {
      setGenerandoLinkOnboarding(false)
    }
  }

  const generarContrato = async (tipo: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/contratos/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaborador_id: colaborador.id, tipo }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${tipo}-${colaborador.nombre.replace(/\s+/g, '-').toLowerCase()}.docx`
      a.click()
      URL.revokeObjectURL(url)
      router.refresh()
    })
  }

  const tabs = ['identidad', 'bancario', 'fiscal', 'especialidades', 'contratos', 'tarifas', 'rendiciones']

  return (
    <div className="max-w-3xl">
      {ConfirmDialog}

      {/* Enviar ficha de onboarding */}
      <div className="mb-6">
        <button
          onClick={generarFichaLink}
          disabled={generandoLinkOnboarding}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.3em] uppercase px-4 py-2 transition-colors disabled:opacity-50"
        >
          {generandoLinkOnboarding ? 'Generando...' : 'Enviar ficha al colaborador'}
        </button>
        {linkOnboarding && (
          <div className="mt-2 border border-ch-border/50 bg-ch-surface/30 px-3 py-2">
            <p className="font-body text-[10px] text-ch-green mb-1">Link copiado al portapapeles:</p>
            <p className="font-mono text-[10px] text-ch-muted break-all">{linkOnboarding}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-ch-border mb-8 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setSeccion(tab)}
            className={`font-body text-[10px] tracking-[0.2em] uppercase px-3 py-3 whitespace-nowrap transition-colors border-b-2 -mb-px ${
              seccion === tab ? 'border-ch-green text-ch-cream' : 'border-transparent text-ch-muted hover:text-ch-cream'
            }`}
          >
            {tab === 'identidad' ? 'Identidad' :
             tab === 'bancario' ? 'Bancario' :
             tab === 'fiscal' ? 'Fiscal' :
             tab === 'especialidades' ? 'Especialidades' :
             tab === 'contratos' ? 'Contratos' :
             tab === 'tarifas' ? 'Tarifas' : 'Rendiciones'}
          </button>
        ))}
      </div>

      {/* ── IDENTIDAD ── */}
      {seccion === 'identidad' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Nombre completo" requerido>
              <input value={form.nombre || ''} onChange={e => set('nombre', e.target.value)}
                className="input-ch w-full" />
            </Campo>
            <Campo label="RUT">
              <input value={form.rut || ''} onChange={e => set('rut', e.target.value)}
                placeholder="12.345.678-9" className="input-ch w-full" />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Email">
              <input value={form.email || ''} onChange={e => set('email', e.target.value)}
                type="email" className="input-ch w-full" />
            </Campo>
            <Campo label="Teléfono">
              <input value={form.telefono || ''} onChange={e => set('telefono', e.target.value)}
                placeholder="+56 9 XXXX XXXX" className="input-ch w-full" />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Tipo de persona">
              <select value={form.tipo_persona || 'natural'} onChange={e => set('tipo_persona', e.target.value)}
                className="input-ch w-full">
                <option value="natural">Persona natural</option>
                <option value="empresa">Empresa</option>
              </select>
            </Campo>
            {form.tipo_persona === 'empresa' && (
              <Campo label="Razón social">
                <input value={form.razon_social || ''} onChange={e => set('razon_social', e.target.value)}
                  className="input-ch w-full" />
              </Campo>
            )}
          </div>
          <Campo label="Notas internas">
            <textarea value={form.notas_internas || ''} onChange={e => set('notas_internas', e.target.value)}
              rows={3} className="input-ch w-full resize-none" />
          </Campo>
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.disponible ?? true}
                onChange={e => set('disponible', e.target.checked)}
                className="w-3.5 h-3.5 accent-ch-green" />
              <span className="font-body text-xs text-ch-muted">Disponible / recomendado</span>
            </label>
          </div>
        </div>
      )}

      {/* ── BANCARIO ── */}
      {seccion === 'bancario' && (
        <div className="space-y-4">
          <Campo label="Banco">
            <select value={form.banco || ''} onChange={e => set('banco', e.target.value)} className="input-ch w-full">
              <option value="">— Seleccionar —</option>
              {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Tipo de cuenta">
              <select value={form.tipo_cuenta || ''} onChange={e => set('tipo_cuenta', e.target.value as any)}
                className="input-ch w-full">
                <option value="">— Seleccionar —</option>
                <option value="corriente">Corriente</option>
                <option value="vista">Vista / RUT</option>
                <option value="ahorro">Ahorro</option>
              </select>
            </Campo>
            <Campo label="Número de cuenta">
              <input value={form.numero_cuenta || ''} onChange={e => set('numero_cuenta', e.target.value)}
                className="input-ch w-full font-mono" />
            </Campo>
          </div>
        </div>
      )}

      {/* ── FISCAL ── */}
      {seccion === 'fiscal' && (
        <div className="space-y-4">
          <Campo label="Tipo de documento habitual">
            <select value={form.tipo_documento || ''} onChange={e => set('tipo_documento', e.target.value as any)}
              className="input-ch w-full">
              <option value="">— Seleccionar —</option>
              <option value="boleta">Boleta de honorarios</option>
              <option value="bet">BET (Boleta Electrónica de Trabajo)</option>
              <option value="factura">Factura</option>
              <option value="sin_documento">Sin documento</option>
              <option value="contratado">Contratado</option>
            </select>
          </Campo>
          <Campo label="Alerta tributaria (nota interna para el contador)">
            <textarea value={form.alerta_tributaria || ''} onChange={e => set('alerta_tributaria', e.target.value)}
              rows={3} placeholder="Ej: Tiene inicio de actividades, emite BET, está en segunda categoría..."
              className="input-ch w-full resize-none" />
          </Campo>
          <div className="flex items-center gap-2 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requiere_release ?? false}
                onChange={e => set('requiere_release', e.target.checked)}
                className="w-3.5 h-3.5 accent-ch-green" />
              <span className="font-body text-xs text-ch-muted">Requiere release</span>
            </label>
          </div>
          {form.requiere_release && (
            <p className="font-body text-[10px] text-amber-400/80 border border-amber-500/20 px-3 py-2">
              Obligatorio para modelos, cast, fotógrafos y artistas propietarios de obra exhibida. Debe firmarse antes de cada rodaje.
            </p>
          )}
        </div>
      )}

      {/* ── ESPECIALIDADES ── */}
      {seccion === 'especialidades' && (
        <div className="space-y-4">
          <p className="font-body text-xs text-ch-muted">Selecciona las especialidades del colaborador:</p>
          <div className="flex flex-wrap gap-2">
            {ESPECIALIDADES_SUGERIDAS.map(esp => {
              const activa = (form.especialidades || []).includes(esp)
              return (
                <button key={esp} onClick={() => toggleEspecialidad(esp)}
                  className={`font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border transition-colors ${
                    activa ? 'border-ch-green text-ch-cream bg-ch-green/10' : 'border-ch-border text-ch-muted hover:text-ch-cream'
                  }`}>
                  {esp}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── CONTRATOS ── */}
      {seccion === 'contratos' && (
        <div className="space-y-6">
          <div>
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Generar nuevo contrato</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { tipo: 'marco_equipo', label: 'Equipo técnico' },
                { tipo: 'marco_modelo', label: 'Modelos / Cast' },
                { tipo: 'marco_empresa', label: 'Empresas' },
                { tipo: 'release', label: 'Autorización de imagen' },
              ].map(({ tipo, label }) => (
                <button key={tipo} onClick={() => generarContrato(tipo)} disabled={isPending}
                  className="border border-ch-border text-ch-muted hover:text-ch-cream hover:border-zinc-600 font-body text-xs px-4 py-3 text-left transition-colors disabled:opacity-50">
                  {label}
                  <span className="block text-[9px] tracking-wider text-ch-muted/60 mt-0.5">→ descarga .docx</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.contrato_marco ?? false}
                  onChange={e => set('contrato_marco', e.target.checked)}
                  className="w-3.5 h-3.5 accent-ch-green" />
                <span className="font-body text-xs text-ch-muted">Contrato marco firmado</span>
              </label>
            </div>
          </div>

          {contratos.length > 0 && (
            <div>
              <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Historial</p>
              <div className="border border-ch-border divide-y divide-ch-border/50">
                {contratos.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <span className="font-body text-xs text-ch-cream">
                        {c.tipo === 'marco_equipo' ? 'Equipo técnico' :
                         c.tipo === 'marco_modelo' ? 'Modelos / Cast' :
                         c.tipo === 'marco_empresa' ? 'Empresas' : 'Release'}
                      </span>
                      {c.rodaje && <span className="font-body text-[10px] text-ch-muted ml-2">· {c.rodaje.nombre}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      {c.firmado && <span className="font-body text-[9px] text-ch-green tracking-wider">Firmado</span>}
                      <span className="font-body text-[10px] text-ch-muted">
                        {new Date(c.created_at).toLocaleDateString('es-CL')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Link temporal para rendiciones</p>
            <button onClick={generarLink} disabled={generandoLink}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 py-2 transition-colors disabled:opacity-50">
              {generandoLink ? 'Generando...' : 'Generar link (7 días)'}
            </button>
            {linkGenerado && (
              <div className="mt-3 border border-ch-border/50 bg-ch-surface/30 px-3 py-2">
                <p className="font-body text-[10px] text-ch-green mb-1">Link copiado al portapapeles:</p>
                <p className="font-mono text-[10px] text-ch-muted break-all">{linkGenerado}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TARIFAS ── */}
      {seccion === 'tarifas' && (
        <div className="space-y-4">
          <div className="border border-ch-border p-4 space-y-3">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Agregar tarifa</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="font-body text-[9px] text-ch-muted uppercase tracking-wider block mb-1">Rodaje</label>
                <select value={nuevaTarifa.rodaje_id}
                  onChange={e => setNuevaTarifa(p => ({ ...p, rodaje_id: e.target.value }))}
                  className="input-ch w-full text-xs">
                  <option value="">— Opcional —</option>
                  {rodajes.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="font-body text-[9px] text-ch-muted uppercase tracking-wider block mb-1">Rol</label>
                <input value={nuevaTarifa.rol} onChange={e => setNuevaTarifa(p => ({ ...p, rol: e.target.value }))}
                  placeholder="ej: DF" className="input-ch w-full" />
              </div>
              <div>
                <label className="font-body text-[9px] text-ch-muted uppercase tracking-wider block mb-1">Monto/día CLP</label>
                <input value={nuevaTarifa.monto_dia} onChange={e => setNuevaTarifa(p => ({ ...p, monto_dia: e.target.value }))}
                  type="number" placeholder="150000" className="input-ch w-full font-mono" />
              </div>
            </div>
            <button onClick={agregarTarifa} disabled={isPending || !nuevaTarifa.monto_dia}
              className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[10px] tracking-widest uppercase px-4 py-2 transition-colors disabled:opacity-50">
              Agregar
            </button>
          </div>

          {tarifas.length > 0 ? (
            <div className="border border-ch-border divide-y divide-ch-border/50">
              {tarifas.map(t => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="font-body text-sm text-ch-cream">
                      ${t.monto_dia.toLocaleString('es-CL')}
                      <span className="text-ch-muted text-xs">/día</span>
                    </span>
                    {t.rol && <span className="font-body text-xs text-ch-muted ml-3">{t.rol}</span>}
                    {t.rodaje && <span className="font-body text-[10px] text-ch-muted ml-2">· {(t.rodaje as any).nombre}</span>}
                  </div>
                  <button onClick={() => startTransition(async () => {
                    await eliminarTarifa(t.id, colaborador.id)
                    setTarifas(prev => prev.filter(x => x.id !== t.id))
                  })} className="text-ch-muted hover:text-red-400 font-body text-xs transition-colors">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-ch-muted font-body text-xs">Sin tarifas registradas.</p>
          )}
        </div>
      )}

      {/* ── RENDICIONES ── */}
      {seccion === 'rendiciones' && (
        <div>
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-6">Gastos rendidos</p>
          {gastos.length === 0 ? (
            <p className="text-ch-muted font-body text-xs">Sin gastos registrados.</p>
          ) : (
            <div className="space-y-2">
              {gastos.map(g => (
                <div key={g.id} className="border border-ch-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-body text-xs text-ch-cream">{g.descripcion}</p>
                      <p className="font-body text-[10px] text-ch-muted">
                        {(g.cotizacion_item as any)?.nombre}
                      </p>
                    </div>
                    <span className={`font-body text-[9px] tracking-wider px-2 py-0.5 border whitespace-nowrap ${g.estado === 'pago_aprobado' ? 'border-ch-green/30 text-ch-green' : g.estado === 'rechazada' ? 'border-red-500/30 text-red-400' : 'border-amber-500/30 text-amber-400'}`}>
                      {g.estado}
                    </span>
                  </div>
                  <p className="font-body text-sm text-ch-cream font-mono mt-1">${g.monto.toLocaleString('es-CL')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Botón guardar (visible en tabs con campos) */}
      {['identidad', 'bancario', 'fiscal', 'especialidades'].includes(seccion) && (
        <div className="flex items-center gap-4 mt-8 pt-6 border-t border-ch-border">
          <button onClick={guardar} disabled={isPending}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors disabled:opacity-50">
            {isPending ? 'Guardando...' : guardado ? 'Guardado ✓' : 'Guardar cambios'}
          </button>
          <button onClick={() => startTransition(async () => {
            if (!await confirm('¿Eliminar este colaborador?')) return
            await eliminarColaborador(colaborador.id)
            router.push('/colaboradores')
          })} className="text-ch-muted hover:text-red-400 font-body text-xs transition-colors">
            Eliminar
          </button>
        </div>
      )}
    </div>
  )
}

function Campo({ label, children, requerido }: { label: string; children: React.ReactNode; requerido?: boolean }) {
  return (
    <div>
      <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">
        {label}{requerido && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
