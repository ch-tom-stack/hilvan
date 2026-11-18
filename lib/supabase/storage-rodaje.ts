import { prepararImagen } from '@/lib/imagen-cliente'

// Subida de imágenes del plan: pasa por /api/rodaje/imagen (ver ahí por qué no
// se sube directo a Storage). Lanza con un mensaje legible si algo falla, para
// que la pantalla lo muestre en vez de quedarse callada.

export async function subirImagenBloque(file: File, rodajeId: string, bloqueId: string): Promise<string> {
  const lista = await prepararImagen(file)
  const fd = new FormData()
  fd.append('file', lista)
  fd.append('rodajeId', rodajeId)
  fd.append('clave', bloqueId)
  const res = await fetch('/api/rodaje/imagen', { method: 'POST', body: fd })
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: '' }))
    throw new Error(error || 'No se pudo subir la imagen')
  }
  const { url } = await res.json()
  if (!url) throw new Error('No se pudo subir la imagen')
  return url as string
}

export async function eliminarImagenBloque(url: string): Promise<boolean> {
  const res = await fetch(`/api/rodaje/imagen?url=${encodeURIComponent(url)}`, { method: 'DELETE' })
  return res.ok
}
