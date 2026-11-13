import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import { config } from './config.ts'

fs.mkdirSync(config.dataDir, { recursive: true })
export const db = new DatabaseSync(path.join(config.dataDir, 'bird.db'))

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  pw_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'partner',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS signups (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  id_enc TEXT NOT NULL,
  id_hash TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  email TEXT,
  otp_hash TEXT,
  otp_expires INTEGER,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  otp_sent_at INTEGER,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS resets (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  id_enc TEXT NOT NULL,
  id_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  ref TEXT,
  profile TEXT NOT NULL DEFAULT '{}',
  lines TEXT NOT NULL DEFAULT '[]',
  active_line_id TEXT,
  consent_at TEXT,
  submitted_at TEXT,
  review_note TEXT,
  sheet_synced_at TEXT,
  sheet_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_app ON messages(application_id, id);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  doc_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
`)

type Param = string | number | null | bigint | Uint8Array
export const get = <T,>(sql: string, ...p: Param[]) => db.prepare(sql).get(...p) as T | undefined
export const all = <T,>(sql: string, ...p: Param[]) => db.prepare(sql).all(...p) as T[]
export const run = (sql: string, ...p: Param[]) => db.prepare(sql).run(...p)

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function nextCounter(name: string): number {
  run('INSERT INTO counters(name, value) VALUES(?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1', name)
  return get<{ value: number }>('SELECT value FROM counters WHERE name = ?', name)!.value
}
