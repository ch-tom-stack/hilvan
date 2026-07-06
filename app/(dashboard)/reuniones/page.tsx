import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/types'

export const metadata = { title: 'Reuniones — Hilván' }
export const dynamic = 'force-dynamic'

interface ReunionWeb {
  id: string
  nombre: string
  email: string
  sitio_web: string | null
  instagram: string | null
  motivo: string | null
  inicio: string
  fin: string
  estado: string
  confirmada: boolean
  created_at: string
}

const fmtFecha = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))

function Fila({ r }: { r: ReunionWeb }) {
  return (
    <div className="border border-ch-border/60 bg-ch-surface px-4 py-3 flex flex-wrap items-start gap-x-6 gap-y-1">
      <div className="min-w-[150px]">
        <p className="font-body text-sm text-ch-cream capitalize">{fmtFecha(r.inicio)}</p>
        <span className={`inline-block font-body text-[9px] tracking-wider uppercase px-2 py-0.5 mt-1 border ${r.confirmada ? 'border-ch-green/40 text-ch-green' : 'border-ch-gold/40 text-ch-gold'}`}>
          {r.confirmada ? '✓ Atendida' : 'Pendiente'}
        </span>
      </div>
      <div className="flex-1 min-w-[200px]">
        <p className="font-body text-sm text-ch-cream">{r.nombre}</p>
        <p className="font-body text-xs text-ch-muted">{r.email}</p>
        {(r.sitio_web || r.instagram) && (
          <p className="font-body text-xs text-ch-subtle mt-0.5">
            {r.sitio_web && <span>{r.sitio_web}</span>}
            {r.sitio_web && r.instagram && <span> · </span>}
            {r.instagram && <span>{r.instagram}</span>}
          </p>
        )}
      </div>
      {r.motivo && <p className="font-body text-xs text-ch-muted flex-1 min-w-[200px] italic">“{r.motivo}”</p>}
    </div>
  )
}

export default async function ReunionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single<Pick<Profile, 'rol'>>()
  if (profile?.rol !== 'admin' && profile?.rol !== 'productor') redirect('/dashboard')

  const { data } = await supabase
    .from('reuniones_web')
    .select('id, nombre, email, sitio_web, instagram, motivo, inicio, fin, estado, confirmada, created_at')
    .order('inicio', { ascending: false })
  const reuniones = (data ?? []) as ReunionWeb[]

  const ahora = Date.now()
  const proximas = reuniones.filter((r) => new Date(r.inicio).getTime() >= ahora && r.estado === 'agendada')
  const pasadas = reuniones.filter((r) => !(new Date(r.inicio).getTime() >= ahora && r.estado === 'agendada'))

  return (
    <div className="max-w-4xl">
      <h1 className="font-display italic text-3xl text-ch-cream mb-1">Reuniones web</h1>
      <p className="font-body text-sm text-ch-muted mb-8">
        Reservas agendadas desde <span className="text-ch-subtle">reuniones.casahiedra.com</span>. También quedan en tu Google Calendar.
      </p>

      {reuniones.length === 0 ? (
        <p className="font-body text-sm text-ch-muted">Aún no hay reuniones agendadas.</p>
      ) : (
        <>
          {proximas.length > 0 && (
            <section className="mb-8">
              <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Próximas · {proximas.length}</p>
              <div className="flex flex-col gap-2">{proximas.map((r) => <Fila key={r.id} r={r} />)}</div>
            </section>
          )}
          {pasadas.length > 0 && (
            <section className="opacity-60">
              <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Pasadas · {pasadas.length}</p>
              <div className="flex flex-col gap-2">{pasadas.map((r) => <Fila key={r.id} r={r} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
