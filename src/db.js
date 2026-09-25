'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'prov.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  txid TEXT NOT NULL UNIQUE,
  payer TEXT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS payments_status ON payments(status, created_at);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  ord INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  image TEXT,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS questions_ord ON questions(ord);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS exams_user ON exams(user_id);
CREATE INDEX IF NOT EXISTS exams_time ON exams(created_at);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS reviews_status ON reviews(status, updated_at);

-- Daily limits: which questions a learner opened each day, and each exam they started.
CREATE TABLE IF NOT EXISTS usage_seen (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  qid INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, qid)
);
CREATE TABLE IF NOT EXISTS exam_starts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS exam_starts_day ON exam_starts(user_id, day);

CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY,
  admin TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Columns added after the first release (existing databases get them on start).
function addColumn(table, name, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}
addColumn('users', 'trial_done', 'INTEGER NOT NULL DEFAULT 0');   // 1 = free trial used up (trial exam finished)

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- settings ----------
const SETTINGS = {
  app_name:     { def: 'Provisoire Yanjye', type: 'text', max: 40 },
  price:        { def: 2000, type: 'int', min: 0, max: 1000000 },
  currency:     { def: 'RWF', type: 'text', max: 8 },
  momo_number:  { def: '0784243475', type: 'text', max: 20 },
  momo_name:    { def: 'Tresor', type: 'text', max: 60 },
  momo_pay_code: { def: '675148', type: 'text', max: 20 },
  // {code} = MoMo Pay code, {number} = MoMo number, {amount} = price
  momo_ussd:    { def: '*182*8*1*{code}#', type: 'text', max: 60 },
  // tel: makes phone cameras offer "Call", which opens the dialer with the code ready (# must be %23).
  momo_qr:      { def: 'tel:*182*8*1*{code}%23', type: 'text', max: 150 },
  whatsapp:     { def: '0722438684', type: 'text', max: 20 },
  free_count:   { def: 16, type: 'int', min: 0, max: 100000 },
  // Per learner per day (Rwanda time); 0 = no limit.
  daily_questions: { def: 0, type: 'int', min: 0, max: 100000 },
  daily_exams:  { def: 0, type: 'int', min: 0, max: 1000 },
  exam_count:   { def: 20, type: 'int', min: 1, max: 500 },
  exam_minutes: { def: 20, type: 'int', min: 1, max: 300 },
  pass_mark:    { def: 12, type: 'int', min: 1, max: 500 }
};

function getSettings() {
  const out = {};
  for (const k of Object.keys(SETTINGS)) out[k] = SETTINGS[k].def;
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    if (SETTINGS[row.key]) out[row.key] = SETTINGS[row.key].type === 'int' ? Number(row.value) : row.value;
  }
  return out;
}

// Returns an error message, or null after saving.
function updateSettings(patch) {
  const clean = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const s = SETTINGS[k];
    if (!s) continue;
    if (s.type === 'int') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < s.min || n > s.max) return `${k} must be a whole number from ${s.min} to ${s.max}.`;
      clean[k] = String(n);
    } else {
      const t = String(v == null ? '' : v).trim();
      if (t.length > s.max) return `${k} is too long (max ${s.max}).`;
      clean[k] = t;
    }
  }
  const next = Object.assign(getSettings(), clean);
  if (Number(next.pass_mark) > Number(next.exam_count)) return 'Pass mark cannot be higher than the number of exam questions.';
  const put = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  tx(() => { for (const [k, v] of Object.entries(clean)) put.run(k, v); });
  return null;
}

// ---------- questions ----------
function rowToQuestion(r) {
  const d = JSON.parse(r.data);
  return {
    id: r.id,
    category: r.category,
    image: r.image || null,
    text: d.text,
    options: d.options,
    answer: d.answer,
    explanation: d.explanation || {}
  };
}

function listQuestions(limit) {
  const sql = 'SELECT * FROM questions ORDER BY ord, id' + (limit != null ? ' LIMIT ?' : '');
  const stmt = db.prepare(sql);
  return (limit != null ? stmt.all(limit) : stmt.all()).map(rowToQuestion);
}

function questionCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
}

function saveQuestionData(q) {
  return JSON.stringify({ text: q.text, options: q.options, answer: q.answer, explanation: q.explanation || {} });
}

function logAdmin(admin, action, detail) {
  db.prepare('INSERT INTO admin_log(admin, action, detail) VALUES(?, ?, ?)').run(admin, action, detail == null ? null : String(detail).slice(0, 500));
}

module.exports = {
  db, tx, DATA_DIR,
  getSettings, updateSettings, SETTINGS,
  listQuestions, questionCount, rowToQuestion, saveQuestionData,
  logAdmin
};
