/** Thai national ID / juristic registration number: 13 digits with a mod-11 check digit. */
export function validThaiId13(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 13) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(d[i], 10) * (13 - i)
  return (11 - (sum % 11)) % 10 === parseInt(d[12], 10)
}

export const maskId = (raw: string) => {
  const d = raw.replace(/\D/g, '')
  return d.length === 13 ? `${d[0]}-xxxx-xxxxx-${d.slice(10, 12)}-${d[12]}` : '—'
}

export const formatId = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  const parts = [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12, 13)].filter(Boolean)
  return parts.join('-')
}

export const validThaiPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '')
  return /^0[689]\d{8}$/.test(d) || /^0[2-7]\d{7,8}$/.test(d)
}

export const ageFromBirth = (iso: string) => {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return -1
  return (Date.now() - t.getTime()) / (365.25 * 24 * 3600_000)
}

/**
 * Juristic-person registration number: 13 digits. The check-digit rule of the national ID is NOT enforced here
 * (it is not guaranteed to hold for every registered company); officers verify the number against the company certificate.
 */
export function validJuristic13(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  return d.length === 13 && !/^(\d)\1{12}$/.test(d)
}
