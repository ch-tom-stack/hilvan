import { describe, it, expect, afterEach } from 'vitest'
import { htmlAvisoLead, asuntoAvisoLead, escaparHtml, destinatariosAvisoLead, type DatosAvisoLead } from '@/lib/crm-aviso-lead'

const base: DatosAvisoLead = {
  prospecto_id: '11111111-1111-4111-8111-111111111111', empresa: 'Elipse.ai', nombre: 'Ana Pérez',
  email: 'ana@elipse.ai', origen: 'landing', producto: 'banco', accion: 'descargo_precios',
  pagina: '/banco', campana: 'instagram_video_agosto', url: 'https://elipse.ai', contenido: 'Plazo: este mes', hayLectura: false,
}

describe('aviso de lead nuevo', () => {
  it('trae lo que el sitio sabe y el link a la ficha', () => {
    const h = htmlAvisoLead(base)
    expect(h).toContain('Elipse.ai')
    expect(h).toContain('descargó los precios')
    expect(h).toContain('instagram_video_agosto')
    expect(h).toContain('https://app.casahiedra.com/crm/11111111-1111-4111-8111-111111111111')
  })

  it('lo que escribe un desconocido en el formulario nunca llega como HTML', () => {
    const h = htmlAvisoLead({ ...base, empresa: '<img src=x onerror=alert(1)>', contenido: '<a href="http://malo">clic</a>' })
    expect(h).not.toContain('<img')
    expect(h).not.toContain('<a href="http://malo"')
    expect(h).toContain('&lt;img')
    expect(escaparHtml(`"&'<>`)).toBe('&quot;&amp;&#39;&lt;&gt;')
  })

  it('el asunto no acepta saltos de línea (inyección de cabeceras)', () => {
    expect(asuntoAvisoLead({ ...base, empresa: 'Marca\r\nBcc: otro@x.com' })).toBe('Lead nuevo · Marca Bcc: otro@x.com · banco')
  })

  it('no repite el nombre cuando es el mismo que la empresa o el correo, y corta textos largos', () => {
    expect(htmlAvisoLead({ ...base, nombre: 'ana@elipse.ai' })).not.toContain('Contacto')
    const h = htmlAvisoLead({ ...base, contenido: 'x'.repeat(900) })
    expect(h).toContain('x'.repeat(600) + '…')
    expect(h).not.toContain('x'.repeat(601))
  })
})

describe('destinatarios', () => {
  const previo = process.env.CRM_AVISO_LEAD_EMAILS
  afterEach(() => { if (previo === undefined) delete process.env.CRM_AVISO_LEAD_EMAILS; else process.env.CRM_AVISO_LEAD_EMAILS = previo })

  it('por defecto Natalia y Tomás; la variable los reemplaza e ignora basura', () => {
    delete process.env.CRM_AVISO_LEAD_EMAILS
    expect(destinatariosAvisoLead()).toEqual(['natalia@casahiedra.com', 'tomas@casahiedra.com'])
    process.env.CRM_AVISO_LEAD_EMAILS = ' simon@casahiedra.com , no-es-correo ,'
    expect(destinatariosAvisoLead()).toEqual(['simon@casahiedra.com'])
  })
})
