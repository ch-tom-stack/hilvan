import { describe, it, expect } from 'vitest'
import { contentDisposition, nombreArchivo, nombreArchivoAscii } from '@/lib/archivos'
import { tipoImagenPdf } from '@/lib/pdf-imagenes'

const NOMBRE_REAL = 'Claudio Valenzuela — "Un ser atrapado en otro ser" · Plan B (onírico primero, extras PM)'

describe('contentDisposition', () => {
  it('el nombre de un rodaje con raya, comillas y punto medio produce un header válido (ByteString)', () => {
    const h = contentDisposition('inline', `Hoja de llamados - ${NOMBRE_REAL}.pdf`)
    // new Headers lanza si hay chars > 255 o saltos de línea
    expect(() => new Headers({ 'Content-Disposition': h })).not.toThrow()
    expect(/^[\x20-\x7E]*$/.test(h)).toBe(true)
    expect(h.startsWith('inline; filename="')).toBe(true)
    expect(h.match(/filename="([^"]*)"/)?.[1]).toMatch(/\.pdf$/)
    expect(h).toContain("filename*=UTF-8''")
  })

  it('sin nombre usable cae al respaldo', () => {
    const h = contentDisposition('attachment', '—.pdf', 'respaldo.pdf')
    expect(h).toContain('filename="respaldo.pdf"')
  })

  it('no deja pasar saltos de línea ni comillas', () => {
    const h = contentDisposition('attachment', 'a"b\r\nc.xlsx')
    expect(h).not.toMatch(/[\r\n]/)
    expect(h.match(/filename="([^"]*)"/)?.[1]).toBe('a-b-c.xlsx')
  })
})

describe('nombreArchivo', () => {
  it('quita tildes y acota el largo', () => {
    expect(nombreArchivoAscii('Presupuesto Ñandú Ópera')).toBe('Presupuesto-Nandu-Opera')
    expect(nombreArchivo('x'.repeat(300), 'pdf').length).toBeLessThanOrEqual(84)
  })
})

describe('tipoImagenPdf', () => {
  it('solo acepta PNG y JPEG', () => {
    expect(tipoImagenPdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]))).toBe('image/png')
    expect(tipoImagenPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    // RIFF....WEBP
    expect(tipoImagenPdf(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBeNull()
    expect(tipoImagenPdf(new Uint8Array([]))).toBeNull()
  })
})
