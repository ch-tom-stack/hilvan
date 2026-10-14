// Imágenes remotas para los PDF (react-pdf).
//
// react-pdf solo decodifica PNG y JPEG, y si una imagen remota no carga (404,
// timeout, WEBP/SVG/GIF subido con `accept="image/*"`) el render completo lanza
// y el PDF sale en 500. Se descargan acá, se validan por firma de bytes y se
// pasan como data URI; lo que no sirve se omite (el PDF sale sin esa imagen).

const TIMEOUT_MS = 6000
const MAX_BYTES = 8 * 1024 * 1024

export function tipoImagenPdf(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  return null
}

/** Devuelve un data URI PNG/JPEG, o `undefined` si no se pudo usar. Nunca lanza. */
export async function imagenParaPdf(url: string | null | undefined): Promise<string | undefined> {
  if (!url || typeof url !== 'string') return undefined
  if (url.startsWith('data:image/png') || url.startsWith('data:image/jpeg')) return url
  if (!/^https?:\/\//i.test(url)) return undefined
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return undefined
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return undefined
    const tipo = tipoImagenPdf(bytes)
    if (!tipo) return undefined
    return `data:${tipo};base64,${Buffer.from(bytes).toString('base64')}`
  } catch (e) {
    console.error('[pdf] imagen omitida:', url, e instanceof Error ? e.message : e)
    return undefined
  }
}
