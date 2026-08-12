'use client'

import { useState } from 'react'
import { actualizarCotizacion } from '@/app/actions/cotizaciones'
import type { Cotizacion } from '@/types'

// ─── ENCARGO PANEL ───────────────────────────────────────────────────────────

const NOTAS_SUGERIDAS = [
  'Se solicita orden de facturación con pago a 30 días para la entrega del material en alta calidad.',
  'Se entregará todo el material en baja calidad para las correcciones de montaje y postproducción (se considera una corrección por etapa).',
  'Se solicita una reunión de pre-producción para definir criterios y revisar referencias.',
  'Los precios no incluyen IVA.',
  'Cotización válida por 30 días desde la fecha de emisión.',
  'Los tiempos de entrega se acordarán en reunión de pre-producción.',
]

export function EncargoPanel({ cot, setCot }: { cot: Cotizacion; setCot: React.Dispatch<React.SetStateAction<Cotizacion>> }) {
  const [open, setOpen] = useState(true)
  const iCls = 'w-full bg-transparent border-b border-ch-border/40 text-ch-cream font-body text-xs px-0 py-1 focus:outline-none focus:border-ch-cream/60 transition-colors placeholder:text-ch-muted/40'
  const lCls = 'font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mt-2 mb-0.5'

  async function save(field: string, value: string) {
    await actualizarCotizacion(cot.id, { [field]: value || null } as any)
  }

  // Agencia/Cliente: editable como texto libre. Al cambiarla, suelta el cliente
  // formal heredado (típico al copiar una cotización y reapuntarla a otra marca).
  async function saveAgencia(value: string) {
    const v = value.trim()
    await actualizarCotizacion(cot.id, { cliente_nombre_libre: v || null, cliente_id: null } as any)
    setCot(c => ({ ...c, cliente_nombre_libre: v || undefined, cliente_id: undefined, cliente: undefined }))
  }

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between mb-2 ch-press">
        <span className="font-body text-[10px] uppercase tracking-wider text-ch-muted">Encargo</span>
        <span className="text-ch-muted/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div>
          <label className={lCls}>Solicita</label>
          <input defaultValue={cot.solicita ?? ''} onBlur={e => save('solicita', e.target.value)}
            placeholder="Nombre o contacto" className={iCls} />

          <label className={lCls}>Agencia / Cliente</label>
          <input key={cot.cliente_nombre_libre ?? cot.cliente?.nombre ?? ''}
            defaultValue={cot.cliente_nombre_libre ?? cot.cliente?.nombre ?? ''}
            onBlur={e => saveAgencia(e.target.value)}
            placeholder="Agencia o cliente" className={iCls} />

          <label className={lCls}>Cliente final</label>
          <input defaultValue={cot.cliente_final ?? ''} onBlur={e => save('cliente_final', e.target.value)}
            placeholder="Marca o cliente final" className={iCls} />

          <label className={lCls}>Medios</label>
          <input defaultValue={cot.medios ?? ''} onBlur={e => save('medios', e.target.value)}
            placeholder="Digitales, TV, Cine…" className={iCls} />

          <label className={lCls}>Referencia</label>
          <input defaultValue={cot.referencia ?? ''} onBlur={e => save('referencia', e.target.value)}
            placeholder="Briefing, link, documento…" className={iCls} />

          <label className={lCls}>Descripción</label>
          <textarea defaultValue={cot.descripcion ?? ''} onBlur={e => save('descripcion', e.target.value)}
            rows={2} placeholder="Descripción del proyecto…"
            className={`${iCls} resize-none`} />
        </div>
      )}
    </div>
  )
}

// ─── NOTAS PANEL ─────────────────────────────────────────────────────────────

export function NotasPanel({ cot, setCot }: { cot: Cotizacion; setCot: React.Dispatch<React.SetStateAction<Cotizacion>> }) {
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState(cot.notas_cliente ?? '')

  async function guardar(val: string) {
    setTexto(val)
    await actualizarCotizacion(cot.id, { notas_cliente: val || null } as any)
    setCot(c => ({ ...c, notas_cliente: val || undefined }))
  }

  function agregarSugerida(nota: string) {
    const nuevo = texto ? `${texto.trimEnd()}\n${nota}` : nota
    guardar(nuevo)
  }

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between mb-2 ch-press">
        <span className="font-body text-[10px] uppercase tracking-wider text-ch-muted">
          Notas al cliente {texto && <span className="text-ch-cream/40 normal-case tracking-normal">·</span>}
        </span>
        <span className="text-ch-muted/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-2">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onBlur={e => guardar(e.target.value)}
            rows={4}
            placeholder="Condiciones, aclaraciones…"
            className="w-full bg-transparent border border-ch-border/40 text-ch-cream font-body text-xs px-2 py-1.5 focus:outline-none focus:border-ch-cream/60 transition-colors placeholder:text-ch-muted/40 resize-none"
          />
          <div>
            <p className="font-body text-[9px] text-ch-muted/60 uppercase tracking-[0.3em] mb-1.5">Agregar sugerida</p>
            <div className="space-y-1">
              {NOTAS_SUGERIDAS.map((n, i) => (
                <button key={i} onClick={() => agregarSugerida(n)}
                  className="w-full text-left font-body text-[10px] text-ch-muted/60 hover:text-ch-muted leading-snug px-1 py-0.5 hover:bg-white/5 transition-colors rounded ch-press">
                  + {n.slice(0, 55)}…
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
