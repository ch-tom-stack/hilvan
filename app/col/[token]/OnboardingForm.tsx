'use client'

import { useState, useTransition } from 'react'
import { guardarDatosOnboarding } from '@/app/actions/colaboradores'
import type { Colaborador } from '@/types'

const BANCOS = [
  'Banco de Chile', 'BancoEstado', 'Santander', 'BCI', 'Itaú', 'Scotiabank',
  'Security', 'Falabella', 'Ripley', 'Consorcio', 'BICE', 'Otro',
]

interface Props {
  token: string
  colaborador: Colaborador
}

type Tab = 'identidad' | 'pagos' | 'restricciones'

export default function OnboardingForm({ token, colaborador }: Props) {
  const [tab, setTab] = useState<Tab>('identidad')
  const [isPending, startTransition] = useTransition()
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    nombre: colaborador.nombre || '',
    rut: colaborador.rut || '',
    email: colaborador.email || '',
    telefono: colaborador.telefono || '',
    notas: colaborador.notas || '',
    banco: colaborador.banco || '',
    tipo_cuenta: colaborador.tipo_cuenta || '',
    numero_cuenta: colaborador.numero_cuenta || '',
    tipo_documento: colaborador.tipo_documento || '',
    restricciones_alimentarias: colaborador.restricciones_alimentarias || '',
  })

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const guardar = () => {
    setError(null)
    startTransition(async () => {
      try {
        await guardarDatosOnboarding(token, form)
        setGuardado(true)
      } catch {
        setError('Hubo un problema al guardar. Intenta de nuevo.')
      }
    })
  }

  if (guardado) {
    return (
      <div className="border border-ch-green/40 bg-ch-green/5 p-8 text-center">
        <p className="font-display italic text-2xl text-ch-cream mb-2">¡Listo!</p>
        <p className="font-body text-sm text-ch-muted">Tus datos fueron guardados. El equipo de Casa Hiedra los revisará pronto.</p>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'identidad', label: 'Identidad' },
    { id: 'pagos', label: 'Info pagos' },
    { id: 'restricciones', label: 'Alimentación' },
  ]

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-ch-border mb-6">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`font-body text-[10px] tracking-[0.3em] uppercase px-4 py-3 border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-ch-green text-ch-cream'
                : 'border-transparent text-ch-muted hover:text-ch-cream'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* IDENTIDAD */}
      {tab === 'identidad' && (
        <div className="space-y-4">
          <Campo label="Nombre completo">
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
              className="input-ch w-full" />
          </Campo>
          <Campo label="RUT">
            <input value={form.rut} onChange={e => set('rut', e.target.value)}
              placeholder="12.345.678-9" className="input-ch w-full" />
          </Campo>
          <Campo label="Email">
            <input value={form.email} onChange={e => set('email', e.target.value)}
              type="email" className="input-ch w-full" />
          </Campo>
          <Campo label="Teléfono">
            <input value={form.telefono} onChange={e => set('telefono', e.target.value)}
              placeholder="+56 9 XXXX XXXX" className="input-ch w-full" />
          </Campo>
          <Campo label="Notas para el equipo">
            <textarea
              value={form.notas}
              onChange={e => set('notas', e.target.value)}
              rows={3}
              placeholder="Deja aquí tu tarifa estándar, disponibilidad o cualquier info relevante para el equipo..."
              className="input-ch w-full resize-none"
            />
          </Campo>
        </div>
      )}

      {/* INFO PAGOS */}
      {tab === 'pagos' && (
        <div className="space-y-5">
          <div>
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Datos bancarios</p>
            <div className="space-y-3">
              <Campo label="Banco">
                <select value={form.banco} onChange={e => set('banco', e.target.value)} className="input-ch w-full">
                  <option value="">— Seleccionar —</option>
                  {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Tipo de cuenta">
                  <select value={form.tipo_cuenta} onChange={e => set('tipo_cuenta', e.target.value)} className="input-ch w-full">
                    <option value="">— Seleccionar —</option>
                    <option value="corriente">Corriente</option>
                    <option value="vista">Vista / RUT</option>
                    <option value="ahorro">Ahorro</option>
                  </select>
                </Campo>
                <Campo label="Número de cuenta">
                  <input value={form.numero_cuenta} onChange={e => set('numero_cuenta', e.target.value)}
                    className="input-ch w-full font-mono" />
                </Campo>
              </div>
            </div>
          </div>

          <div className="border-t border-ch-border pt-5">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Datos tributarios</p>
            <Campo label="¿Cómo emites tus documentos?">
              <select value={form.tipo_documento} onChange={e => set('tipo_documento', e.target.value)} className="input-ch w-full">
                <option value="">— Seleccionar —</option>
                <option value="boleta">Boleta de honorarios</option>
                <option value="bet">BET (Boleta Electrónica de Trabajo)</option>
                <option value="factura">Factura</option>
                <option value="sin_documento">Sin documento</option>
              </select>
            </Campo>
          </div>
        </div>
      )}

      {/* RESTRICCIONES ALIMENTARIAS */}
      {tab === 'restricciones' && (
        <div className="space-y-4">
          <p className="font-body text-sm text-ch-muted leading-relaxed">
            Si tienes alguna restricción alimentaria (alergias, preferencias, condición médica), cuéntanos aquí. Esta información es confidencial y la usamos solo para coordinar la alimentación en los días de rodaje.
          </p>
          <Campo label="Restricciones alimentarias">
            <textarea
              value={form.restricciones_alimentarias}
              onChange={e => set('restricciones_alimentarias', e.target.value)}
              rows={4}
              placeholder="Ej: vegetariano, sin gluten, alergia a los mariscos, sin lactosa... o 'sin restricciones'"
              className="input-ch w-full resize-none"
            />
          </Campo>
        </div>
      )}

      {/* Guardar */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={guardar}
          disabled={isPending}
          className="bg-ch-green hover:bg-ch-green-light disabled:opacity-50 text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-8 py-3 transition-colors"
        >
          {isPending ? 'Guardando...' : 'Guardar'}
        </button>
        {error && <p className="font-body text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">{label}</label>
      {children}
    </div>
  )
}
