'use client'

import { useMemo, useState } from 'react'

interface SlotISO { inicio: string; disponible: boolean }
interface DiaISO { key: string; slots: SlotISO[] }

const TZ = 'America/Santiago'
const ROJO = '#C11700'
const TINTA = '#0A0A0A'
const OPACO = '#353135'
const LINEA = '#0A0A0A22'

const SITIO = 'https://casahiedra.com'
const NAV_LINKS = [
  { href: SITIO, label: 'Inicio' },
  { href: `${SITIO}/productos`, label: 'Productos' },
  { href: `${SITIO}/archivo`, label: 'Archivo' },
  { href: `${SITIO}/la-casa`, label: 'La casa' },
]

const fmtDiaLabel = (d: Date) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' }).format(d)
const fmtHora = (d: Date) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
const fmtLargo = (d: Date) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const label: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 500, color: OPACO, display: 'block', marginBottom: 5 }
const input: React.CSSProperties = { width: '100%', fontSize: 14, padding: '8px 10px', border: `1px solid ${LINEA}`, borderRadius: 2, background: '#fff', color: TINTA, outline: 'none' }

export default function ReservaCliente({ dias }: { dias: DiaISO[] }) {
  const [sel, setSel] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', email: '', sitio_web: '', instagram: '', motivo: '', empresa: '' })
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  const diasFmt = useMemo(
    () => dias.map((dia) => ({
      label: fmtDiaLabel(new Date(dia.slots[0]?.inicio ?? dia.key)),
      slots: dia.slots.map((s) => ({ iso: s.inicio, hora: fmtHora(new Date(s.inicio)), disponible: s.disponible })),
    })),
    [dias],
  )

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const puedeEnviar = !!sel && form.nombre.trim() && EMAIL_RE.test(form.email.trim()) && estado !== 'enviando'

  async function enviar() {
    if (!puedeEnviar) return
    setEstado('enviando'); setMsg('')
    try {
      const res = await fetch('/api/reunion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, inicio: sel }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setEstado('error'); setMsg(data?.error || 'No pudimos agendar. Intenta de nuevo.'); return }
      setEstado('ok')
    } catch { setEstado('error'); setMsg('No pudimos agendar. Revisa tu conexión e intenta de nuevo.') }
  }

  return (
    <div className="reunion-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <style>{`
        @media (max-width: 720px) {
          .reunion-root { height: auto !important; min-height: 100vh; overflow: visible !important; }
          .reunion-nav { padding: 12px 18px !important; }
          .reunion-navlinks { display: none !important; }
          .reunion-main { flex-direction: column !important; gap: 24px !important; padding: 20px 18px 32px !important; }
          .reunion-col-form { width: 100% !important; }
        }
      `}</style>
      <Nav />
      {estado === 'ok' ? (
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 460 }}>
            <p style={{ ...label, marginBottom: 8 }}>Listo</p>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: '0 0 14px' }}>Quedó agendada</h1>
            <p style={{ fontSize: 16, lineHeight: 1.5 }}>
              Nos vemos el <strong>{sel && fmtLargo(new Date(sel))}</strong> (hora de Santiago).
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: OPACO, marginTop: 10 }}>
              Te enviamos la confirmación a <strong>{form.email}</strong>. Si necesitas cambiar el horario, respóndenos ese correo.
            </p>
          </div>
        </main>
      ) : (
        <main className="reunion-main" style={{ flex: 1, minHeight: 0, display: 'flex', gap: 40, padding: '28px 40px 24px', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
          {/* Columna izquierda: intro + formulario + CTA */}
          <div className="reunion-col-form" style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <p style={label}>Agenda una reunión</p>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: '6px 0 8px', letterSpacing: '-0.01em' }}>Conversemos</h1>
            <p style={{ fontSize: 15, lineHeight: 1.45, color: OPACO, marginBottom: 20 }}>
              Elige un horario y cuéntanos algo de ti. Es una videollamada de 30 minutos.
            </p>
            <div style={{ display: 'grid', gap: 11 }}>
              <div>
                <label style={label} htmlFor="nombre">Nombre *</label>
                <input id="nombre" style={input} value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
              </div>
              <div>
                <label style={label} htmlFor="email">Email *</label>
                <input id="email" type="email" style={input} value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 11 }}>
                <div style={{ flex: 1 }}>
                  <label style={label} htmlFor="sitio">Sitio web</label>
                  <input id="sitio" style={input} placeholder="Opcional" value={form.sitio_web} onChange={(e) => set('sitio_web', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={label} htmlFor="ig">Instagram</label>
                  <input id="ig" style={input} placeholder="Opcional" value={form.instagram} onChange={(e) => set('instagram', e.target.value)} />
                </div>
              </div>
              <div>
                <label style={label} htmlFor="motivo">¿De qué quieres hablar?</label>
                <textarea id="motivo" rows={2} style={{ ...input, resize: 'none' }} placeholder="Opcional" value={form.motivo} onChange={(e) => set('motivo', e.target.value)} />
              </div>
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.empresa}
                onChange={(e) => set('empresa', e.target.value)}
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
            </div>
            {estado === 'error' && <p style={{ color: ROJO, fontSize: 13, marginTop: 10 }}>{msg}</p>}
            <button type="button" onClick={enviar} disabled={!puedeEnviar}
              style={{
                marginTop: 16, alignSelf: 'flex-start', background: ROJO, color: '#fff', fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 13, padding: '12px 24px',
                borderRadius: 2, border: 'none', cursor: puedeEnviar ? 'pointer' : 'not-allowed', opacity: puedeEnviar ? 1 : 0.35,
              }}>
              {estado === 'enviando' ? 'Agendando…' : sel ? 'Agendar reunión' : 'Elige un horario'}
            </button>
          </div>

          {/* Columna derecha: grilla de horarios (con bloqueados visibles) */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <p style={label}>Elige un horario</p>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8 }}>
              {diasFmt.map((dia) => (
                <div key={dia.label} style={{ minWidth: 92, flexShrink: 0 }}>
                  <p style={{ fontSize: 11, textTransform: 'capitalize', color: TINTA, marginBottom: 7, fontWeight: 700 }}>{dia.label}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {dia.slots.map((s) => {
                      if (!s.disponible) {
                        return (
                          <span key={s.iso} aria-disabled title="No disponible"
                            style={{ fontSize: 13, padding: '6px 8px', borderRadius: 2, textAlign: 'center', border: `1px solid ${LINEA}`, background: '#F4F2EE', color: '#B9B6B0', textDecoration: 'line-through', userSelect: 'none' }}>
                            {s.hora}
                          </span>
                        )
                      }
                      const activo = sel === s.iso
                      return (
                        <button key={s.iso} type="button" onClick={() => setSel(s.iso)}
                          style={{
                            fontSize: 13, padding: '6px 8px', borderRadius: 2, cursor: 'pointer',
                            border: `1px solid ${activo ? TINTA : TINTA + '30'}`,
                            background: activo ? TINTA : '#fff', color: activo ? '#fff' : TINTA,
                            fontWeight: activo ? 600 : 400,
                          }}>
                          {s.hora}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}
    </div>
  )
}

function Nav() {
  return (
    <header className="reunion-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 40px', borderBottom: `1px solid ${LINEA}`, flexShrink: 0 }}>
      <a href={SITIO} aria-label="Casa Hiedra — inicio">
        {/* logo-horizontal-blanco = logo oscuro para FONDOS CLAROS (convención del repo). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/logo-horizontal-blanco.png" alt="Casa Hiedra" style={{ height: 26, display: 'block' }} />
      </a>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        {/* Links al sitio: se ocultan en móvil para que el header no desborde;
            el logo ya lleva al inicio y el botón Hablemos se mantiene. */}
        <span className="reunion-navlinks" style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} style={{ fontSize: 14, color: TINTA, textDecoration: 'none' }}>{l.label}</a>
          ))}
        </span>
        <a href="mailto:hola@casahiedra.com" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', color: TINTA, textDecoration: 'none', border: `1px solid ${TINTA}`, borderRadius: 2, padding: '7px 16px' }}>
          Hablemos
        </a>
      </nav>
    </header>
  )
}
