// Helpers para respuestas que descargan archivos.
//
// Un header HTTP solo admite caracteres latin1 sin comillas ni saltos de línea.
// Meter el nombre de un rodaje o cotización tal cual (ej. `Claudio — "Un ser"
// · Plan A`) hace que `new NextResponse` lance TypeError ("Cannot convert
// argument to a ByteString") y la descarga cae en 500. Todo `Content-Disposition`
// debe pasar por `contentDisposition()`.

/** Quita tildes y todo lo no ASCII; deja letras, números, `-`, `_` y `.`. */
export function nombreArchivoAscii(texto: string, respaldo = 'archivo'): string {
  const limpio = texto
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return limpio || respaldo
}

/** Nombre base legible + extensión, con el tope de largo que aguantan los SO. */
export function nombreArchivo(base: string, extension: string, opciones: { max?: number; respaldo?: string } = {}): string {
  const { max = 80, respaldo = 'archivo' } = opciones
  const ext = extension.replace(/^\./, '')
  const cuerpo = nombreArchivoAscii(base, respaldo).slice(0, max).replace(/[-.]+$/, '') || respaldo
  return `${cuerpo}.${ext}`
}

/**
 * `respaldo` es el nombre COMPLETO (con extensión) si el original no deja nada usable.
 * Valor seguro para `Content-Disposition`: `filename` en ASCII (fallback) y
 * `filename*` UTF-8 con el nombre original, para que el navegador lo muestre bien.
 */
export function contentDisposition(
  tipo: 'inline' | 'attachment',
  nombreOriginal: string,
  respaldo = 'archivo',
): string {
  const punto = nombreOriginal.lastIndexOf('.')
  const tieneExt = punto > 0 && punto >= nombreOriginal.length - 6
  const base = tieneExt ? nombreOriginal.slice(0, punto) : nombreOriginal
  const ext = tieneExt ? nombreOriginal.slice(punto + 1) : ''
  const cuerpo = nombreArchivoAscii(base, '').slice(0, 80).replace(/[-.]+$/, '')
  const ascii = cuerpo ? (ext ? `${cuerpo}.${nombreArchivoAscii(ext, 'bin')}` : cuerpo) : respaldo
  const utf8 = nombreOriginal.replace(/[\r\n"\\/:*?<>|]/g, '').trim() || ascii
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`
}

/** Extensión segura para una key de Storage (`foto.JPG` → `jpg`); sin extensión válida, `defecto`. */
export function extensionSegura(nombre: string, defecto = 'bin'): string {
  const i = nombre.lastIndexOf('.')
  const ext = i >= 0 ? nombre.slice(i + 1).toLowerCase() : ''
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : defecto
}
