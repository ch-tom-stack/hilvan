import { createAdminClient } from '@/lib/supabase/admin'
import type { Equipo, CategoriaEquipo } from '@/types'
import { promoArriendoActiva } from '@/lib/cotizaciones-calc'
import { sueltoKit } from '@/lib/rental-kits'
import CatalogoCliente from './CatalogoCliente'
import NavArriendo from './NavArriendo'
import PopupLead from './PopupLead'

export const metadata = {
  title: 'Arriendo de equipos · Casa Hiedra',
  description: 'Catálogo de equipos audiovisuales para arriendo. Arma tu cotización al instante: cámaras, luces, audio y más.',
}

const SITIO = 'https://casahiedra.com'
const TINTA = '#0A0A0A'
const OPACO = '#353135'
const LINEA = '#0A0A0A22'

export default async function ArriendoPage() {
  const admin = createAdminClient()

  const [{ data: categorias }, { data: equiposData }, { data: preciosData }] = await Promise.all([
    admin.from('categorias_equipo').select('*').eq('activa', true).order('orden'),
    admin.from('equipos').select('*, categoria:categorias_equipo(*)').eq('rentable', true).order('codigo'),
    admin.from('equipos').select('codigo, precio_jornada'), // TODOS (incl. componentes ocultos) para el suelto
  ])

  const equipos = (equiposData ?? []) as (Equipo & { categoria?: CategoriaEquipo })[]
  const cats = (categorias ?? []) as CategoriaEquipo[]
  const promo = promoArriendoActiva()

  // Separar el camión (hero) y los kits (banda destacada) del catálogo individual.
  const camion = equipos.find((e) => e.codigo === 'CH-CAMION') ?? null
  const kits = equipos
    .filter((e) => e.categoria_codigo === 'KIT' && e.codigo !== 'CH-CAMION')
    .sort((a, b) => (b.precio_jornada ?? 0) - (a.precio_jornada ?? 0))
  const individuales = equipos.filter((e) => e.categoria_codigo !== 'KIT')
  const catsIndividuales = cats.filter((c) => c.codigo !== 'KIT')

  // Valor suelto derivado de los componentes de cada kit (para el tachado).
  const precioPorCodigo: Record<string, number> = {}
  for (const p of (preciosData ?? []) as { codigo: string; precio_jornada: number | null }[]) {
    precioPorCodigo[p.codigo] = p.precio_jornada ?? 0
  }
  const suelto: Record<string, number> = {}
  for (const k of [...kits, ...(camion ? [camion] : [])]) {
    const s = sueltoKit(k.codigo, precioPorCodigo)
    if (s > 0) suelto[k.codigo] = s
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Banner promo */}
      {promo && (
        <div style={{ background: '#C11700', color: '#fff', textAlign: 'center', padding: '9px 16px', fontSize: 13, letterSpacing: '0.06em' }}>
          <strong>Promo Julio–Agosto</strong> · −30% en arriendos sobre $500.000
        </div>
      )}

      {/* Nav (responsivo: hamburguesa + drawer bajo 768px) */}
      <NavArriendo />

      {/* Hero */}
      <div className="ch-pad" style={{ padding: '54px 40px 40px', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
        <p style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: OPACO, margin: '0 0 10px' }}>Casa Hiedra · Rental</p>
        <h1 className="ch-h1" style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.02, margin: '0 0 14px', maxWidth: 640 }}>
          Arriendo de equipos
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, color: OPACO, maxWidth: 560, margin: 0 }}>
          Elige tus fechas, arma tu selección y obtén una cotización al instante. Precios por jornada a la vista, con descuento por volumen. La reserva la confirmamos nosotros.
        </p>
      </div>

      {/* Catálogo + cotizador */}
      <div className="ch-pad" style={{ flex: 1, padding: '0 40px 60px', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
        <CatalogoCliente equipos={individuales} categorias={catsIndividuales} kits={kits} camion={camion} suelto={suelto} />
      </div>

      {/* Captura de lead (10% primera producción) → misma Bandeja de Aprobación */}
      <PopupLead />

      <style>{`
        @media (max-width: 768px) {
          .ch-pad { padding-left: 20px !important; padding-right: 20px !important; }
          .ch-h1 { font-size: 32px !important; }
        }
      `}</style>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${LINEA}`, padding: '26px 40px', textAlign: 'center', flexShrink: 0 }}>
        <p style={{ fontSize: 13, color: OPACO, margin: 0 }}>
          Casa Hiedra · <a href={SITIO} style={{ color: TINTA, textDecoration: 'none' }}>casahiedra.com</a> · <a href="mailto:rental@casahiedra.com" style={{ color: TINTA, textDecoration: 'none' }}>rental@casahiedra.com</a>
        </p>
      </footer>
    </div>
  )
}
