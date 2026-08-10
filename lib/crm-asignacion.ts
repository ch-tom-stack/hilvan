// Reglas de asignación de responsable (CH-10). Determinista y ESTABLE: se apoya
// en producto + tamaño + segmento (que clasifica el operador/agente), NO en la
// temperatura (el frío ya tiene dueño; reasignar al calentarse bota la curva de
// aprendizaje). Orden = primero que calza gana.
//
// Reglas (confirmadas por Tomás, ago 2026):
//   1. rental                 → Josué
//   2. estudiante             → Simón
//   3. masculino_estereotipo  → Simón   (excepción de género, pisa a Natalia)
//   4. ropa_intima_fem        → Natalia
//   5. producto = banco       → Natalia
//   6. producto = videoclip   → Simón
//   7. lookbook + mediana/grande → Tomás
//   8. tamaño grande          → Tomás   (contenido ancla / temporada)
//   9. lookbook + chica       → Natalia
//   fallback                  → Simón
// Sin `segmento` = todavía sin clasificar → null (no se asigna a ciegas).

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
  producto?: string | null   // producto_objetivo
  tamano?: string | null
  segmento?: string | null
}

/**
 * Persona a la que le toca el prospecto según las reglas, o `null` si aún no
 * está clasificado (sin segmento) — en ese caso queda "por clasificar".
 */
export function personaSegunReglas(p: EjesAsignacion): PersonaCrm | null {
  const seg = p.segmento
  const prod = p.producto
  const tam = p.tamano

  if (!seg) return null // sin clasificar: el operador/agente debe fijar segmento

  if (seg === 'rental') return 'josue'
  if (seg === 'estudiante') return 'simon'
  if (seg === 'masculino_estereotipo') return 'simon'
  if (seg === 'ropa_intima_fem') return 'natalia'
  if (prod === 'banco') return 'natalia'
  if (prod === 'videoclip') return 'simon'
  if (prod === 'lookbook' && (tam === 'mediana' || tam === 'grande')) return 'tomas'
  if (tam === 'grande') return 'tomas'
  if (prod === 'lookbook' && tam === 'chica') return 'natalia'
  return 'simon' // fallback
}
