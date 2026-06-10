'use client'

// ─── MODALES DE AdminRendiciones ──────────────────────────────────────────────
// Componentes presentacionales: el estado lo posee AdminRendiciones y se pasa
// por props explícitas (sin context nuevo).

interface CotizacionDisponible {
  id: string
  nombre: string
  grupo?: { numero_base?: string }
}

// ─── MODAL NUEVA RENDICIÓN ────────────────────────────────────────────────────

export function ModalNuevaRendicion({
  cotizacionesDisponibles,
  cotizacionSeleccionada,
  setCotizacionSeleccionada,
  conflictoExistente,
  setConflictoExistente,
  creandoRendicion,
  onCrear,
  onCerrar,
}: {
  cotizacionesDisponibles: CotizacionDisponible[]
  cotizacionSeleccionada: string
  setCotizacionSeleccionada: (v: string) => void
  conflictoExistente: boolean
  setConflictoExistente: (v: boolean) => void
  creandoRendicion: boolean
  onCrear: (forzar?: boolean) => void
  onCerrar: () => void
}) {
  return (
    <div className="fixed inset-0 bg-ch-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-ch-dark border border-ch-border p-6 w-full max-w-md">
        <h3 className="font-display italic text-2xl text-ch-cream mb-5">Nueva rendición</h3>
        {cotizacionesDisponibles.length === 0 ? (
          <>
            <p className="font-body text-sm text-ch-muted mb-5">Todas las cotizaciones ya tienen rendición activa.</p>
            <button onClick={onCerrar}
              className="w-full border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs py-2.5 transition-colors">
              Cerrar
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Cotización</label>
              <select value={cotizacionSeleccionada} onChange={e => { setCotizacionSeleccionada(e.target.value); setConflictoExistente(false) }} className="input-ch w-full">
                <option value="">— Seleccionar —</option>
                {cotizacionesDisponibles.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.grupo?.numero_base ? `${c.grupo.numero_base} · ` : ''}{c.nombre}
                  </option>
                ))}
              </select>
            </div>
            {conflictoExistente && (
              <div className="border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <p className="font-body text-[10px] text-amber-400">
                  Ya existe una rendición para esta cotización que no está visible en la lista. Puede purgarla y crear una nueva.
                </p>
                <button onClick={() => onCrear(true)} disabled={creandoRendicion}
                  className="w-full border border-red-500/40 text-red-400 hover:bg-red-500/10 font-body text-[10px] tracking-[0.35em] uppercase py-2 transition-colors disabled:opacity-50">
                  {creandoRendicion ? 'Purgando...' : 'Purgar y crear nueva'}
                </button>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={() => onCrear(false)} disabled={!cotizacionSeleccionada || creandoRendicion}
                className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[10px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50">
                {creandoRendicion ? 'Creando...' : 'Crear rendición'}
              </button>
              <button onClick={onCerrar}
                className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MODAL LINK EXTERNO ───────────────────────────────────────────────────────

export function ModalLinkExterno({
  itemNombre,
  linkGenerado,
  linkForm,
  setLinkForm,
  colaboradores,
  generandoLink,
  onGenerar,
  onCerrar,
}: {
  itemNombre: string
  linkGenerado: string | null
  linkForm: { email: string; colaboradorId: string; dias: number }
  setLinkForm: React.Dispatch<React.SetStateAction<{ email: string; colaboradorId: string; dias: number }>>
  colaboradores: { id: string; nombre: string }[]
  generandoLink: boolean
  onGenerar: () => void
  onCerrar: () => void
}) {
  return (
    <div className="fixed inset-0 bg-ch-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-ch-dark border border-ch-border p-6 w-full max-w-md">
        <h3 className="font-display italic text-2xl text-ch-cream mb-1">Generar link externo</h3>
        <p className="font-body text-[10px] text-ch-muted mb-5 truncate">{itemNombre}</p>

        {linkGenerado ? (
          <div className="space-y-4">
            <div className="border border-ch-green/30 bg-ch-green/5 p-3">
              <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-green mb-2">
                Link generado{linkForm.email.trim() ? ' · email enviado' : ''}
              </p>
              <p className="font-mono text-xs text-ch-cream break-all select-all">{linkGenerado}</p>
            </div>
            <button onClick={() => navigator.clipboard.writeText(linkGenerado)}
              className="w-full border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase py-2.5 transition-colors">
              Copiar link
            </button>
            <button onClick={onCerrar}
              className="w-full bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[10px] tracking-[0.35em] uppercase py-2.5 transition-colors">
              Listo
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Email del externo (opcional)</label>
              <input type="email" value={linkForm.email}
                onChange={e => setLinkForm(p => ({ ...p, email: e.target.value }))}
                placeholder="nombre@email.com" autoFocus className="input-ch w-full" />
            </div>
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Colaborador en directorio (opcional)</label>
              <select value={linkForm.colaboradorId}
                onChange={e => setLinkForm(p => ({ ...p, colaboradorId: e.target.value }))}
                className="input-ch w-full">
                <option value="">— Sin ficha en directorio —</option>
                {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Días de vigencia</label>
              <select value={linkForm.dias}
                onChange={e => setLinkForm(p => ({ ...p, dias: Number(e.target.value) }))}
                className="input-ch w-full">
                <option value={3}>3 días</option>
                <option value={7}>7 días (default)</option>
                <option value={14}>14 días</option>
                <option value={30}>30 días</option>
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={onGenerar} disabled={generandoLink}
                className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[10px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50">
                {generandoLink ? 'Generando...' : linkForm.email.trim() ? 'Generar y enviar link' : 'Generar link'}
              </button>
              <button onClick={onCerrar}
                className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MODAL RECHAZO ────────────────────────────────────────────────────────────

export function ModalRechazo({
  motivo,
  setMotivo,
  isPending,
  onConfirmar,
  onCerrar,
}: {
  motivo: string
  setMotivo: (v: string) => void
  isPending: boolean
  onConfirmar: () => void
  onCerrar: () => void
}) {
  return (
    <div className="fixed inset-0 bg-ch-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-ch-dark border border-ch-border p-6 w-full max-w-md">
        <h3 className="font-display italic text-2xl text-ch-cream mb-5">Motivo de rechazo</h3>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)}
          rows={3} autoFocus placeholder="Ej: Documento ilegible, falta comprobante..."
          className="input-ch w-full resize-none mb-4" />
        <div className="flex gap-3">
          <button onClick={onConfirmar}
            disabled={isPending || !motivo.trim()}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-body text-[10px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50">
            {isPending ? 'Rechazando...' : 'Confirmar rechazo'}
          </button>
          <button onClick={onCerrar}
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
