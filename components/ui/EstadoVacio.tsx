interface Props {
  mensaje: string
  submensaje?: string
  accion?: React.ReactNode
}

export default function EstadoVacio({ mensaje, submensaje, accion }: Props) {
  return (
    <div className="border border-dashed border-ch-border rounded-[2px] p-10 text-center">
      <p className="text-ch-muted text-sm mb-1">{mensaje}</p>
      {submensaje && (
        <p className="text-ch-subtle text-xs mb-4">{submensaje}</p>
      )}
      {accion && (
        <div className="mt-4">{accion}</div>
      )}
    </div>
  )
}
