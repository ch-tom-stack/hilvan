import type { EstadoCotejo } from '@/lib/crm-reconciliacion'

/**
 * Aviso de cotejo vencido.
 *
 * Lo ve todo el equipo, no solo quien gestiona: el daño de que el cotejo se
 * detenga no lo sufre quien dispara la rutina, sino quien trabaja la lista
 * creyendo que nadie le respondió.
 *
 * Va arriba de la agenda a propósito. Al pie sería una nota al margen sobre
 * datos que ya se leyeron como ciertos.
 */
export default function AvisoCotejo({ estado }: { estado: EstadoCotejo }) {
  if (!estado.avisar || !estado.mensaje) return null

  return (
    <div className="border border-ch-gold/40 bg-ch-gold/5 px-4 py-3 mb-6 flex items-start gap-3">
      <span className="w-2 h-2 bg-ch-gold shrink-0 mt-1.5" aria-hidden />
      <div>
        <p className="font-body text-xs text-ch-gold leading-relaxed">{estado.mensaje}</p>
        <p className="font-body text-[11px] text-ch-muted mt-1">
          Mientras tanto, la agenda del día puede estar incompleta: si alguien te
          contestó por correo, su prospecto no aparece como urgente.
        </p>
      </div>
    </div>
  )
}
