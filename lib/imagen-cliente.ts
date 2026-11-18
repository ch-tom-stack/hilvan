// Prepara una imagen en el navegador antes de subirla al plan de rodaje.
// El PDF solo lee PNG y JPEG, pero los selectores aceptan `image/*` (WEBP, GIF,
// HEIC convertido por el sistema, SVG…). Se redibuja en un canvas: JPEG sigue
// siendo JPEG, todo lo demás pasa a PNG, y se achica a `maxLado` para que un
// archivo de cámara no tarde minutos ni pese 15 MB.

export async function prepararImagen(file: File, maxLado = 2000): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen')

  const bitmap = await cargar(file)
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * escala))
  const h = Math.max(1, Math.round(bitmap.height * escala))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Tu navegador no pudo procesar la imagen')

  const esJpeg = file.type === 'image/jpeg'
  if (esJpeg) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h) }
  ctx.drawImage(bitmap, 0, 0, w, h)

  const tipo = esJpeg ? 'image/jpeg' : 'image/png'
  const blob: Blob | null = await new Promise(res => canvas.toBlob(res, tipo, 0.9))
  if (!blob) throw new Error('No se pudo convertir la imagen')
  return new File([blob], `imagen.${esJpeg ? 'jpg' : 'png'}`, { type: tipo })
}

async function cargar(file: File): Promise<{ width: number; height: number } & CanvasImageSource> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch { /* cae al <img> (p. ej. SVG) */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img as unknown as { width: number; height: number } & CanvasImageSource
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con PNG o JPG')
  } finally {
    URL.revokeObjectURL(url)
  }
}
