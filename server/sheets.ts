import fs from 'node:fs'
import { JWT } from 'google-auth-library'
import type { ApplicantType, AppStatus } from '../shared/types.ts'
import { CATEGORY_EN } from '../shared/schema.ts'
import { pricingSummary } from '../shared/pricing.ts'
import { fmtSheetTime } from '../shared/util.ts'
import { config } from './config.ts'
import { decrypt } from './crypto.ts'
import { getApp, setSheetState, type AppRow } from './repo.ts'

/** Exactly two worksheets with exactly these columns. */
export const SHEET_COLUMNS = {
  Individual: ['Partner ID', 'Full Name', 'Phone', 'Email', 'Service Type', 'Vehicle Summary', 'Service Area', 'Pricing Mode', 'Proposed Rate Summary', 'KYC Status', 'Application Status', 'Submitted At', 'Updated At'],
  Business: ['Partner ID', 'Company Name', 'Registration Number', 'Country', 'Contact Person', 'Phone', 'Email', 'Service Type', 'Service Coverage', 'Pricing Mode', 'Rate Summary', 'KYB Status', 'Application Status', 'Submitted At', 'Updated At'],
} as const
type SheetName = keyof typeof SHEET_COLUMNS

const STATUS_EN: Record<AppStatus, string> = { draft: 'Draft', submitted: 'Submitted', needs_info: 'Needs Info', approved: 'Approved', rejected: 'Rejected' }
const VERIFY_EN: Record<AppStatus, string> = { draft: 'Not Started', submitted: 'Pending Review', needs_info: 'Needs Info', approved: 'Verified', rejected: 'Rejected' }
const uniq = (a: (string | undefined)[]) => Array.from(new Set(a.filter((x): x is string => !!x)))

/** Summary data only: never ID numbers of individuals, documents, bank accounts or the audit trail. */
export function toRow(a: AppRow): { sheet: SheetName; values: string[] } {
  const services = uniq(a.lines.map((l) => (l.category ? CATEGORY_EN[l.category] + (l.scope === 'international' ? ' (Intl)' : '') : undefined))).join(', ')
  const area = uniq(a.lines.map((l) => l.coverage)).join(' | ')
  const equip = uniq(a.lines.map((l) => l.equipment)).join(' | ')
  const rates = a.lines.map((l) => pricingSummary(l.pricing, 'en')).join(' | ')
  const mode = a.lines.length ? 'Partner Proposed (structured)' : ''
  const p = a.profile
  if (a.type === 'business') {
    // the juristic registration number is public registry data (unlike a person's national ID), and is part of the required sheet layout
    const row: Record<(typeof SHEET_COLUMNS.Business)[number], string> = {
      'Partner ID': a.id, 'Company Name': p.companyNameEn || p.companyNameTh || '', 'Registration Number': decrypt(a.idEnc), Country: 'Thailand',
      'Contact Person': p.contactName ?? '', Phone: p.contactPhone ?? '', Email: a.email, 'Service Type': services, 'Service Coverage': area, 'Pricing Mode': mode,
      'Rate Summary': rates, 'KYB Status': VERIFY_EN[a.status], 'Application Status': STATUS_EN[a.status], 'Submitted At': fmtSheetTime(a.submittedAt), 'Updated At': fmtSheetTime(a.updatedAt),
    }
    return { sheet: 'Business', values: SHEET_COLUMNS.Business.map((c) => row[c]) }
  }
  const row: Record<(typeof SHEET_COLUMNS.Individual)[number], string> = {
    'Partner ID': a.id, 'Full Name': p.fullName ?? '', Phone: p.phone ?? '', Email: a.email, 'Service Type': services, 'Vehicle Summary': equip, 'Service Area': area,
    'Pricing Mode': mode, 'Proposed Rate Summary': rates, 'KYC Status': VERIFY_EN[a.status], 'Application Status': STATUS_EN[a.status],
    'Submitted At': fmtSheetTime(a.submittedAt), 'Updated At': fmtSheetTime(a.updatedAt),
  }
  return { sheet: 'Individual', values: SHEET_COLUMNS.Individual.map((c) => row[c]) }
}

// ------------------------------------------------------------------ Google Sheets REST (service account)
function loadCredentials(): { client_email: string; private_key: string } | null {
  try {
    const raw = config.sheets.credentialsJson || (config.sheets.credentialsFile ? fs.readFileSync(config.sheets.credentialsFile, 'utf8') : '')
    if (!raw) return null
    const j = JSON.parse(raw) as { client_email?: string; private_key?: string }
    return j.client_email && j.private_key ? { client_email: j.client_email, private_key: j.private_key } : null
  } catch (e) {
    console.error('[sheets] could not read service account credentials:', e instanceof Error ? e.message : e)
    return null
  }
}

const creds = config.sheets.spreadsheetId ? loadCredentials() : null
export const sheetsConfigured = !!creds
const auth = creds ? new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] }) : null
const base = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheets.spreadsheetId}`

async function api<T>(method: 'GET' | 'POST' | 'PUT', url: string, data?: unknown): Promise<T> {
  const r = await auth!.request<T>({ url: base + url, method, data })
  return r.data
}

let ready: Promise<void> | null = null
function ensureSheets(): Promise<void> {
  return (ready ??= (async () => {
    const meta = await api<{ sheets: { properties: { title: string; sheetId: number } }[] }>('GET', '?fields=sheets.properties')
    const have = new Set(meta.sheets.map((s) => s.properties.title))
    const requests = (Object.keys(SHEET_COLUMNS) as SheetName[]).filter((n) => !have.has(n)).map((n) => ({ addSheet: { properties: { title: n } } }))
    if (requests.length) await api('POST', ':batchUpdate', { requests })
    for (const n of Object.keys(SHEET_COLUMNS) as SheetName[]) {
      const cols = SHEET_COLUMNS[n]
      const end = String.fromCharCode(64 + cols.length)
      await api('PUT', `/values/${encodeURIComponent(`${n}!A1:${end}1`)}?valueInputOption=RAW`, { values: [cols] })
    }
  })().catch((e) => {
    ready = null
    throw e
  }))
}

let queue: Promise<unknown> = Promise.resolve()
const enqueue = <T,>(fn: () => Promise<T>) => {
  const p = queue.then(fn, fn)
  queue = p.catch(() => undefined)
  return p
}

async function upsertNow(a: AppRow) {
  await ensureSheets()
  const { sheet, values } = toRow(a)
  const col = await api<{ values?: string[][] }>('GET', `/values/${encodeURIComponent(`${sheet}!A:A`)}`)
  const idx = (col.values ?? []).findIndex((r) => r[0] === a.id)
  const end = String.fromCharCode(64 + values.length)
  if (idx >= 0) await api('PUT', `/values/${encodeURIComponent(`${sheet}!A${idx + 1}:${end}${idx + 1}`)}?valueInputOption=RAW`, { values: [values] })
  else await api('POST', `/values/${encodeURIComponent(`${sheet}!A:${end}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values: [values] })
}

const timers = new Map<string, NodeJS.Timeout>()

/** Debounced write of one application to the sheet (one row per Partner ID, updated in place). Never throws into request handlers. */
export function syncApplication(appId: string): Promise<void> {
  if (!sheetsConfigured) return Promise.resolve()
  clearTimeout(timers.get(appId))
  return new Promise((resolve) => {
    timers.set(
      appId,
      setTimeout(() => {
        timers.delete(appId)
        void enqueue(async () => {
          const a = getApp(appId)
          if (!a) return
          try {
            await upsertNow(a)
            setSheetState(appId, new Date().toISOString(), null)
          } catch (e) {
            const m = (e instanceof Error ? e.message : String(e)).slice(0, 300)
            setSheetState(appId, null, m)
            console.error('[sheets] sync failed for', appId, m)
          }
        }).finally(resolve)
      }, 2500),
    )
  })
}

/** Immediate (non-debounced) sync used after an officer's decision. */
export async function syncNow(appId: string): Promise<void> {
  if (!sheetsConfigured) return
  clearTimeout(timers.get(appId))
  await enqueue(async () => {
    const a = getApp(appId)
    if (!a) return
    try {
      await upsertNow(a)
      setSheetState(appId, new Date().toISOString(), null)
    } catch (e) {
      setSheetState(appId, null, (e instanceof Error ? e.message : String(e)).slice(0, 300))
    }
  })
}

export type { ApplicantType }
