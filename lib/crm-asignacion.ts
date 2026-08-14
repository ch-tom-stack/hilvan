// Reglas de asignación de responsable (CH-10). Determinista y ESTABLE: se apoya
// en producto + tamaño + rubro + tipo de cliente (que clasifica el operador o el
// agente), NO en la temperatura (el frío ya tiene dueño; reasignar al calentarse
// bota la curva de aprendizaje). Orden = primero que calza gana.
//
// Reglas (confirmadas por Tomás, ago 2026):
//   1. rubro = rental          → Josué
//   2. cliente = estudiante    → Simón
//   3. rubro = deporte/herram. → Simón
//   4. rubro = moda íntima     → Natalia
//   5. producto = banco        → Natalia
//   6. producto = videoclip    → Simón
//   7. lookbook + mediana/grande → Tomás
//   8. tamaño grande           → Tomás   (contenido ancla / temporada)
//   9. lookbook + chica        → Natalia
//   fallback                   → Simón
//
// Sin `rubro` = todavía sin clasificar → null (no se asigna a ciegas).
//
// ── Sobre el cambio de ejes (ago-2026) ───────────────────────────────────────
// Antes había un solo eje, `segmento`, con valores como 'ropa_intima_fem' y
// 'masculino_estereotipo': clasificaba el trabajo por el género de quien
// aparece o compra, cuando "deportes/herramientas" son dos rubros. Además no
// repartía —45 de 66 prospectos caían en 'general'—, así que en los hechos casi
// todo se resolvía por producto y tamaño.
//
// Se separó en dos preguntas distintas, que es lo que siempre fueron: de qué es
// la marca (rubro) y con quién se trabaja (tipo de cliente). A cada persona le
// toca EXACTAMENTE lo mismo que antes: cambió cómo se nombra, no quién trabaja
// qué.

export type PersonaCrm = 'tomas' | 'natalia' | 'simon' | 'josue'

// Email real de cada operador (confirmado, ver /usuarios). Se resuelve a
// profile_id en runtime. NO inferido.
export const OPERADOR_EMAIL: Record<PersonaCrm, string> = {
  tomas:   'tomasmontealegrem@gmail.com',
  natalia: 'nataliaalejandra.r@gmail.com',
  simon:   'simonpedrofernandezsilva@gmail.com',
  josue:   'josuedelafuenteruiz@gmail.com',
}

export interface EjesAsignacion {
  producto?: string | null      // producto_objetivo
  tamano?: string | null
  rubro?: string | null         // de qué es la marca
  tipo_cliente?: string | null  // con quién se trabaja
}

/**
 * Persona a la que le toca el prospecto según las reglas, o `null` si aún no
 * está clasificado (sin rubro) — en ese caso queda "por clasificar".
 */
export function personaSegunReglas(p: EjesAsignacion): PersonaCrm | null {
  const rubro = p.rubro
  const cliente = p.tipo_cliente
  const prod = p.producto
  const tam = p.tamano

  // El rubro es lo que decide: sin él no se asigna a ciegas. El tipo de cliente
  // solo, sin saber de qué es la marca, no alcanza para elegir bien.
  if (!rubro) return null

  if (rubro === 'rental') return 'josue'
  if (cliente === 'estudiante') return 'simon'
  if (rubro === 'deporte' || rubro === 'herramientas') return 'simon'
  if (rubro === 'moda_intima') return 'natalia'
  if (prod === 'banco') return 'natalia'
  if (prod === 'videoclip') return 'simon'
  if (prod === 'lookbook' && (tam === 'mediana' || tam === 'grande')) return 'tomas'
  if (tam === 'grande') return 'tomas'
  if (prod === 'lookbook' && tam === 'chica') return 'natalia'
  return 'simon' // fallback
}
