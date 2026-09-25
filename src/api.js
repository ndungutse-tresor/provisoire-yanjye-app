'use strict';
const {
  db, tx, NOW, ago, TODAY, isUniqueError,
  getSettings, updateSettings, listQuestions, questionCount, rowToQuestion, saveQuestionData, logAdmin
} = require('./db');
const { hashSecret, verifySecret, burnTime, signToken, verifyToken, parseCookies, cookie, Limiter } = require('./auth');
const { HttpError, sendJson, readJson } = require('./http');
const { LANGS, validateQuestion } = require('./questions');
const { parseSource, fetchSource } = require('./importer');
const live = require('./live');
const { qrSvg } = require('./qr');

// A handler returns STREAM when it has written the response itself (live events, pictures).
const STREAM = Symbol('stream');

const USER_COOKIE = 'pa_s';
const ADMIN_COOKIE = 'pa_a';
const USER_DAYS = 180;
const ADMIN_HOURS = 12;
const IMPORT_LIMIT = 32 * 1024 * 1024;

// ---------- rate limits ----------
const loginByPhone = new Limiter(5, 15 * 60 * 1000);
const loginByIp = new Limiter(30, 15 * 60 * 1000);
const registerByIp = new Limiter(10, 60 * 60 * 1000);
const payByUser = new Limiter(5, 24 * 60 * 60 * 1000);
const examsByUser = new Limiter(100, 24 * 60 * 60 * 1000);
const reviewsByUser = new Limiter(10, 24 * 60 * 60 * 1000);
const adminByIp = new Limiter(5, 15 * 60 * 1000);

function tooMany(limiter, key) {
  const mins = Math.ceil(limiter.retryAfterSec(key) / 60);
  return new HttpError(429, 'too_many', `Too many attempts. Try again in ${mins} minute(s).`);
}

// ---------- helpers ----------
function normPhone(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('250')) d = d.slice(3);
  else if (d.length === 10 && d.startsWith('0')) d = d.slice(1);
  return /^7\d{8}$/.test(d) ? d : null;
}

function publicUser(u) {
  return { id: u.id, name: u.name, phone: '0' + u.phone, paid: !!u.paid, trialDone: !u.paid && !!u.trial_done };
}

function fillPayTemplate(tpl, s) {
  return String(tpl || '')
    .replace(/\{code\}/g, String(s.momo_pay_code).replace(/\s/g, ''))
    .replace(/\{number\}/g, String(s.momo_number).replace(/\s/g, ''))
    .replace(/\{amount\}/g, String(s.price));
}

async function publicConfig() {
  const s = await getSettings();
  const cats = await db.all("SELECT category, COUNT(*) AS n FROM questions WHERE category <> '' GROUP BY category ORDER BY MIN(ord)");
  return {
    appName: s.app_name,
    price: s.price,
    currency: s.currency,
    momoNumber: s.momo_number,
    momoName: s.momo_name,
    momoPayCode: s.momo_pay_code,
    momoUssd: fillPayTemplate(s.momo_ussd, s),
    momoQr: fillPayTemplate(s.momo_qr, s),
    whatsapp: s.whatsapp,
    freeCount: s.free_count,
    exam: { count: s.exam_count, minutes: s.exam_minutes, passMark: s.pass_mark },
    limits: { questions: s.daily_questions, exams: s.daily_exams },
    total: await questionCount(),
    categories: cats.map((c) => ({ name: c.category, count: c.n }))
  };
}

function id(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 53) throw new HttpError(404, 'not_found', 'Not found.');
  return n;
}

function limitOffset(url, max = 200) {
  const limit = Math.min(max, Math.max(1, Math.floor(Number(url.searchParams.get('limit'))) || 50));
  const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset'))) || 0);
  return { limit, offset };
}

// ---------- sessions ----------
async function currentUser(ctx) {
  if (ctx._user !== undefined) return ctx._user;
  const p = verifyToken(ctx.cookies[USER_COOKIE]);
  let u = null;
  if (p && p.role === 'user' && Number.isInteger(p.uid)) {
    u = (await db.get('SELECT * FROM users WHERE id = ?', p.uid)) || null;
    if (u && (u.blocked || u.token_version !== p.v)) u = null;
    if (u) {
      await db.run(`UPDATE users SET last_seen = ${NOW} WHERE id = ? AND (last_seen IS NULL OR last_seen < ${ago('10 minutes')})`, u.id);
    }
  }
  ctx._user = u;
  return u;
}

async function requireUser(ctx) {
  const u = await currentUser(ctx);
  if (!u) throw new HttpError(401, 'login_required', 'Please log in.');
  return u;
}

async function requireAdmin(ctx) {
  const p = verifyToken(ctx.cookies[ADMIN_COOKIE]);
  const a = p && p.role === 'admin' && Number.isInteger(p.aid) ? await db.get('SELECT * FROM admins WHERE id = ?', p.aid) : null;
  if (!a || a.token_version !== p.v) throw new HttpError(401, 'admin_login_required', 'Admin login required.');
  return a;
}

function setUserSession(ctx, u) {
  const token = signToken({ role: 'user', uid: u.id, v: u.token_version, exp: Date.now() + USER_DAYS * 864e5 });
  ctx.setCookies.push(cookie(USER_COOKIE, token, { maxAgeSec: USER_DAYS * 86400, secure: ctx.secure }));
}

// ---------- routing ----------
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
}

async function handle(req, res, url, { ip, secure }) {
  if (!url.pathname.startsWith('/api/')) return false;
  const ctx = { req, res, url, ip, secure, params: {}, cookies: parseCookies(req.headers.cookie), setCookies: [] };
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'forbidden', 'Forbidden.');
      if (origin && (() => { try { return new URL(origin).host !== host; } catch (e) { return true; } })()) {
        throw new HttpError(403, 'forbidden', 'Forbidden.');
      }
    }
    let match = null, allowed = false;
    for (const r of routes) {
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      allowed = true;
      if (r.method !== req.method) continue;
      match = r;
      r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
      break;
    }
    if (!match) throw allowed ? new HttpError(405, 'method', 'Method not allowed.') : new HttpError(404, 'not_found', 'Not found.');
    const out = await match.handler(ctx);
    if (out === STREAM) return true;
    sendJson(res, 200, out === undefined ? { ok: true } : out, ctx.setCookies.length ? { 'Set-Cookie': ctx.setCookies } : undefined);
  } catch (e) {
    if (e instanceof HttpError) {
      sendJson(res, e.status, { error: e.code, message: e.message }, ctx.setCookies.length ? { 'Set-Cookie': ctx.setCookies } : undefined);
    } else {
      console.error(e);
      sendJson(res, 500, { error: 'server', message: 'Something went wrong. Please try again.' });
    }
  }
  return true;
}

// ================= learner API =================
route('GET', '/api/config', () => publicConfig());

// QR code as an SVG picture, e.g. /api/qr.svg?d=*182*8*1*675148%23
route('GET', '/api/qr.svg', (ctx) => {
  const text = String(ctx.url.searchParams.get('d') || '');
  if (!text || text.length > 200) throw new HttpError(400, 'bad_qr', 'Give 1 to 200 characters.');
  const svg = qrSvg(text);
  ctx.res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
  ctx.res.end(svg);
  return STREAM;
});

route('POST', '/api/auth/register', async (ctx) => {
  const b = await readJson(ctx.req);
  if (registerByIp.blocked(ctx.ip)) throw tooMany(registerByIp, ctx.ip);
  const phone = normPhone(b.phone);
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const pin = String(b.pin || '');
  if (!phone) throw new HttpError(400, 'bad_phone', 'Enter a valid Rwandan phone number (07...).');
  if (name.length < 2 || name.length > 60) throw new HttpError(400, 'bad_name', 'Enter your name.');
  if (!/^\d{4,6}$/.test(pin)) throw new HttpError(400, 'bad_pin', 'The PIN must be 4 to 6 digits.');
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
    throw new HttpError(400, 'weak_pin', 'Choose a PIN that is harder to guess.');
  }
  registerByIp.hit(ctx.ip);
  const taken = () => new HttpError(409, 'phone_taken', 'This number already has an account. Log in, or contact support on WhatsApp.');
  if (await db.get('SELECT 1 FROM users WHERE phone = ?', phone)) throw taken();
  const hash = await hashSecret(pin);
  let u;
  try {
    u = (await db.run('INSERT INTO users(phone, name, pin_hash) VALUES(?, ?, ?) RETURNING *', phone, name, hash)).rows[0];
  } catch (e) {
    if (isUniqueError(e)) throw taken();   // two sign-ups with the same number at once
    throw e;
  }
  setUserSession(ctx, u);
  return { user: publicUser(u) };
});

route('POST', '/api/auth/login', async (ctx) => {
  const b = await readJson(ctx.req);
  const phone = normPhone(b.phone);
  const pin = String(b.pin || '');
  if (!phone || !pin) throw new HttpError(400, 'bad_login', 'Enter your phone number and PIN.');
  if (loginByIp.blocked(ctx.ip)) throw tooMany(loginByIp, ctx.ip);
  if (loginByPhone.blocked(phone)) throw tooMany(loginByPhone, phone);
  const u = await db.get('SELECT * FROM users WHERE phone = ?', phone);
  const ok = u ? await verifySecret(pin, u.pin_hash) : await burnTime(pin);
  if (!ok) {
    loginByIp.hit(ctx.ip);
    loginByPhone.hit(phone);
    throw new HttpError(401, 'bad_login', 'Wrong phone number or PIN.');
  }
  if (u.blocked) throw new HttpError(403, 'blocked', 'This account is blocked. Contact support.');
  loginByPhone.clear(phone);
  setUserSession(ctx, u);
  return { user: publicUser(u) };
});

route('POST', '/api/auth/logout', async (ctx) => {
  await readJson(ctx.req);
  ctx.setCookies.push(cookie(USER_COOKIE, '', { maxAgeSec: 0, secure: ctx.secure }));
});

route('GET', '/api/me', async (ctx) => {
  const u = await currentUser(ctx);
  if (!u) return { user: null, payment: null, review: null, examCount: 0 };
  const [p, r, count, lastExam, usage] = await Promise.all([
    db.get('SELECT id, txid, amount, status, note, created_at FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 1', u.id),
    db.get('SELECT rating, comment, updated_at FROM reviews WHERE user_id = ?', u.id),
    db.get('SELECT COUNT(*) AS n FROM exams WHERE user_id = ?', u.id),
    db.get('SELECT score, total, passed, created_at FROM exams WHERE user_id = ? ORDER BY id DESC LIMIT 1', u.id),
    usageToday(u.id)
  ]);
  return { user: publicUser(u), payment: p || null, review: r || null, examCount: count.n, lastExam: lastExam || null, usage };
});

// ---------- daily limits ----------
// Days follow Rwanda time (UTC+2).
function today() {
  return new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
}
async function usageToday(uid, t = db) {
  const day = today();
  const q = await t.get('SELECT COUNT(*) AS n FROM usage_seen WHERE user_id = ? AND day = ?', uid, day);
  const e = await t.get('SELECT COUNT(*) AS n FROM exam_starts WHERE user_id = ? AND day = ?', uid, day);
  return { day, questions: q.n, exams: e.n };
}

// The app reports which questions were opened (studied or practised). New ones beyond
// the daily limit are refused, so the count can't be pushed past it.
route('POST', '/api/usage', async (ctx) => {
  const b = await readJson(ctx.req);
  const u = await requireUser(ctx);
  const ids = Array.isArray(b.seen)
    ? [...new Set(b.seen.slice(0, 500).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 2 ** 53))]
    : [];
  const limit = (await getSettings()).daily_questions;
  const day = today();
  await tx(async (t) => {
    // One request per learner at a time, so parallel requests can't pass the limit together.
    await t.get('SELECT id FROM users WHERE id = ? FOR UPDATE', u.id);
    let used = (await t.get('SELECT COUNT(*) AS n FROM usage_seen WHERE user_id = ? AND day = ?', u.id, day)).n;
    for (const q of ids) {
      if (await t.get('SELECT 1 FROM usage_seen WHERE user_id = ? AND day = ? AND qid = ?', u.id, day, q)) continue;
      if (limit && used >= limit) break;
      used += (await t.run(`INSERT INTO usage_seen(user_id, day, qid) SELECT ?::bigint, ?::text, id FROM questions WHERE id = ?
        ON CONFLICT DO NOTHING`, u.id, day, q)).changes;
    }
  });
  return usageToday(u.id);
});

route('POST', '/api/exams/start', async (ctx) => {
  await readJson(ctx.req);
  const u = await requireUser(ctx);
  if (!u.paid && u.trial_done) throw new HttpError(403, 'trial_used', 'Your free trial is finished. Unlock to continue.');
  const limit = (await getSettings()).daily_exams;
  return tx(async (t) => {
    await t.get('SELECT id FROM users WHERE id = ? FOR UPDATE', u.id);
    const used = (await usageToday(u.id, t)).exams;
    if (u.paid && limit && used >= limit) {
      throw new HttpError(429, 'daily_exam_limit', `You can take ${limit} exam(s) a day. Come back tomorrow.`);
    }
    await t.run('INSERT INTO exam_starts(user_id, day) VALUES(?, ?)', u.id, today());
    return usageToday(u.id, t);
  });
});

// Live channel: tells the learner's open app when their account changes.
route('GET', '/api/events', async (ctx) => {
  const u = await requireUser(ctx);
  live.subscribeUser(u.id, ctx.res);
  return STREAM;
});

// ---------- exam results ----------
function passMarkFor(total, s) {
  return total < s.exam_count ? Math.ceil(s.pass_mark * total / s.exam_count) : s.pass_mark;
}

route('POST', '/api/exams', async (ctx) => {
  const b = await readJson(ctx.req);
  const u = await requireUser(ctx);
  const score = Number(b.score), total = Number(b.total);
  if (!Number.isInteger(total) || total < 1 || total > 500 || !Number.isInteger(score) || score < 0 || score > total) {
    throw new HttpError(400, 'bad_exam', 'Invalid exam result.');
  }
  // Unpaid learners get one trial exam; finishing it ends the free trial.
  if (!u.paid && u.trial_done) throw new HttpError(403, 'trial_used', 'Your free trial is finished. Unlock to continue.');
  if (examsByUser.blocked(u.id)) throw tooMany(examsByUser, u.id);
  examsByUser.hit(u.id);
  const passed = score >= passMarkFor(total, await getSettings());
  await tx(async (t) => {
    await t.run('INSERT INTO exams(user_id, score, total, passed) VALUES(?, ?, ?, ?)', u.id, score, total, passed ? 1 : 0);
    if (!u.paid) await t.run('UPDATE users SET trial_done = 1 WHERE id = ?', u.id);
  });
  live.toAdmins('exam', { passed });
  return { passed, trialDone: !u.paid };
});

// ---------- reviews ----------
function reviewerName(name) {
  const parts = String(name).trim().split(/\s+/);
  return parts[0] + (parts[1] ? ' ' + parts[1].charAt(0).toUpperCase() + '.' : '');
}

async function reviewSummary() {
  const [agg, dists, recent] = await Promise.all([
    db.get("SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE status = 'published'"),
    db.all("SELECT rating, COUNT(*) AS n FROM reviews WHERE status = 'published' GROUP BY rating"),
    db.all(`SELECT r.rating, r.comment, r.updated_at, u.name, u.paid FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.status = 'published' AND r.comment IS NOT NULL AND r.comment <> ''
      ORDER BY r.updated_at DESC LIMIT 12`)
  ]);
  const dist = [0, 0, 0, 0, 0];
  for (const r of dists) dist[r.rating - 1] = r.n;
  return {
    count: agg.n,
    average: agg.n ? Math.round(agg.avg * 10) / 10 : 0,
    distribution: dist,
    recent: recent.map((r) => ({ name: reviewerName(r.name), rating: r.rating, comment: r.comment, date: r.updated_at.slice(0, 10), verified: !!r.paid }))
  };
}

route('GET', '/api/reviews', () => reviewSummary());

route('POST', '/api/reviews', async (ctx) => {
  const b = await readJson(ctx.req);
  const u = await requireUser(ctx);
  if (!(await db.get('SELECT 1 FROM exams WHERE user_id = ? LIMIT 1', u.id))) {
    throw new HttpError(403, 'exam_first', 'Finish a mock exam before writing a review.');
  }
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'bad_rating', 'Choose 1 to 5 stars.');
  const comment = String(b.comment || '').trim().replace(/\s+/g, ' ');
  if (comment.length > 500) throw new HttpError(400, 'bad_comment', 'Keep the review under 500 characters.');
  if (reviewsByUser.blocked(u.id)) throw tooMany(reviewsByUser, u.id);
  reviewsByUser.hit(u.id);
  await db.run(`INSERT INTO reviews(user_id, rating, comment) VALUES(?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = ${NOW}`,
  u.id, rating, comment || null);
  live.toAdmins('review', { rating });
  return { rating, comment };
});

// The free trial set: mixed across topics (e.g. Ibyapa and Amategeko), preferring questions
// translated into every language. Questions without a topic are split into signs (with a
// picture) and rules (without). Returned interleaved, so the mix shows from the first question.
async function freeQuestionList(n) {
  const all = await listQuestions(null);
  if (all.length <= n) return all;
  const complete = (q) => LANGS.every((l) => q.text[l]);
  const groups = new Map();
  for (const q of all) {
    const k = q.category || (q.image ? '~signs' : '~rules');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(q);
  }
  const lists = [...groups.values()].map((g) => g.sort((a, b) => complete(b) - complete(a)));
  const picked = [];
  for (let i = 0; picked.length < n; i++) {
    let any = false;
    for (const g of lists) {
      if (i < g.length && picked.length < n) { picked.push(g[i]); any = true; }
    }
    if (!any) break;
  }
  return picked;
}

// No account: no questions. Unpaid account: the free trial. Paid: everything.
// Paid questions only ever leave the server for paid accounts.
route('GET', '/api/questions', async (ctx) => {
  const u = await currentUser(ctx);
  const s = await getSettings();
  const total = await questionCount();
  const freeCount = Math.min(s.free_count, total);
  if (!u) return { full: false, total, freeCount, needAccount: true, questions: [] };
  if (u.paid) return { full: true, total, freeCount, questions: await listQuestions(null) };
  // Trial used up: locked until payment (kept on the server, so a new phone or reinstall doesn't reset it).
  if (u.trial_done) return { full: false, total, freeCount, trialDone: true, questions: [] };
  return { full: false, total, freeCount, questions: await freeQuestionList(s.free_count) };
});

route('POST', '/api/payments', async (ctx) => {
  const b = await readJson(ctx.req);
  const u = await requireUser(ctx);
  if (u.paid) throw new HttpError(400, 'already_paid', 'Your account is already unlocked.');
  const txid = String(b.txid || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9.\-]{6,40}$/.test(txid)) throw new HttpError(400, 'bad_txid', 'Enter the transaction ID from your MoMo SMS.');
  const payer = b.payer ? normPhone(b.payer) : u.phone;
  if (b.payer && !payer) throw new HttpError(400, 'bad_phone', 'The number that paid is not valid.');
  if (payByUser.blocked(u.id)) throw tooMany(payByUser, u.id);
  const price = (await getSettings()).price;
  payByUser.hit(u.id);
  await tx(async (t) => {
    await t.get('SELECT id FROM users WHERE id = ? FOR UPDATE', u.id);
    if (await t.get("SELECT 1 FROM payments WHERE user_id = ? AND status = 'pending'", u.id)) {
      throw new HttpError(409, 'pending_exists', 'Your payment is already waiting for confirmation.');
    }
    if (await t.get('SELECT 1 FROM payments WHERE txid = ?', txid)) {
      throw new HttpError(409, 'txid_used', 'This transaction ID was already used.');
    }
    await t.run('INSERT INTO payments(user_id, txid, payer, amount) VALUES(?, ?, ?, ?)', u.id, txid, payer, price);
  }).catch((e) => {
    if (isUniqueError(e)) throw new HttpError(409, 'txid_used', 'This transaction ID was already used.');
    throw e;
  });
  live.toAdmins('payment', { name: u.name });
});

// ================= admin API =================
route('POST', '/api/admin/login', async (ctx) => {
  const b = await readJson(ctx.req);
  if (adminByIp.blocked(ctx.ip)) throw tooMany(adminByIp, ctx.ip);
  const a = await db.get('SELECT * FROM admins WHERE username = ?', String(b.username || '').trim());
  const ok = a ? await verifySecret(String(b.password || ''), a.pass_hash) : await burnTime(String(b.password || ''));
  if (!ok) {
    adminByIp.hit(ctx.ip);
    throw new HttpError(401, 'bad_login', 'Wrong username or password.');
  }
  adminByIp.clear(ctx.ip);
  const token = signToken({ role: 'admin', aid: a.id, v: a.token_version, exp: Date.now() + ADMIN_HOURS * 3600e3 });
  ctx.setCookies.push(cookie(ADMIN_COOKIE, token, { maxAgeSec: ADMIN_HOURS * 3600, path: '/api/admin', secure: ctx.secure }));
  await logAdmin(a.username, 'login', ctx.ip);
  return { username: a.username };
});

route('POST', '/api/admin/logout', async (ctx) => {
  await readJson(ctx.req);
  ctx.setCookies.push(cookie(ADMIN_COOKIE, '', { maxAgeSec: 0, path: '/api/admin', secure: ctx.secure }));
});

route('GET', '/api/admin/me', async (ctx) => ({ username: (await requireAdmin(ctx)).username }));

route('POST', '/api/admin/password', async (ctx) => {
  const b = await readJson(ctx.req);
  const a = await requireAdmin(ctx);
  if (!(await verifySecret(String(b.current || ''), a.pass_hash))) throw new HttpError(400, 'bad_password', 'Current password is wrong.');
  const next = String(b.next || '');
  if (next.length < 10) throw new HttpError(400, 'weak_password', 'Use at least 10 characters.');
  await db.run('UPDATE admins SET pass_hash = ?, token_version = token_version + 1 WHERE id = ?', await hashSecret(next), a.id);
  await logAdmin(a.username, 'password_changed');
  ctx.setCookies.push(cookie(ADMIN_COOKIE, '', { maxAgeSec: 0, path: '/api/admin', secure: ctx.secure }));
});

route('GET', '/api/admin/stats', async (ctx) => {
  await requireAdmin(ctx);
  const one = (sql) => db.get(sql);
  const [users, money, month, days, newToday, pending, questions, exams, examsToday, reviews, log] = await Promise.all([
    one('SELECT COUNT(*) AS n, SUM(paid) AS paid FROM users'),
    one("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'approved'"),
    one(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'approved' AND decided_at >= left(${NOW}, 7) || '-01'`),
    db.all(`SELECT left(decided_at, 10) AS day, COUNT(*) AS sales, SUM(amount) AS revenue
      FROM payments WHERE status = 'approved' AND decided_at >= left(${ago('13 days')}, 10) GROUP BY day ORDER BY day`),
    one(`SELECT COUNT(*) AS n FROM users WHERE created_at >= ${TODAY}`),
    one("SELECT COUNT(*) AS n FROM payments WHERE status = 'pending'"),
    questionCount(),
    one('SELECT COUNT(*) AS n, COALESCE(SUM(passed), 0) AS passed FROM exams'),
    one(`SELECT COUNT(*) AS n FROM exams WHERE created_at >= ${TODAY}`),
    one("SELECT COUNT(*) AS n, COALESCE(AVG(rating), 0) AS avg FROM reviews WHERE status = 'published'"),
    db.all('SELECT admin, action, detail, at FROM admin_log ORDER BY id DESC LIMIT 15')
  ]);
  return {
    users: users.n,
    paidUsers: users.paid || 0,
    newToday: newToday.n,
    pending: pending.n,
    sales: money.n,
    revenue: money.total,
    revenueMonth: month.total,
    questions,
    exams,
    examsToday: examsToday.n,
    reviews,
    days,
    log
  };
});

route('GET', '/api/admin/payments', async (ctx) => {
  await requireAdmin(ctx);
  const status = ctx.url.searchParams.get('status') || 'pending';
  const { limit, offset } = limitOffset(ctx.url);
  const where = ['pending', 'approved', 'rejected'].includes(status) ? 'WHERE p.status = ?' : '';
  const args = where ? [status, limit, offset] : [limit, offset];
  const rows = await db.all(`SELECT p.id, p.txid, p.payer, p.amount, p.status, p.note, p.created_at, p.decided_at,
      u.id AS user_id, u.name, u.phone
    FROM payments p JOIN users u ON u.id = p.user_id ${where}
    ORDER BY p.id ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`, ...args);
  return rows.map((p) => Object.assign(p, { phone: '0' + p.phone, payer: p.payer ? '0' + p.payer : null }));
});

route('POST', '/api/admin/payments/:id/approve', async (ctx) => {
  await readJson(ctx.req);
  const a = await requireAdmin(ctx);
  const pid = id(ctx.params.id);
  const p = await tx(async (t) => {
    const row = await t.get('SELECT * FROM payments WHERE id = ? FOR UPDATE', pid);
    if (!row) throw new HttpError(404, 'not_found', 'Payment not found.');
    if (row.status !== 'pending') throw new HttpError(409, 'decided', 'This payment was already handled.');
    await t.run(`UPDATE payments SET status = 'approved', decided_at = ${NOW} WHERE id = ?`, pid);
    await t.run(`UPDATE users SET paid = 1, paid_at = COALESCE(paid_at, ${NOW}) WHERE id = ?`, row.user_id);
    await logAdmin(a.username, 'approve_payment', `#${pid} ${row.txid}`, t);
    return row;
  });
  live.toUser(p.user_id, 'account', { paid: true });
  live.toAdmins('stats');
});

route('POST', '/api/admin/payments/:id/reject', async (ctx) => {
  const b = await readJson(ctx.req);
  const a = await requireAdmin(ctx);
  const pid = id(ctx.params.id);
  const note = String(b.note || '').trim().slice(0, 200) || null;
  const r = await db.run(`UPDATE payments SET status = 'rejected', note = ?, decided_at = ${NOW}
    WHERE id = ? AND status = 'pending' RETURNING user_id`, note, pid);
  if (!r.changes) throw new HttpError(409, 'decided', 'This payment was already handled.');
  await logAdmin(a.username, 'reject_payment', `#${pid} ${note || ''}`);
  live.toUser(r.rows[0].user_id, 'account', { rejected: true });
  live.toAdmins('stats');
});

route('GET', '/api/admin/users', async (ctx) => {
  await requireAdmin(ctx);
  const { limit, offset } = limitOffset(ctx.url);
  const q = String(ctx.url.searchParams.get('q') || '').trim();
  const filter = ctx.url.searchParams.get('filter');
  const where = [], args = [];
  if (q) {
    const digits = q.replace(/\D/g, '').replace(/^(250|0)/, '');
    where.push('(name ILIKE ?' + (digits ? ' OR phone LIKE ?' : '') + ')');
    args.push('%' + q.replace(/[\\%_]/g, '\\$&') + '%');
    if (digits) args.push('%' + digits + '%');
  }
  if (filter === 'paid') where.push('paid = 1');
  if (filter === 'unpaid') where.push('paid = 0');
  if (filter === 'blocked') where.push('blocked = 1');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = (await db.get(`SELECT COUNT(*) AS n FROM users ${w}`, ...args)).n;
  const rows = await db.all(`SELECT id, name, phone, paid, paid_at, blocked, trial_done, created_at, last_seen FROM users ${w}
    ORDER BY id DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
  return {
    total,
    users: rows.map((u) => Object.assign(u, { phone: '0' + u.phone, paid: !!u.paid, blocked: !!u.blocked, trialDone: !!u.trial_done }))
  };
});

route('POST', '/api/admin/users/:id', async (ctx) => {
  const b = await readJson(ctx.req);
  const a = await requireAdmin(ctx);
  const uid = id(ctx.params.id);
  const u = await db.get('SELECT * FROM users WHERE id = ?', uid);
  if (!u) throw new HttpError(404, 'not_found', 'User not found.');
  if (b.resetTrial === true) {
    await db.run('UPDATE users SET trial_done = 0 WHERE id = ?', uid);
    await logAdmin(a.username, 'reset_trial', `user ${uid} 0${u.phone}`);
  }
  // Phone numbers are unique; learners ask support to change theirs.
  if (b.phone != null) {
    const phone = normPhone(b.phone);
    if (!phone) throw new HttpError(400, 'bad_phone', 'Enter a valid Rwandan phone number (07...).');
    const taken = () => new HttpError(409, 'phone_taken', 'Another account already uses this number.');
    if (await db.get('SELECT id FROM users WHERE phone = ? AND id <> ?', phone, uid)) throw taken();
    try {
      await db.run('UPDATE users SET phone = ?, token_version = token_version + 1 WHERE id = ?', phone, uid);
    } catch (e) {
      if (isUniqueError(e)) throw taken();
      throw e;
    }
    await logAdmin(a.username, 'change_phone', `user ${uid}: 0${u.phone} -> 0${phone}`);
  }
  if (typeof b.paid === 'boolean') {
    await db.run(b.paid
      ? `UPDATE users SET paid = 1, paid_at = COALESCE(paid_at, ${NOW}) WHERE id = ?`
      : 'UPDATE users SET paid = 0 WHERE id = ?', uid);
    await logAdmin(a.username, b.paid ? 'grant_access' : 'remove_access', `user ${uid} 0${u.phone}`);
  }
  if (typeof b.blocked === 'boolean') {
    await db.run('UPDATE users SET blocked = ?, token_version = token_version + 1 WHERE id = ?', b.blocked ? 1 : 0, uid);
    await logAdmin(a.username, b.blocked ? 'block_user' : 'unblock_user', `user ${uid} 0${u.phone}`);
  }
  if (b.pin != null) {
    const pin = String(b.pin);
    if (!/^\d{4,6}$/.test(pin)) throw new HttpError(400, 'bad_pin', 'The PIN must be 4 to 6 digits.');
    await db.run('UPDATE users SET pin_hash = ?, token_version = token_version + 1 WHERE id = ?', await hashSecret(pin), uid);
    loginByPhone.clear(u.phone);
    await logAdmin(a.username, 'reset_pin', `user ${uid} 0${u.phone}`);
  }
  live.toUser(uid, 'account', {});
});

// ---------- admin: live events & reviews ----------
route('GET', '/api/admin/events', async (ctx) => {
  await requireAdmin(ctx);
  live.subscribeAdmin(ctx.res);
  return STREAM;
});

route('GET', '/api/admin/reviews', async (ctx) => {
  await requireAdmin(ctx);
  const status = ctx.url.searchParams.get('status');
  const { limit, offset } = limitOffset(ctx.url);
  const where = status === 'published' || status === 'hidden' ? 'WHERE r.status = ?' : '';
  const args = where ? [status, limit, offset] : [limit, offset];
  const [rows, summary, hidden] = await Promise.all([
    db.all(`SELECT r.id, r.rating, r.comment, r.status, r.created_at, r.updated_at, u.name, u.phone, u.paid
      FROM reviews r JOIN users u ON u.id = r.user_id ${where} ORDER BY r.updated_at DESC LIMIT ? OFFSET ?`, ...args),
    reviewSummary(),
    db.get("SELECT COUNT(*) AS n FROM reviews WHERE status = 'hidden'")
  ]);
  return {
    summary,
    hidden: hidden.n,
    reviews: rows.map((r) => Object.assign(r, { phone: '0' + r.phone, paid: !!r.paid }))
  };
});

route('POST', '/api/admin/reviews/:id', async (ctx) => {
  const b = await readJson(ctx.req);
  const a = await requireAdmin(ctx);
  const rid = id(ctx.params.id);
  if (b.status !== 'published' && b.status !== 'hidden') throw new HttpError(400, 'bad_status', 'Choose published or hidden.');
  const r = await db.run('UPDATE reviews SET status = ? WHERE id = ?', b.status, rid);
  if (!r.changes) throw new HttpError(404, 'not_found', 'Review not found.');
  await logAdmin(a.username, b.status === 'hidden' ? 'hide_review' : 'show_review', `#${rid}`);
});

route('GET', '/api/admin/settings', async (ctx) => { await requireAdmin(ctx); return getSettings(); });

route('PUT', '/api/admin/settings', async (ctx) => {
  const b = await readJson(ctx.req);
  const a = await requireAdmin(ctx);
  const err = await updateSettings(b);
  if (err) throw new HttpError(400, 'bad_settings', err);
  await logAdmin(a.username, 'settings', Object.keys(b).join(', '));
  return getSettings();
});

// ---------- questions ----------
route('GET', '/api/admin/questions', async (ctx) => {
  await requireAdmin(ctx);
  const freeIds = new Set((await freeQuestionList((await getSettings()).free_count)).map((q) => q.id));
  return (await listQuestions(null)).map((q) => Object.assign(q, { free: freeIds.has(q.id) }));
});

// Many rows per statement, so a big import is a few round trips to the database, not thousands.
async function insertQuestions(t, list, startOrd) {
  const CHUNK = 200;
  for (let i = 0; i < list.length; i += CHUNK) {
    const part = list.slice(i, i + CHUNK);
    const args = [];
    const values = part.map((q, j) => {
      args.push(startOrd + i + j, q.category, q.image, saveQuestionData(q));
      return '(?, ?, ?, ?)';
    });
    await t.run(`INSERT INTO questions(ord, category, image, data) VALUES ${values.join(', ')}`, ...args);
  }
}

async function nextOrd(t = db) {
  return ((await t.get('SELECT MAX(ord) AS m FROM questions')).m || 0) + 1;
}

route('POST', '/api/admin/questions', async (ctx) => {
  const a = await requireAdmin(ctx);
  const b = await readJson(ctx.req, 4 * 1024 * 1024);
  const q = validateQuestion(b);
  const row = await tx(async (t) => {
    await t.exec('LOCK TABLE questions IN SHARE ROW EXCLUSIVE MODE');
    return (await t.run('INSERT INTO questions(ord, category, image, data) VALUES(?, ?, ?, ?) RETURNING *',
      await nextOrd(t), q.category, q.image, saveQuestionData(q))).rows[0];
  });
  await logAdmin(a.username, 'add_question', `#${row.id}`);
  return rowToQuestion(row);
});

route('PUT', '/api/admin/questions/:id', async (ctx) => {
  const a = await requireAdmin(ctx);
  const b = await readJson(ctx.req, 4 * 1024 * 1024);
  const qid = id(ctx.params.id);
  const q = validateQuestion(b);
  const r = await db.run(`UPDATE questions SET category = ?, image = ?, data = ?, updated_at = ${NOW} WHERE id = ? RETURNING *`,
    q.category, q.image, saveQuestionData(q), qid);
  if (!r.changes) throw new HttpError(404, 'not_found', 'Question not found.');
  await logAdmin(a.username, 'edit_question', `#${qid}`);
  return rowToQuestion(r.rows[0]);
});

route('DELETE', '/api/admin/questions/:id', async (ctx) => {
  await readJson(ctx.req);
  const a = await requireAdmin(ctx);
  const qid = id(ctx.params.id);
  const r = await db.run('DELETE FROM questions WHERE id = ?', qid);
  if (!r.changes) throw new HttpError(404, 'not_found', 'Question not found.');
  await logAdmin(a.username, 'delete_question', `#${qid}`);
});

// ---------- import ----------
function langOf(v) {
  if (!LANGS.includes(v)) throw new HttpError(400, 'bad_lang', 'Choose the language of the file.');
  return v;
}

route('POST', '/api/admin/import/parse', async (ctx) => {
  const a = await requireAdmin(ctx);
  const b = await readJson(ctx.req, IMPORT_LIMIT);
  const lang = langOf(b.lang);
  let src;
  if (b.url) src = await fetchSource(String(b.url));
  else src = { content: b.content, filename: String(b.filename || ''), baseUrl: null };
  const candidates = parseSource({ content: src.content, filename: src.filename, lang, baseUrl: src.baseUrl });
  await logAdmin(a.username, 'import_read', b.url ? String(b.url).slice(0, 200) : src.filename);
  return { candidates };
});

route('POST', '/api/admin/import/commit', async (ctx) => {
  const a = await requireAdmin(ctx);
  const b = await readJson(ctx.req, IMPORT_LIMIT);
  const lang = langOf(b.lang);
  if (!Array.isArray(b.questions) || !b.questions.length) throw new HttpError(400, 'empty', 'Nothing to import.');
  if (b.questions.length > 20000) throw new HttpError(400, 'too_many_questions', 'Too many questions in one import.');
  const list = b.questions.map((q, i) => {
    try { return validateQuestion(q); } catch (e) { throw new HttpError(400, 'invalid_question', `Question ${i + 1}: ${e.message}`); }
  });

  if (b.mode === 'replace') {
    await tx(async (t) => {
      await t.exec('DELETE FROM questions');
      await insertQuestions(t, list, 1);
    });
    await logAdmin(a.username, 'import_replace', `${list.length} questions`);
    return { added: list.length, updated: 0, skipped: 0 };
  }

  if (b.mode === 'append') {
    await tx(async (t) => {
      await t.exec('LOCK TABLE questions IN SHARE ROW EXCLUSIVE MODE');
      await insertQuestions(t, list, await nextOrd(t));
    });
    await logAdmin(a.username, 'import_append', `${list.length} questions`);
    return { added: list.length, updated: 0, skipped: 0 };
  }

  if (b.mode === 'translate') {
    // Adds this language to the existing questions, matched by position.
    let updated = 0, skipped = 0, existingCount = 0;
    await tx(async (t) => {
      const existing = await t.all('SELECT * FROM questions ORDER BY ord, id FOR UPDATE');
      existingCount = existing.length;
      for (let i = 0; i < existing.length; i++) {
        const row = existing[i];
        const incoming = list[i];
        if (!incoming || !incoming.text[lang]) { skipped++; continue; }
        const cur = rowToQuestion(row);
        const count = Object.values(cur.options)[0].length;
        if (incoming.options[lang].length !== count || incoming.answer !== cur.answer) { skipped++; continue; }
        cur.text[lang] = incoming.text[lang];
        cur.options[lang] = incoming.options[lang];
        if (incoming.explanation[lang]) cur.explanation[lang] = incoming.explanation[lang];
        await t.run(`UPDATE questions SET data = ?, updated_at = ${NOW} WHERE id = ?`, saveQuestionData(cur), row.id);
        updated++;
      }
    });
    skipped += Math.max(0, list.length - existingCount);
    await logAdmin(a.username, 'import_translation', `${lang}: ${updated} updated, ${skipped} skipped`);
    return { added: 0, updated, skipped };
  }

  throw new HttpError(400, 'bad_mode', 'Choose how to import.');
});

route('GET', '/api/admin/log', async (ctx) => {
  await requireAdmin(ctx);
  const { limit, offset } = limitOffset(ctx.url);
  return db.all('SELECT admin, action, detail, at FROM admin_log ORDER BY id DESC LIMIT ? OFFSET ?', limit, offset);
});

module.exports = { handle };
