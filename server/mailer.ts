import nodemailer from 'nodemailer'
import { config } from './config.ts'

const transport = config.smtp.host
  ? nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465, auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined })
  : null

export const mailConfigured = !!transport

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Sends one e-mail. Without SMTP nothing leaves the server: the subject is only logged (codes are logged by the caller that needs them). */
async function send(to: string, subject: string, text: string, html: string): Promise<{ sent: boolean }> {
  if (!transport) return { sent: false }
  await transport.sendMail({ from: config.smtp.from, to, subject, text, html })
  return { sent: true }
}

export async function sendOtp(to: string, code: string): Promise<{ sent: boolean }> {
  if (!transport) {
    // No SMTP server: the code is only ever printed to the server log (and returned to the browser in dev mode, see config.devOtp).
    console.warn(`[mail] SMTP not configured — verification code for ${to}: ${code}`)
    return { sent: false }
  }
  return send(
    to,
    'รหัสยืนยันอีเมล Bird Partner',
    `รหัสยืนยันของคุณคือ ${code}\nใช้ได้ภายใน 10 นาที ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร`,
    `<p>รหัสยืนยันของคุณคือ <b style="font-size:20px;letter-spacing:3px">${code}</b></p><p>ใช้ได้ภายใน 10 นาที ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร</p>`,
  )
}

export async function sendResetCode(to: string, code: string): Promise<{ sent: boolean }> {
  if (!transport) {
    console.warn(`[mail] SMTP not configured — password reset code for ${to}: ${code}`)
    return { sent: false }
  }
  return send(
    to,
    'รีเซ็ตรหัสผ่าน Bird Partner',
    `รหัสสำหรับตั้งรหัสผ่านใหม่คือ ${code}\nใช้ได้ภายใน 10 นาที ถ้าคุณไม่ได้ขอ ให้เพิกเฉยอีเมลนี้ รหัสผ่านเดิมยังใช้ได้ตามปกติ`,
    `<p>รหัสสำหรับตั้งรหัสผ่านใหม่คือ <b style="font-size:20px;letter-spacing:3px">${code}</b></p><p>ใช้ได้ภายใน 10 นาที ถ้าคุณไม่ได้ขอ ให้เพิกเฉยอีเมลนี้ รหัสผ่านเดิมยังใช้ได้ตามปกติ</p>`,
  )
}

/** Tells the partner the outcome of an officer's decision. Failures are logged, never thrown (the decision itself is already saved). */
export async function sendDecision(to: string, decision: 'approved' | 'needs_info' | 'rejected', ref: string | undefined, note?: string): Promise<void> {
  const title = decision === 'approved' ? 'ใบสมัครพาร์ทเนอร์ของคุณได้รับการอนุมัติแล้ว' : decision === 'needs_info' ? 'เจ้าหน้าที่ขอข้อมูลเพิ่มเติมสำหรับใบสมัครของคุณ' : 'ผลการพิจารณาใบสมัครพาร์ทเนอร์'
  const body =
    decision === 'approved'
      ? 'ยินดีต้อนรับสู่ Bird Partner ทีมงานจะติดต่อเรื่องขั้นตอนถัดไป'
      : decision === 'needs_info'
        ? `กรุณาเข้าสู่ระบบเพื่อแก้ไขข้อมูลหรือแนบเอกสารเพิ่ม แล้วกดส่งใบสมัครอีกครั้ง\n\nรายละเอียดจากเจ้าหน้าที่: ${note ?? '-'}`
        : `ขออภัย ใบสมัครของคุณไม่ผ่านการพิจารณา\n\nเหตุผล: ${note ?? '-'}`
  const text = `${title}\nเลขอ้างอิง: ${ref ?? '-'}\n\n${body}`
  if (!transport) {
    console.warn(`[mail] SMTP not configured — decision e-mail not sent to ${to} (${decision})`)
    return
  }
  try {
    await send(to, `[Bird Partner] ${title}`, text, `<p><b>${esc(title)}</b></p><p>เลขอ้างอิง: ${esc(ref ?? '-')}</p><p>${esc(body).replace(/\n/g, '<br>')}</p>`)
  } catch (e) {
    console.error('[mail] decision e-mail failed', e instanceof Error ? e.message : e)
  }
}
