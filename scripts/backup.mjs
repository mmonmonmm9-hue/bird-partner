// Backup: a consistent copy of the SQLite database plus the uploaded documents.
//   node scripts/backup.mjs [target-dir]      (default: <DATA_DIR>/backups)
// Safe to run while the site is live (VACUUM INTO takes a consistent snapshot). Keeps the newest 14 backups.
// Copy the resulting folder somewhere else too (e.g. a Cloud Storage bucket); a backup on the same disk is not a real backup.
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.env.DATA_DIR ?? 'data')
const target = path.resolve(process.argv[2] ?? path.join(dataDir, 'backups'))
const dbFile = path.join(dataDir, 'bird.db')
if (!fs.existsSync(dbFile)) {
  console.error(`No database at ${dbFile}`)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const out = path.join(target, `bird-${stamp}`)
fs.mkdirSync(out, { recursive: true })

const db = new DatabaseSync(dbFile, { readOnly: true })
db.exec(`VACUUM INTO '${path.join(out, 'bird.db').replace(/'/g, "''")}'`)
db.close()

const uploads = path.join(dataDir, 'uploads')
if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(out, 'uploads'), { recursive: true })

// NOTE: the encryption key (DATA_KEY / data/dev-data.key) is deliberately NOT copied here: store it separately and safely.
const old = fs.readdirSync(target).filter((n) => n.startsWith('bird-')).sort()
for (const n of old.slice(0, Math.max(0, old.length - 14))) fs.rmSync(path.join(target, n), { recursive: true, force: true })
console.log(`Backup written to ${out}`)
