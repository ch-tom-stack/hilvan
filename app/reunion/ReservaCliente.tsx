'use client'

import { useMemo, useState } from 'react'

interface SlotISO { inicio: string; fin: string }

const TZ = 'America/Santiago'
const ROJO = '#C11700'
const TINTA = '#0A0A0A'
const OPACO = '#353135'

const fmtDiaKey = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const fmtDiaLabel = (d: Date) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' }).format(d)
const fmtHora = (d: Date) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
const fmtLargo = (d: Date) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const kicker: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 500, color: OPACO }
const label: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 500, color: OPACO, display: 'block', marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', fontSize: 15, padding: '10px 12px', border: `1px solid ${TINTA}20`, borderRadius: 2, background: '#fff', color: TINTA, outline: 'none' }

export default function ReservaCliente({ slots }: { slots: SlotISO[] }) {
  const [sel, setSel] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', email: '', sitio_web: '', instagram: '', motivo: '', empresa: '' })
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  const dias = useMemo(() => {
    const map = new Map<string, { label: string; slots: { iso: string; hora: string }[] }>()
    for (const s of slots) {
      const d = new Date(s.inicio)
      const key = fmtDiaKey(d)
      if (!map.has(key)) map.set(key, { label: fmtDiaLabel(d), slots: [] })
      map.get(key)!.slots.push({ iso: s.inicio, hora: fmtHora(d) })
    }
    return [...map.values()]
  }, [slots])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const puedeEnviar = sel && form.nombre.trim() && EMAIL_RE.test(form.email.trim()) && estado !== 'enviando'

  async function enviar() {
    if (!puedeEnviar) return
    setEstado('enviando'); setMsg('')
    try {
      const res = await fetch('/api/reunion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, inicio: sel }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setEstado('error'); setMsg(data?.error || 'No pudimos agendar. Intenta de nuevo.'); return }
      setEstado('ok')
    } catch {
      setEstado('error'); setMsg('No pudimos agendar. Revisa tu conexión e intenta de nuevo.')
    }
  }

  if (estado === 'ok') {
    return (
      <Shell>
        <p style={kicker}>Listo</p>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '10px 0 14px' }}>Quedó agendada</h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, color: TINTA }}>
          Nos vemos el <strong>{sel && fmtLargo(new Date(sel))}</strong> (hora de Santiago).
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: OPACO, marginTop: 10 }}>
          Te enviamos la confirmación a <strong>{form.email}</strong>. Si necesitas cambiar el horario, respóndenos ese correo.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <p style={kicker}>Agenda una reunión</p>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 8px', letterSpacing: '-0.01em' }}>Conversemos</h1>
      <p style={{ fontSize: 16, lineHeight: 1.5, color: OPACO, maxWidth: 520 }}>
        Elige un horario y cuéntanos algo de ti. Es una videollamada de 30 minutos.
      </p>

      {/* ── Selector de horarios ──────────────────────────────── */}
      <div style={{ marginTop: 28 }}>
        <p style={label}>Elige un horario</p>
        {dias.length === 0 ? (
          <p style={{ fontSize: 15, color: OPACO }}>
            No hay horarios disponibles en las próximas dos semanas. Escríbenos a{' '}
            <a href="mailto:natalia@casahiedra.com" style={{ color: TINTA }}>natalia@casahiedra.com</a>.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6 }}>
            {dias.map((dia) => (
              <div key={dia.label} style={{ minWidth: 118 }}>
                <p style={{ fontSize: 12, textTransform: 'capitalize', color: TINTA, marginBottom: 8, fontWeight: 700 }}>{dia.label}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dia.slots.map((s) => {
                    const activo = sel === s.iso
                    return (
                      <button key={s.iso} type="button" onClick={() => setSel(s.iso)}
                        style={{
                          fontSize: 14, padding: '8px 10px', borderRadius: 2, cursor: 'pointer',
                          border: `1px solid ${activo ? TINTA : TINTA + '25'}`,
                          background: activo ? TINTA : '#fff', color: activo ? '#fff' : TINTA,
                          fontWeight: activo ? 600 : 400, transition: 'all .12s',
                        }}>
                        {s.hora}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Formulario ────────────────────────────────────────── */}
      <div style={{ marginTop: 30, maxWidth: 520 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={label} htmlFor="nombre">Nombre *</label>
            <input id="nombre" style={inputStyle} value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </div>
          <div>
            <label style={label} htmlFor="email">Email *</label>
            <input id="email" type="email" style={inputStyle} value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={label} htmlFor="sitio">Sitio web</label>
              <input id="sitio" style={inputStyle} placeholder="Opcional" value={form.sitio_web} onChange={(e) => set('sitio_web', e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={label} htmlFor="ig">Instagram</label>
              <input id="ig" style={inputStyle} placeholder="Opcional" value={form.instagram} onChange={(e) => set('instagram', e.target.value)} />
            </div>
          </div>
          <div>
            <label style={label} htmlFor="motivo">¿De qué quieres hablar?</label>
            <textarea id="motivo" rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Opcional" value={form.motivo} onChange={(e) => set('motivo', e.target.value)} />
          </div>
          {/* Honeypot anti-bot: oculto para humanos. */}
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.empresa}
            onChange={(e) => set('empresa', e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
        </div>

        {estado === 'error' && <p style={{ color: ROJO, fontSize: 14, marginTop: 14 }}>{msg}</p>}

        <button type="button" onClick={enviar} disabled={!puedeEnviar}
          style={{
            marginTop: 22, background: ROJO, color: '#fff', fontWeight: 500, textTransform: 'uppercase',
            letterSpacing: '0.14em', fontSize: 13, padding: '12px 24px', borderRadius: 2, border: 'none',
            cursor: puedeEnviar ? 'pointer' : 'not-allowed', opacity: puedeEnviar ? 1 : 0.4,
          }}>
          {estado === 'enviando' ? 'Agendando…' : 'Agendar reunión'}
        </button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 80px' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/logo-horizontal-negro.png" alt="Casa Hiedra" style={{ height: 34, marginBottom: 40 }} />
      {children}
      <p style={{ marginTop: 56, fontSize: 12, color: '#9a9a92', letterSpacing: '0.04em' }}>
        Casa Hiedra
      </p>
    </main>
  )
}
