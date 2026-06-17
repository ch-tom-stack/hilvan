// Barrel de financiero — re-exporta las server actions y tipos desde los
// sub-módulos por dominio (T11). Los consumidores existentes siguen importando
// desde '@/app/actions/financiero' sin cambios. Cada sub-módulo conserva su
// propia directiva 'use server'; este archivo solo reexporta.

// ── Config (PPM, Previred, IUSC, Nómina) ──────────────────────────────────────
export {
  getPPMTasa, setPPMTasa,
  getPreviredMensual, setPreviredMensual,
  getIUSCMensual, setIUSCMensual,
  getNomina, setNomina,
} from './financiero-config'

// ── Tipos / nómina compartidos ────────────────────────────────────────────────
export type { PersonaNomina } from './financiero-helpers'

// ── Estado de resultados, cuentas por cobrar y exportación al contador ────────
export {
  getDatosFinancieros, getResumenPeriodo,
  getCuentasPorCobrar, getCuentasPorPagar,
  getResumenContador, getResumenContadorEstimado,
} from './financiero-resultados'
export type {
  FilaCotizacion, FilaGasto, FilaCuota, FilaInversion,
  DatosFinancieros, ResumenPeriodo,
  FilaCobrar, DatosCobrar,
  FilaPagar, DatosPagar,
  GastoContador, InversionContador, ResumenContador,
  ResumenContadorEstimado,
} from './financiero-resultados'

// ── Flujo de caja ─────────────────────────────────────────────────────────────
export {
  getDatosFlujo,
  upsertAperturaCaja, cerrarPeriodoCaja,
  agregarMovimientoFlujo, editarMovimientoFlujo, eliminarMovimientoFlujo,
} from './financiero-flujo'
export type {
  OrigenMovimiento, MovimientoFlujo, CierreMesAnterior, DatosFlujo,
} from './financiero-flujo'

// ── Créditos y gastos fijos ───────────────────────────────────────────────────
export {
  getGastosFijos, crearGastoFijo, eliminarGastoFijo,
  toggleGastoFijoActivo, marcarCuotaPagada, desmarcarCuotaPagada,
} from './financiero-gastos-fijos'
