import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'

interface SendEmailOptions {
  from?: string
  to: string | string[]
  subject: string
  html: string
  /** Texto libre para identificar el contexto del envío en email_log */
  contexto?: string
}

async function logEmail(
  destinatario: string,
  asunto: string,
  contexto: string | undefined,
  estado: 'enviado' | 'fallido',
  error?: string,
) {
  try {
    const admin = createAdminClient()
    await admin.from('email_log').insert({
      destinatario,
      asunto,
      contexto: contexto ?? null,
      estado,
      error: error ?? null,
    })
  } catch (logErr) {
    console.error('[email_log] No se pudo registrar en email_log:', logErr)
  }
}

export async function sendEmail({ from, to, subject, html, contexto }: SendEmailOptions) {
  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD
  if (!gmailUser || !gmailPass) {
    throw new Error('GMAIL_USER/GMAIL_APP_PASSWORD no configurados')
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  })

  const destinatarioStr = Array.isArray(to) ? to.join(', ') : to

  try {
    const result = await transporter.sendMail({
      from: from ?? 'Hilván <noreply@casahiedra.com>',
      to: destinatarioStr,
      subject,
      html,
    })
    await logEmail(destinatarioStr, subject, contexto, 'enviado')
    return result
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    await logEmail(destinatarioStr, subject, contexto, 'fallido', msg)
    throw err
  }
}
