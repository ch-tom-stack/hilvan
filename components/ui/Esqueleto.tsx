/**
 * Esqueleto de carga para `loading.tsx`.
 *
 * POR QUÉ IMPORTA. Navegar entre módulos es la acción MÁS frecuente de la app,
 * y era la única sin respuesta: al hacer click no pasaba nada hasta que el
 * servidor resolvía sus consultas. Next.js muestra `loading.tsx` al instante,
 * así que el costo de tenerlo es un archivo de tres líneas por ruta.
 *
 * Es un componente de servidor a propósito: no necesita estado y así no suma
 * JavaScript al bundle de una pantalla que dura medio segundo.
 */
export default function Esqueleto({
  titulo,
  filas = 5,
  metricas = 0,
  columnas,
}: {
  /** El epígrafe del módulo. Se muestra de verdad: ya sabemos dónde estamos. */
  titulo: string
  filas?: number
  /** Banda de tarjetas de métricas, si la pantalla las tiene. */
  metricas?: number
  /** Columnas tipo Kanban en vez de filas. */
  columnas?: number
}) {
  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10 gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">{titulo}</p>
          <div className="h-11 w-56 ch-shimmer" />
        </div>
        <div className="h-10 w-28 ch-shimmer shrink-0" />
      </div>

      {metricas > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {Array.from({ length: metricas }).map((_, i) => (
            <div key={i} style={{ ['--i' as string]: i }} className="border border-ch-border p-4">
              <div className="h-2.5 w-20 ch-shimmer mb-3" />
              <div className="h-7 w-14 ch-shimmer" />
            </div>
          ))}
        </div>
      )}

      {columnas ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: columnas }).map((_, i) => (
            <div key={i} style={{ ['--i' as string]: i * 2 }} className="flex-1 min-w-[180px] border border-ch-border p-2 space-y-2">
              <div className="h-3 w-24 ch-shimmer mb-3" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="border border-ch-border p-3">
                  <div className="h-3 w-1/2 ch-shimmer mb-2" />
                  <div className="h-2.5 w-3/4 ch-shimmer" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: filas }).map((_, i) => (
            <div key={i} style={{ ['--i' as string]: i }} className="border border-ch-border p-4">
              <div className="h-4 w-1/2 ch-shimmer mb-2" />
              <div className="h-2.5 w-1/3 ch-shimmer" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
