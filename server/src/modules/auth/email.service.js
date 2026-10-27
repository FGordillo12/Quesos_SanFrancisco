import nodemailer from 'nodemailer'
import { env } from '../../config/env.js'

let transporter

function getTransporter() {
  if (!env.smtp) {
    const error = new Error('El servicio de correo no está configurado.')
    error.code = 'EMAIL_NOT_CONFIGURED'
    error.status = 503
    throw error
  }
  transporter ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  })
  return transporter
}

async function sendAuthEmail({ to, subject, text, html }) {
  await getTransporter().sendMail({ from: env.smtp.from, to, subject, text, html })
}

export function sendVerificationEmail(email, token) {
  const link = `${env.clientUrl}/verify-email?token=${encodeURIComponent(token)}`
  return sendAuthEmail({
    to: email,
    subject: 'Verifica tu correo · Quesos San Francisco',
    text: `Confirma tu correo siguiendo este enlace (válido por 24 horas): ${link}`,
    html: `<p>Confirma tu correo de Quesos San Francisco.</p><p><a href="${link}">Verificar correo</a></p><p>El enlace vence en 24 horas.</p>`,
  })
}

export function sendPasswordResetEmail(email, token) {
  const link = `${env.clientUrl}/reset-password?token=${encodeURIComponent(token)}`
  return sendAuthEmail({
    to: email,
    subject: 'Restablecer contraseña · Quesos San Francisco',
    text: `Solicitaste cambiar tu contraseña. Usa este enlace (válido por 15 minutos): ${link}`,
    html: `<p>Solicitaste cambiar tu contraseña.</p><p><a href="${link}">Restablecer contraseña</a></p><p>El enlace vence en 15 minutos.</p>`,
  })
}
