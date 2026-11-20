// La parte con base de datos del link de contraseña. Lógica pura y explicación
// en lib/clave-link.ts. Todo con service role: quien llama ya validó la sesión
// (admin) o va a validar el secreto del link.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { escaparHtml } from '@/lib/crm-aviso-lead'
import {
  armarTokenClave,
  evaluarClaveLink,
  leerTokenClave,
  nuevoClaveLink,
  type EstadoClaveLink,
} from '@/lib/clave-link'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com'

type Admin = ReturnType<typeof createAdminClient>

export interface LinkClaveGenerado {
  url: string
  expira: string
}

/** Crea (o reemplaza) el link del usuario. El anterior deja de servir. */
export async function crearLinkClave(admin: Admin, userId: string): Promise<LinkClaveGenerado> {
  const { secreto, guardado } = nuevoClaveLink()
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { clave_link: guardado },
  })
  if (error) throw new Error(error.message)
  return {
    url: `${APP_URL}/clave/${armarTokenClave(userId, secreto)}`,
    expira: guardado.expira,
  }
}

export interface ClaveLinkLeido {
  estado: EstadoClaveLink
  userId?: string
  email?: string
  nombre?: string
}

/** Solo lee: abrir el link no lo consume. */
export async function leerClaveLink(token: string): Promise<ClaveLinkLeido> {
  const partes = leerTokenClave(token)
  if (!partes) return { estado: 'invalido' }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(partes.userId)
  if (error || !data.user) return { estado: 'invalido' }

  const estado = evaluarClaveLink(data.user.app_metadata?.clave_link, partes.secreto)
  if (estado !== 'valido') return { estado }

  const { data: perfil } = await admin
    .from('profiles')
    .select('nombre')
    .eq('id', partes.userId)
    .maybeSingle<{ nombre: string | null }>()

  return {
    estado,
    userId: partes.userId,
    email: data.user.email || undefined,
    nombre: perfil?.nombre || (data.user.user_metadata?.nombre as string | undefined) || undefined,
  }
}

/** Fija la contraseña y borra el link (un solo uso). */
export async function consumirClaveLink(userId: string, clave: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: clave,
    app_metadata: { clave_link: null },
  })
  if (error) throw new Error(error.message)
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })
}

/** Manda el link por correo. Lanza si falla (quien llama decide qué hacer). */
export async function enviarLinkClavePorCorreo(
  para: { email: string; nombre?: string },
  link: LinkClaveGenerado,
  bienvenida: boolean,
): Promise<void> {
  const e = escaparHtml
  const saludo = para.nombre ? `Hola ${e(para.nombre.split(' ')[0])},` : 'Hola,'
  const intro = bienvenida
    ? 'Te creamos una cuenta en Hilván, la plataforma interna de Casa Hiedra. Para entrar, define tu contraseña:'
    : 'Para definir una nueva contraseña en Hilván, usa este link:'

  await sendEmail({
    to: para.email,
    subject: bienvenida ? 'Tu cuenta en Hilván' : 'Define tu contraseña de Hilván',
    contexto: bienvenida ? 'clave-link:bienvenida' : 'clave-link',
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#111110;line-height:1.5;max-width:520px">
        <p>${saludo}</p>
        <p>${intro}</p>
        <p style="margin:24px 0">
          <a href="${e(link.url)}" style="background:#7a9e7e;color:#111110;padding:10px 18px;text-decoration:none;font-weight:600">Definir contraseña</a>
        </p>
        <p style="font-size:13px;color:#555">Tu usuario es <strong>${e(para.email)}</strong>. El link sirve una sola vez y vence el ${e(fechaHora(link.expira))}.</p>
        <p style="font-size:13px;color:#555">Si no esperabas este correo, ignóralo.</p>
        <p style="font-size:12px;color:#999;margin-top:32px">Hilván · Casa Hiedra</p>
      </div>`,
  })
}
