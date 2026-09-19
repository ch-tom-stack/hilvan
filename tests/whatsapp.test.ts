import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { normalizarTelefono, leerWebhook, firmaValida, diaChile, agruparPorDia, type FilaMensaje } from '@/lib/whatsapp'

const envolver = (field: string, value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '1', changes: [{ field, value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '56911112222' }, ...value } }] }],
})

describe('normalizarTelefono', () => {
  it('lleva las formas escritas a mano al formato de Meta', () => {
    expect(normalizarTelefono('+56 9 1234 5678')).toBe('56912345678')
    expect(normalizarTelefono('(569) 1234-5678')).toBe('56912345678')
    expect(normalizarTelefono('912345678')).toBe('56912345678')
    expect(normalizarTelefono('0056912345678')).toBe('56912345678')
    expect(normalizarTelefono('16505551234')).toBe('16505551234')
  })
  it('prefiere no calzar antes que calzar mal', () => {
    expect(normalizarTelefono('12345678')).toBeNull()   // fijo sin código: ambiguo
    expect(normalizarTelefono('sin teléfono')).toBeNull()
    expect(normalizarTelefono('')).toBeNull()
    expect(normalizarTelefono(null)).toBeNull()
  })
})

describe('leerWebhook', () => {
  it('messages: lo que nos escriben, con nombre de perfil', () => {
    const r = leerWebhook(envolver('messages', {
      contacts: [{ wa_id: '56912345678', profile: { name: 'Paola Castro' } }],
      messages: [{ from: '56912345678', id: 'wamid.A', timestamp: '1758300000', type: 'text', text: { body: ' Hola! ' } }],
    }))
    expect(r.mensajes).toHaveLength(1)
    expect(r.mensajes[0]).toMatchObject({ wa_id: 'wamid.A', telefono: '56912345678', direccion: 'recibido', texto: 'Hola!', origen: 'webhook' })
    expect(r.nombres['56912345678']).toBe('Paola Castro')
  })

  it('smb_message_echoes: lo que mandamos desde el celular — la contraparte es `to`', () => {
    const r = leerWebhook(envolver('smb_message_echoes', {
      message_echoes: [{ from: '56911112222', to: '56912345678', id: 'wamid.B', timestamp: '1758300100', type: 'text', text: { body: 'Te mando la cotización' } }],
    }))
    expect(r.mensajes[0]).toMatchObject({ telefono: '56912345678', direccion: 'enviado' })
  })

  it('history: la dirección sale de comparar `from` con el id del hilo', () => {
    const r = leerWebhook(envolver('history', {
      history: [{
        metadata: { phase: 0, chunk_order: 1, progress: 55 },
        threads: [{
          id: '56912345678',
          messages: [
            { from: '56911112222', id: 'wamid.H1', timestamp: '1739230955', type: 'text', text: { body: 'Info' }, history_context: { status: 'READ' } },
            { from: '56911112222', id: 'wamid.H2', timestamp: '1739230970', type: 'media_placeholder' },
            { from: '56912345678', id: 'wamid.H3', timestamp: '1739230980', type: 'text', text: { body: 'Gracias!' } },
          ],
        }],
      }],
    }))
    expect(r.mensajes.map(m => m.direccion)).toEqual(['enviado', 'enviado', 'recibido'])
    expect(r.mensajes.every(m => m.origen === 'historial' && m.telefono === '56912345678')).toBe(true)
    expect(r.mensajes[1]).toMatchObject({ tipo: 'media_placeholder', texto: null })
  })

  it('history rechazado por el negocio: se reporta, no se inventan mensajes', () => {
    const r = leerWebhook(envolver('history', {
      history: [{ errors: [{ code: 2593109, title: 'History sync is turned off by the business from the WhatsApp Business App' }] }],
    }))
    expect(r.mensajes).toHaveLength(0)
    expect(r.errores[0]).toContain('2593109')
  })

  it('descarta reacciones, avisos de estado y basura sin romperse', () => {
    const r = leerWebhook(envolver('messages', {
      statuses: [{ id: 'wamid.X', status: 'read' }],
      messages: [
        { from: '56912345678', id: 'wamid.R', timestamp: '1758300000', type: 'reaction', reaction: { emoji: '👍' } },
        { from: '56912345678', timestamp: '1758300000', type: 'text', text: { body: 'sin id' } },
        { from: '56912345678', id: 'wamid.T', timestamp: 'no-es-fecha', type: 'text', text: { body: 'x' } },
      ],
    }))
    expect(r.mensajes).toHaveLength(0)
    expect(leerWebhook(null).mensajes).toEqual([])
    expect(leerWebhook({ entry: 'x' }).mensajes).toEqual([])
  })

  it('una foto con pie de foto conserva el texto', () => {
    const r = leerWebhook(envolver('messages', {
      messages: [{ from: '56912345678', id: 'wamid.I', timestamp: '1758300000', type: 'image', image: { id: 'm1', caption: 'el vestido' } }],
    }))
    expect(r.mensajes[0]).toMatchObject({ tipo: 'image', texto: 'el vestido' })
  })
})

describe('firmaValida', () => {
  const cuerpo = '{"object":"whatsapp_business_account"}'
  const secreto = 'app-secret-de-prueba'
  const firma = 'sha256=' + createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('hex')

  it('acepta la firma correcta y rechaza todo lo demás', () => {
    expect(firmaValida(cuerpo, firma, secreto)).toBe(true)
    expect(firmaValida(cuerpo + ' ', firma, secreto)).toBe(false)
    expect(firmaValida(cuerpo, firma, 'otro-secreto')).toBe(false)
    expect(firmaValida(cuerpo, null, secreto)).toBe(false)
    expect(firmaValida(cuerpo, 'sha256=zz', secreto)).toBe(false)
    expect(firmaValida(cuerpo, firma, '')).toBe(false)
  })
})

describe('agruparPorDia', () => {
  const fila = (id: string, iso: string, direccion: 'enviado' | 'recibido', texto: string | null = 'x', prospecto = 'p1'): FilaMensaje =>
    ({ id, prospecto_id: prospecto, direccion, tipo: texto ? 'text' : 'audio', texto, enviado_at: iso })

  it('el día es el de Chile, no el UTC', () => {
    // 02:30 UTC del 20 es 22:30 (o 23:30) del 19 en Santiago.
    expect(diaChile('2026-09-20T02:30:00.000Z')).toBe('2026-09-19')
  })

  it('agrupa por prospecto y día, y sabe quién habló último', () => {
    const g = agruparPorDia([
      fila('3', '2026-09-15T18:00:00.000Z', 'recibido', null),
      fila('1', '2026-09-15T15:00:00.000Z', 'enviado'),
      fila('2', '2026-09-15T16:00:00.000Z', 'recibido'),
      fila('4', '2026-09-16T15:00:00.000Z', 'enviado'),
      fila('5', '2026-09-15T15:30:00.000Z', 'enviado', 'x', 'p2'),
    ])
    expect(g).toHaveLength(3)
    const p1dia15 = g.find(c => c.prospecto_id === 'p1' && c.fecha === '2026-09-15')!
    expect(p1dia15).toMatchObject({ enviados: 1, recibidos: 2, ultimo: 'recibido', sin_texto: 1 })
    expect(p1dia15.mensajes.map(m => m.id)).toEqual(['1', '2', '3'])
    expect(g.find(c => c.fecha === '2026-09-16')!.ultimo).toBe('enviado')
  })
})
