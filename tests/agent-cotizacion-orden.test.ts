import { describe, it, expect } from 'vitest'
import { planOrden, buscarHermano } from '@/lib/agent-cotizacion-orden'

const G = (...xs: [string, string, number][]) => xs.map(([id, nombre, orden]) => ({ id, nombre, orden }))
const nombres = (r: ReturnType<typeof planOrden>) => (r.ok ? r.despues.map(x => x.nombre).join(' > ') : r.error)

describe('planOrden', () => {
  const grupos = G(['1', 'Cámara', 0], ['2', 'Arte', 1], ['3', 'PRODUCCIÓN', 2], ['4', 'Post', 3])

  it('lo nombrado va primero y el resto conserva su orden', () => {
    expect(nombres(planOrden(grupos, ['produccion', 'camara']))).toBe('PRODUCCIÓN > Cámara > Arte > Post')
  })

  it('renumera sin huecos y solo reporta lo que cambió', () => {
    const r = planOrden(grupos, ['Post'])
    expect(r.ok && r.despues.map(x => x.orden)).toEqual([0, 1, 2, 3])
    expect(r.ok && r.cambios.length).toBe(4)
    const igual = planOrden(grupos, ['Cámara', 'Arte'])
    expect(igual.ok && igual.cambios).toEqual([])
  })

  it('resuelve empates aunque el orden visible no cambie (ítems históricos en 99)', () => {
    const r = planOrden(G(['a', 'Director', 99], ['b', 'Gaffer', 99], ['c', 'Sonido', 99]), ['Director'])
    expect(r.ok && r.despues.map(x => x.orden)).toEqual([0, 1, 2])
    expect(r.ok && r.cambios.length).toBe(3)
  })

  it('un nombre que no existe dice cuáles hay; no escribe nada', () => {
    const r = planOrden(grupos, ['Vestuario'])
    expect(r.ok).toBe(false)
    expect(nombres(r)).toContain('"Cámara"')
  })

  it('dos ítems con el mismo nombre: exige el id en vez de adivinar', () => {
    const items = G(['11111111-1111-4111-8111-111111111111', 'Asistente', 0], ['22222222-2222-4222-8222-222222222222', 'Asistente', 1], ['x', 'Foquista', 2])
    expect(nombres(planOrden(items, ['Asistente']))).toContain('calza con 2')
    expect(nombres(planOrden(items, ['22222222-2222-4222-8222-222222222222']))).toBe('Asistente > Asistente > Foquista')
    const r = planOrden(items, ['22222222-2222-4222-8222-222222222222'])
    expect(r.ok && r.despues[0].id).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('rechaza repetidos, listas vacías y un id de otro grupo', () => {
    expect(nombres(planOrden(grupos, ['Arte', 'arte']))).toContain('repetido')
    expect(planOrden(grupos, []).ok).toBe(false)
    expect(buscarHermano(grupos, '99999999-9999-4999-8999-999999999999').ok).toBe(false)
  })
})
