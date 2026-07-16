'use client'

import { useState, useEffect, useCallback } from 'react'

const ROJO = '#C11700'
const TINTA = '#0A0A0A'
const OPACO = '#353135'
const LINEA = '#0A0A0A22'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DESCUENTO = 10
const KEY = 'ch_rental_lead_v1' // si ya lo cerró o dejó su correo, no volver a molestar
const DELAY_MS = 20_000

// Captura de leads del tráfico de campaña que entra a Rental y no arrienda.
// Se muestra por tiempo en página O intento de salida (lo que ocurra primero).
// El lead cae en la MISMA Bandeja de Aprobación que La Lectura (origen 'rental').
export default function PopupLead() {
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [hp, setHp] = useState('') // honeypot
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  const yaVisto = () => {
    try { return localStorage.getItem(KEY) !== null } catch { return false }
  }
  const marcar = (v: string) => { try { localStorage.setItem(KEY, v) } catch { /* modo privado */ } }

  const cerrar = useCallback(() => {
    setVisible(false)
    if (estado !== 'ok') marcar('cerrado')
  }, [estado])

  useEffect(() => {
    if (yaVisto()) return
    let disparado = false
    const abrir = () => {
      if (disparado || yaVisto()) return
      disparado = true
      setVisible(true)
    }
    const t = setTimeout(abrir, DELAY_MS)
    // Exit intent: el mouse sale por arriba (desktop).
    const onLeave = (e: MouseEvent) => { if (e.clientY <= 0) abrir() }
    document.addEventListener('mouseout', onLeave)
    return () => { clearTimeout(t); document.removeEventListener('mouseout', onLeave) }
  }, [])

  // Escape para cerrar.
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, cerrar])

  const puedeEnviar = EMAIL_RE.test(email.trim()) && estado !== 'enviando'

  async function enviar() {
    if (!puedeEnviar) return
    setEstado('enviando'); setMsg('')
    try {
      const res = await fetch('/api/arriendo/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), nombre: nombre.trim() || undefined, descuento: DESCUENTO, empresa_hp: hp }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setEstado('error'); setMsg(data?.error || 'No pudimos guardarlo. Escríbenos a rental@casahiedra.com'); return }
      marcar('enviado')
      setEstado('ok')
    } catch {
      setEstado('error'); setMsg('Revisa tu conexión e intenta de nuevo.')
    }
  }

  if (!visible) return null

  return (
    <div
      onClick={cerrar}
      role="dialog"
      aria-modal="true"
      aria-label={`${DESCUENTO}% de descuento en tu primera producción`}
      style={{
        position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,10,10,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 2, maxWidth: 420, width: '100%', padding: '26px 24px', position: 'relative',
      }}>
        <button onClick={cerrar} aria-label="Cerrar" style={{
          position: 'absolute', top: 10, right: 10, width: 36, height: 36, border: 'none',
          background: 'none', cursor: 'pointer', fontSize: 18, color: OPACO, lineHeight: 1, fontFamily: 'inherit',
        }}>✕</button>

        {estado === 'ok' ? (
          <>
            <p style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: ROJO, margin: '0 0 8px', fontWeight: 700 }}>Listo</p>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 10px', lineHeight: 1.15 }}>Tu {DESCUENTO}% quedó guardado</h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: OPACO, margin: 0 }}>
              Te escribimos a <strong style={{ color: TINTA }}>{email.trim()}</strong> para coordinar tu primera producción. Mientras, sigue armando tu cotización de arriendo.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: ROJO, margin: '0 0 8px', fontWeight: 700 }}>Casa Hiedra</p>
            <h2 style={{ fontSize: 25, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.12, letterSpacing: '-0.01em' }}>
              {DESCUENTO}% en tu primera producción
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: OPACO, margin: '0 0 16px' }}>
              Déjanos tu correo y te lo guardamos para cuando lo quieras usar.
            </p>

            <div style={{ display: 'grid', gap: 9 }}>
              <input
                type="email" inputMode="email" autoComplete="email" placeholder="Tu correo *"
                value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
                style={{ width: '100%', fontSize: 16, padding: '11px 12px', border: `1px solid ${LINEA}`, borderRadius: 2, background: '#fff', color: TINTA, outline: 'none', fontFamily: 'inherit' }}
              />
              <input
                placeholder="Tu nombre (opcional)" autoComplete="name"
                value={nombre} onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
                style={{ width: '100%', fontSize: 16, padding: '11px 12px', border: `1px solid ${LINEA}`, borderRadius: 2, background: '#fff', color: TINTA, outline: 'none', fontFamily: 'inherit' }}
              />
              {/* honeypot: invisible para personas, tentador para bots */}
              <input
                tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp}
                onChange={(e) => setHp(e.target.value)}
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
              />
              {estado === 'error' && <p style={{ fontSize: 12, color: ROJO, margin: 0 }}>{msg}</p>}
              <button onClick={enviar} disabled={!puedeEnviar} style={{
                background: ROJO, color: '#fff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.13em',
                fontSize: 13, padding: '13px 20px', border: 'none', borderRadius: 2, fontFamily: 'inherit',
                cursor: puedeEnviar ? 'pointer' : 'not-allowed', opacity: puedeEnviar ? 1 : 0.4,
              }}>
                {estado === 'enviando' ? 'Guardando…' : `Quiero mi ${DESCUENTO}%`}
              </button>
              <p style={{ fontSize: 11, color: OPACO, textAlign: 'center', margin: 0 }}>
                Sin spam. Solo te contactamos por tu producción.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
