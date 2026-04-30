import type { EstadoEquipo } from '@/types'

const config: Record<EstadoEquipo, { label: string; color: string }> = {
  disponible:       { label: 'Disponible',      color: 'text-ch-green  bg-ch-green/10  border-ch-green/30'  },
  en_uso:           { label: 'En uso',           color: 'text-ch-gold   bg-ch-gold/10   border-ch-gold/30'   },
  en_mantenimiento: { label: 'Mantenimiento',    color: 'text-orange-400 bg-orange-400/10 border-orange-400/30' },
  pendiente_compra: { label: 'Pend. compra',     color: 'text-ch-muted  bg-ch-surface   border-ch-border'   },
}

export default function TagEstado({ estado }: { estado: EstadoEquipo }) {
  const { label, color } = config[estado]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 border font-body text-[10px] tracking-wider ${color}`}>
      {label}
    </span>
  )
}
