import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,       // natalia@casahiedra.com
    pass: process.env.GMAIL_APP_PASSWORD, // App Password de 16 caracteres
  },
})

interface SendEmailOptions {
  from?: string
  to: string | string[]
  subject: string
  html: string
}

export async function sendEmail({ from, to, subject, html }: SendEmailOptions) {
  return transporter.sendMail({
    from: from ?? 'Hilván <noreply@casahiedra.com>',
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
  })
}
