'use client'

import { use, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { getRodaje, generarCitaciones, marcarWhatsappEnviado, enviarEmailCitacion, actualizarMensajeCitacion } from '@/app/actions/rodaje'
import { RodajeCitacion, RodajeEquipoTecnico, Rodaje, estadoCitacion, generarMensajeCitacion, resolverHoraLlamado, formatHora } from '@/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export default function CitacionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [rodaje, setRodaje] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [expandida, setExpandida] = useState<string | null>(null)
  const [mensajeEditando, setMensajeEditando] = useState<{ id: string; texto: string } | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [filtroDept, setFiltroDept] = useState<string>('todos')

  const recargar = () => getRodaje(id).then(setRodaje)
  useEffect(() => { recargar().finally(() => setLoading(false)) }, [id])

  if (loading) return <div className="p-6 text-ch-subtle text-sm">Cargando...</div>

  const equipo: RodajeEquipoTecnico[] = rodaje?.equipo_tecnico || []
  const departamentos = rodaje?.departamentos || []

  const equipoFiltrado = filtroDept === 'todos'
    ? equipo
    : filtroDept === 'sin_dept'
    ? equipo.filter((p: any) => !p.departamento_id)
    : equipo.filter((p: any) => p.departamento_id === filtroDept)

  const getCitacion = (p: any) => Array.isArray(p.citacion) ? p.citacion[0] : p.citacion
  const citaciones = equipo.map((p: any) => getCitacion(p)).filter(Boolean)
  const confirmadas = citaciones.filter((c: any) => c?.confirmada === true).length
  const sinResponder = citaciones.filter((c: any) => !c?.respondida_at).length
  const conRestricciones = citaciones.filter((c: any) => c?.restricciones_alimentarias).length

  const copiar = (texto: string, cid: string) => {
    navigator.clipboard.writeText(texto)
    setCopiado(cid)
    setTimeout(() => setCopiado(null), 2000)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href={`/rodaje/${id}`} className="text-xs text-ch-muted hover:text-ch-cream transition-colors">
        ← Volver al rodaje
      </Link>

      <div className="flex items-center justify-between mt-3 mb-6">
        <div>
          <h1 className="text-lg font-medium text-ch-cream">Citaciones</h1>
          <p className="text-sm text-ch-muted mt-0.5">{rodaje?.nombre}</p>
        </div>
        <div className="flex gap-2">
          {conRestricciones > 0 && (
            <a href={`/api/rodaje/${id}/catering`} target="_blank" className="text-xs text-ch-muted border border-ch-border px-3 py-1.5 rounded-[2px] hover:border-ch-muted transition-colors">
              PDF catering ({conRestricciones})
            </a>
          )}
          <button
            onClick={() => startTransition(async () => { await generarCitaciones(id); recargar() })}
            disabled={isPending}
            className="text-xs bg-ch-cream text-ch-dark font-medium px-3 py-1.5 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50"
          >
            {isPending ? 'Generando...' : 'Generar citaciones'}
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total', valor: equipo.length },
          { label: 'Confirmados', valor: confirmadas, color: 'text-emerald-400' },
          { label: 'Sin responder', valor: sinResponder, color: sinResponder > 0 ? 'text-amber-400' : undefined },
          { label: 'Con restricciones', valor: conRestricciones, color: conRestricciones > 0 ? 'text-orange-400' : undefined },
        ].map((stat) => (
          <div key={stat.label} className="bg-ch-surface border border-ch-border rounded-[2px] p-4 text-center">
            <p className={`text-xl font-medium ${stat.color || 'text-ch-cream'}`}>{stat.valor}</p>
            <p className="text-xs text-ch-subtle mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filtro departamento */}
      {departamentos.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {['todos', ...departamentos.map((d: any) => d.id), 'sin_dept'].map((did) => {
            const label = did === 'todos' ? 'Todos' : did === 'sin_dept' ? 'Sin dept.' : departamentos.find((d: any) => d.id === did)?.nombre
            return (
              <button
                key={did}
                onClick={() => setFiltroDept(did)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${filtroDept === did ? 'bg-ch-cream text-ch-dark' : 'text-ch-muted border border-ch-border hover:border-ch-muted'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* Lista */}
      {equipo.length === 0 ? (
        <div className="text-center py-16 text-ch-subtle text-sm">
          <p>Agrega personas al equipo técnico primero.</p>
          <Link href={`/rodaje/${id}/equipo`} className="text-ch-cream mt-2 inline-block hover:underline">
            Ir a equipo técnico →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {equipoFiltrado.map((persona: any) => {
            const citacion: RodajeCitacion | undefined = Array.isArray(persona.citacion) ? persona.citacion[0] : persona.citacion
            const link = citacion ? `${APP_URL}/citacion/${citacion.token}` : null
            const estado = citacion ? estadoCitacion(citacion) : null
            const horaEfectiva = formatHora(resolverHoraLlamado(persona, rodaje as Rodaje))
            const mensajeDefault = citacion ? generarMensajeCitacion(persona, rodaje as Rodaje, link!) : ''
            const mensajeActual = citacion?.mensaje_personalizado || mensajeDefault
            const isExpanded = expandida === persona.id

            return (
              <div key={persona.id} className="bg-ch-surface border border-ch-border rounded-[2px]">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-ch-dark/50 transition-colors"
                  onClick={() => setExpandida(isExpanded ? null : persona.id)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-ch-cream">{persona.nombre}</p>
                      {persona.es_jefe_departamento && <span className="text-xs text-amber-500/80">jefe</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {persona.rol && <span className="text-xs text-ch-subtle">{persona.rol}</span>}
                      {persona.departamento && <span className="text-xs text-ch-border">· {persona.departamento.nombre}</span>}
                      <span className="text-xs text-ch-muted">· {horaEfectiva}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {estado && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        estado.color === 'green' ? 'bg-emerald-950 text-emerald-400' :
                        estado.color === 'red' ? 'bg-red-950 text-red-400' :
                        estado.color === 'yellow' ? 'bg-amber-950 text-amber-400' :
                        'bg-ch-surface text-ch-muted'
                      }`}>
                        {estado.label}
                      </span>
                    )}
                    {citacion?.whatsapp_enviado && <span className="text-xs text-ch-subtle">WA ✓</span>}
                    {citacion?.email_enviado_at && <span className="text-xs text-ch-subtle">✉ ✓</span>}
                    <span className="text-ch-border text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-ch-border px-4 py-4 space-y-4">
                    {!citacion ? (
                      <p className="text-xs text-ch-subtle">Presiona "Generar citaciones" para crear el link de esta persona.</p>
                    ) : (
                      <>
                        {citacion.confirmada !== undefined && citacion.confirmada !== null && (
                          <div className={`text-xs px-3 py-2 rounded-[2px] ${citacion.confirmada ? 'bg-emerald-950/50 text-emerald-400' : 'bg-red-950/50 text-red-400'}`}>
                            {citacion.confirmada ? '✓ Confirmó asistencia' : '✗ No puede asistir'}
                            {citacion.restricciones_alimentarias && (
                              <span className="ml-2 text-orange-400">· Restricciones: {citacion.restricciones_alimentarias}</span>
                            )}
                          </div>
                        )}

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs text-zinc-500">Mensaje de citación</label>
                            <button onClick={() => setMensajeEditando({ id: citacion.id, texto: mensajeActual })} className="text-xs text-ch-subtle hover:text-ch-muted transition-colors">
                              Editar
                            </button>
                          </div>
                          {mensajeEditando?.id === citacion.id ? (
                            <div>
                              <textarea
                                value={mensajeEditando?.texto ?? ''}
                                onChange={(e) => setMensajeEditando(prev => prev ? { ...prev, texto: e.target.value } : null)}
                                rows={8}
                                className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-3 py-2 text-xs text-ch-muted font-mono focus:outline-none focus:border-ch-muted resize-none"
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => startTransition(async () => { await actualizarMensajeCitacion(citacion.id, id, mensajeEditando.texto); setMensajeEditando(null); recargar() })}
                                  className="text-xs bg-ch-cream text-ch-dark font-medium px-3 py-1.5 rounded-[2px] hover:bg-white transition-colors"
                                >
                                  Guardar
                                </button>
                                <button onClick={() => setMensajeEditando(null)} className="text-xs text-ch-muted px-3 py-1.5 hover:text-ch-cream">Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <pre className="text-xs text-ch-muted bg-ch-surface rounded-[2px] px-3 py-3 whitespace-pre-wrap font-mono">{mensajeActual}</pre>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => copiar(mensajeActual, `msg-${citacion.id}`)} className="text-xs border border-ch-border px-3 py-1.5 rounded-[2px] text-ch-muted hover:border-ch-muted hover:text-ch-cream transition-colors">
                            {copiado === `msg-${citacion.id}` ? '✓ Copiado' : 'Copiar mensaje'}
                          </button>
                          <button onClick={() => copiar(link!, `link-${citacion.id}`)} className="text-xs border border-ch-border px-3 py-1.5 rounded-[2px] text-ch-muted hover:border-ch-muted hover:text-ch-cream transition-colors">
                            {copiado === `link-${citacion.id}` ? '✓ Copiado' : 'Copiar link'}
                          </button>
                          {persona.telefono && (
                            <a href={`https://wa.me/${persona.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensajeActual)}`} target="_blank" rel="noopener noreferrer" className="text-xs border border-ch-border px-3 py-1.5 rounded-[2px] text-ch-muted hover:border-ch-muted hover:text-ch-cream transition-colors">
                              Abrir WhatsApp
                            </a>
                          )}
                          <button
                            onClick={() => startTransition(async () => { await marcarWhatsappEnviado(citacion.id, id); recargar() })}
                            className={`text-xs border px-3 py-1.5 rounded-[2px] transition-colors ${citacion.whatsapp_enviado ? 'border-emerald-800 text-emerald-500 bg-emerald-950/30' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}
                          >
                            {citacion.whatsapp_enviado ? '✓ WA enviado' : 'Marcar WA enviado'}
                          </button>
                          {persona.email && (
                            <button
                              onClick={() => startTransition(async () => { await enviarEmailCitacion(citacion.id, id); recargar() })}
                              disabled={isPending}
                              className={`text-xs border px-3 py-1.5 rounded-[2px] transition-colors ${citacion.email_enviado_at ? 'border-emerald-800 text-emerald-500 bg-emerald-950/30' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
                            >
                              {citacion.email_enviado_at ? '✓ Email enviado' : 'Enviar email'}
                            </button>
                          )}
                          <a href={link!} target="_blank" rel="noopener noreferrer" className="text-xs text-ch-subtle px-3 py-1.5 hover:text-ch-muted transition-colors">
                            Ver portal →
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
