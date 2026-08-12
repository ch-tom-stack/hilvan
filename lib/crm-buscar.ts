// Búsqueda de texto en el CRM.
//
// Vive acá y no dentro del componente porque el detalle que importa —que
// "albornoz" encuentre "Albornóz" y "aramark" encuentre "ARAMARK"— es el que
// falla a medias sin que nadie lo note: la búsqueda parece andar, hasta que
// alguien escribe una tilde y el prospecto "no existe".

/**
 * Minúsculas y sin diacríticos, para comparar como la gente escribe.
 *
 * Pliega también la ñ → n. Para buscar conviene: quien escriba "pena"
 * encuentra "Peña" y al revés. En una lista de decenas un falso positivo no
 * molesta; un falso negativo hace creer que el prospecto no existe.
 */
export function normalizar(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // marcas diacríticas combinantes
    .trim()
}

/**
 * Los campos por los que se busca un prospecto.
 *
 * Empresa y contacto son lo obvio; correo y teléfono están porque cuando llega
 * una respuesta lo único que se tiene a mano es la dirección desde la que
 * escribieron, y buscarla es la forma más rápida de dar con la ficha.
 */
export function textoBuscable(p: {
  empresa?: string | null
  nombre_contacto?: string | null
  email?: string | null
  telefono?: string | null
  producto_objetivo?: string | null
  notas?: string | null
  /** Notas sueltas (crm_notas). Reemplazaron al campo único `notas`. */
  notas_sueltas?: { cuerpo?: string | null }[] | null
}): string {
  const cuerpos = (p.notas_sueltas ?? []).map(n => n?.cuerpo ?? '')
  return normalizar([
    p.empresa, p.nombre_contacto, p.email, p.telefono, p.producto_objetivo,
    // `notas` queda por las filas anteriores a la migración; las nuevas vienen
    // en `notas_sueltas`. Buscar solo en una de las dos dejaría la mitad del
    // contenido invisible sin que nadie lo note.
    p.notas, ...cuerpos,
  ].filter(Boolean).join(' '))
}
