// Nómina del equipo técnico de un rodaje: la tabla que producción necesita para
// coordinar transporte, estacionamiento y comida. Pura: la usan la pantalla y
// el exportable a Excel, así las dos muestran siempre lo mismo.

export interface PersonaNomina {
  id: string
  nombre: string
  rol?: string | null
  rut?: string | null
  telefono?: string | null
  email?: string | null
  direccion?: string | null
  restriccion_alimentaria?: string | null
  necesita_transporte?: boolean | null
  necesita_estacionamiento?: boolean | null
  patente?: string | null
  es_jefe_departamento?: boolean | null
  hora_llamado_individual?: string | null
  departamento?: { nombre?: string | null } | null
  /** Directorio de colaboradores: completa lo que la persona no tenga cargado. */
  colaborador?: {
    rut?: string | null
    telefono?: string | null
    email?: string | null
    restricciones_alimentarias?: string | null
  } | null
}

export interface FilaNomina {
  id: string
  nombre: string
  rol: string
  departamento: string
  rut: string
  telefono: string
  email: string
  direccion: string
  restriccion: string
  transporte: boolean
  estacionamiento: boolean
  patente: string
  llamado: string
}

const SIN_DEPTO = 'Sin departamento'
const txt = (v?: string | null) => (v ?? '').trim()

export function filasNomina(equipo: PersonaNomina[]): FilaNomina[] {
  const filas = equipo.map(p => ({
    fila: {
      id: p.id,
      nombre: txt(p.nombre),
      rol: txt(p.rol),
      departamento: txt(p.departamento?.nombre) || SIN_DEPTO,
      rut: txt(p.rut) || txt(p.colaborador?.rut),
      telefono: txt(p.telefono) || txt(p.colaborador?.telefono),
      email: txt(p.email) || txt(p.colaborador?.email),
      direccion: txt(p.direccion),
      restriccion: txt(p.restriccion_alimentaria) || txt(p.colaborador?.restricciones_alimentarias),
      transporte: Boolean(p.necesita_transporte),
      estacionamiento: Boolean(p.necesita_estacionamiento),
      patente: txt(p.patente),
      llamado: txt(p.hora_llamado_individual).slice(0, 5),
    } satisfies FilaNomina,
    jefe: Boolean(p.es_jefe_departamento),
  }))
  return filas
    .sort((a, b) => {
      const sa = a.fila.departamento === SIN_DEPTO, sb = b.fila.departamento === SIN_DEPTO
      if (sa !== sb) return sa ? 1 : -1
      return a.fila.departamento.localeCompare(b.fila.departamento, 'es')
        || Number(b.jefe) - Number(a.jefe)
        || a.fila.nombre.localeCompare(b.fila.nombre, 'es')
    })
    .map(x => x.fila)
}

/** Resumen para la cabecera: cuánta logística hay que resolver. */
export function resumenNomina(filas: FilaNomina[]) {
  return {
    personas: filas.length,
    transporte: filas.filter(f => f.transporte).length,
    estacionamiento: filas.filter(f => f.estacionamiento).length,
    conRestriccion: filas.filter(f => f.restriccion).length,
    // Pidió estacionamiento pero falta la patente: lo que se olvida y bloquea en portería.
    sinPatente: filas.filter(f => f.estacionamiento && !f.patente).length,
  }
}

export const COLUMNAS_NOMINA: Array<{ clave: keyof FilaNomina; titulo: string; ancho: number }> = [
  { clave: 'nombre', titulo: 'Nombre', ancho: 26 },
  { clave: 'rol', titulo: 'Cargo', ancho: 24 },
  { clave: 'departamento', titulo: 'Departamento', ancho: 18 },
  { clave: 'rut', titulo: 'RUT', ancho: 14 },
  { clave: 'telefono', titulo: 'Teléfono', ancho: 16 },
  { clave: 'email', titulo: 'Email', ancho: 28 },
  { clave: 'direccion', titulo: 'Dirección', ancho: 34 },
  { clave: 'restriccion', titulo: 'Restricción alimentaria', ancho: 26 },
  { clave: 'transporte', titulo: 'Transporte', ancho: 12 },
  { clave: 'estacionamiento', titulo: 'Estacionamiento', ancho: 15 },
  { clave: 'patente', titulo: 'Patente', ancho: 11 },
  { clave: 'llamado', titulo: 'Llamado', ancho: 9 },
]
