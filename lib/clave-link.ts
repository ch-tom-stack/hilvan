// Link para que un usuario defina su propia contraseña (nov-2026).
//
// Reemplaza a "te paso una contraseña temporal por WhatsApp": el admin genera
// un link /clave/<userId>.<secreto> y se lo manda. Sin tabla nueva: el HASH del
// secreto y su vencimiento viven en `app_metadata.clave_link` del usuario en
// Supabase Auth (solo el service role lo escribe). Generar uno nuevo invalida el
// anterior; usarlo lo borra (un solo uso).
//
// ABRIR EL LINK NO CAMBIA NADA — WhatsApp y los clientes de correo abren los
// links para armar la vista previa. Solo el botón "Guardar" lo consume.
//
// Lógica pura aquí (testeada en tests/clave-link.test.ts); la base, en
// app/actions/clave-link.ts.

import { createHash, randomBytes, timingSafeEqual } from 'crypto'

/** Cuánto dura un link desde que se genera. */
export const HORAS_VIGENCIA_CLAVE = 72

export const LARGO_MINIMO_CLAVE = 8

/** Lo que se guarda en app_metadata.clave_link. Nunca el secreto en claro. */
export interface ClaveLinkGuardado {
  hash: string
  expira: string   // ISO
  creado: string   // ISO
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SECRETO_RE = /^[A-Za-z0-9_-]{43}$/   // 32 bytes en base64url

export function hashSecreto(secreto: string): string {
  return createHash('sha256').update(secreto).digest('hex')
}

/** Genera el secreto (va en el link) y lo que se guarda (su hash + vencimiento). */
export function nuevoClaveLink(ahora: Date = new Date()): { secreto: string; guardado: ClaveLinkGuardado } {
  const secreto = randomBytes(32).toString('base64url')
  const expira = new Date(ahora.getTime() + HORAS_VIGENCIA_CLAVE * 3600_000)
  return {
    secreto,
    guardado: { hash: hashSecreto(secreto), expira: expira.toISOString(), creado: ahora.toISOString() },
  }
}

export function armarTokenClave(userId: string, secreto: string): string {
  return `${userId}.${secreto}`
}

/** `<uuid>.<secreto>` → partes, o null si no tiene la forma esperada. */
export function leerTokenClave(token: string): { userId: string; secreto: string } | null {
  const raw = decodeURIComponent(token ?? '')
  const i = raw.indexOf('.')
  if (i < 0) return null
  const userId = raw.slice(0, i)
  const secreto = raw.slice(i + 1)
  if (!UUID_RE.test(userId) || !SECRETO_RE.test(secreto)) return null
  return { userId, secreto }
}

export type EstadoClaveLink = 'valido' | 'invalido' | 'vencido'

/** Compara el secreto del link con lo guardado en el usuario. */
export function evaluarClaveLink(
  guardado: unknown,
  secreto: string,
  ahora: Date = new Date(),
): EstadoClaveLink {
  if (!guardado || typeof guardado !== 'object') return 'invalido'
  const g = guardado as Partial<ClaveLinkGuardado>
  if (typeof g.hash !== 'string' || typeof g.expira !== 'string') return 'invalido'

  const a = Buffer.from(hashSecreto(secreto), 'hex')
  const b = Buffer.from(g.hash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'invalido'

  const expira = Date.parse(g.expira)
  if (!Number.isFinite(expira) || expira <= ahora.getTime()) return 'vencido'
  return 'valido'
}

export function validarNuevaClave(clave: string, repetida: string): string | null {
  if (clave.length < LARGO_MINIMO_CLAVE) return `La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres`
  if (clave.length > 72) return 'La contraseña no puede tener más de 72 caracteres'
  if (clave !== repetida) return 'Las contraseñas no coinciden'
  return null
}
