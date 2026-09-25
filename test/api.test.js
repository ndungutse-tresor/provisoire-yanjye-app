'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-test-'));
let proc;

function client() {
  const jar = {};
  return async function call(method, p, body, headers = {}) {
    const res = await fetch(BASE + p, {
      method,
      headers: Object.assign(
        body !== undefined ? { 'Content-Type': 'application/json' } : {},
        { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
        headers
      ),
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const v = kv.slice(i + 1);
      if (v) jar[kv.slice(0, i)] = v; else delete jar[kv.slice(0, i)];
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not json */ }
    return { status: res.status, body: json, headers: res.headers };
  };
}

// An app file shaped like a typical single-file quiz app.
function sampleHtml(n) {
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push(`  { q: "Ikibazo ${i + 1}: ni iki?", options: ['Igisubizo A${i}', "Igisubizo B${i}", \`Igisubizo C${i}\`], answer: ${i % 3}, // comment
    img: ${i % 5 === 0 ? '"data:image/png;base64,iVBORw0KGgo="' : 'null'}, cat: "${i < 20 ? 'Amategeko' : 'Ibyapa'}" },`);
  }
  return `<!DOCTYPE html><html><head><script src="x.js"></script></head><body>
<script>
const settings = { theme: 'dark' };
const questions = [
${items.join('\n')}
];
function render(i) { if (i === 1) { return questions[i]; } fetch('/x', { method: 'POST' }); }
</script></body></html>`;
}

before(async () => {
  proc = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA, ADMIN_USER: 'boss', ADMIN_PASSWORD: 'correct-horse-9' }),
    stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => { if (String(d).includes('running')) resolve(); });
    proc.on('exit', () => reject(new Error('server exited')));
  });
});

after(() => {
  proc.kill();
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* locked on Windows */ }
});

const admin = client();
const learner = client();
const other = client();

test('security headers are set', async () => {
  const r = await fetch(BASE + '/api/config');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('admin endpoints require login', async () => {
  const r = await other('GET', '/api/admin/stats');
  assert.equal(r.status, 401);
  const big = await other('POST', '/api/admin/import/parse', { lang: 'rw', content: 'x'.repeat(2e6) });
  assert.equal(big.status, 401);
});

test('admin login: wrong then right', async () => {
  assert.equal((await admin('POST', '/api/admin/login', { username: 'boss', password: 'nope' })).status, 401);
  const r = await admin('POST', '/api/admin/login', { username: 'boss', password: 'correct-horse-9' });
  assert.equal(r.status, 200);
  assert.equal((await admin('GET', '/api/admin/me')).body.username, 'boss');
});

test('cross-site POST is refused', async () => {
  const r = await admin('POST', '/api/admin/settings', {}, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  const form = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'phone=1' });
  assert.equal(form.status, 415);
});

test('import: reads questions from an app HTML file', async () => {
  const r = await admin('POST', '/api/admin/import/parse', { lang: 'rw', filename: 'amategeko.html', content: sampleHtml(60) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = r.body.candidates[0];
  assert.equal(c.questions.length, 60);
  assert.equal(c.questions[1].answer, 1);
  assert.deepEqual(c.questions[0].options.rw, ['Igisubizo A0', 'Igisubizo B0', 'Igisubizo C0']);
  assert.equal(c.questions[0].category, 'Amategeko');
  assert.ok(c.questions[0].image.startsWith('data:image/png'));
  const commit = await admin('POST', '/api/admin/import/commit', { lang: 'rw', mode: 'replace', questions: c.questions });
  assert.equal(commit.body.added, 60);
});

test('import: letter columns with 1-based answers', async () => {
  const items = Array.from({ length: 12 }, (_, i) =>
    ({ question: 'Q' + i, a: 'one', b: 'two', c: 'three', d: 'four', correct: (i % 4) + 1 }));
  const r = await admin('POST', '/api/admin/import/parse', { lang: 'en', filename: 'q.json', content: JSON.stringify({ data: items }) });
  const c = r.body.candidates[0];
  assert.equal(c.questions.length, 12);
  assert.equal(c.questions[0].answer, 0);
  assert.equal(c.questions[3].answer, 3);
  assert.match(c.mapping, /counted from 1/);
});

test('import: CSV with letter answers and a translation merge', async () => {
  const rows = ['question,a,b,c,answer'];
  for (let i = 0; i < 60; i++) rows.push(`"Question ${i}, in English",A${i},B${i},C${i},${'abc'[i % 3]}`);
  const r = await admin('POST', '/api/admin/import/parse', { lang: 'en', filename: 'q.csv', content: rows.join('\r\n') });
  const c = r.body.candidates[0];
  assert.equal(c.questions.length, 60);
  assert.equal(c.questions[0].text.en, 'Question 0, in English');
  const m = await admin('POST', '/api/admin/import/commit', { lang: 'en', mode: 'translate', questions: c.questions });
  assert.equal(m.body.updated, 60);
  const all = await admin('GET', '/api/admin/questions');
  assert.equal(all.body[5].text.en, 'Question 5, in English');
  assert.equal(all.body[5].text.rw, 'Ikibazo 6: ni iki?');
});

test('import: rejects files with no questions and private links', async () => {
  const r = await admin('POST', '/api/admin/import/parse', { lang: 'rw', content: '<html><body>hello</body></html>' });
  assert.equal(r.status, 422);
  const u = await admin('POST', '/api/admin/import/parse', { lang: 'rw', url: 'http://127.0.0.1:22/' });
  assert.equal(u.status, 400);
});

test('learner: register, free questions only, pay, approval unlocks', async () => {
  assert.equal((await learner('POST', '/api/auth/register', { name: 'Aline', phone: '0788 123 456', pin: '1111' })).status, 400);
  const reg = await learner('POST', '/api/auth/register', { name: 'Aline', phone: '0788 123 456', pin: '4821' });
  assert.equal(reg.status, 200);
  assert.equal(reg.body.user.phone, '0788123456');
  assert.equal((await other('POST', '/api/auth/register', { name: 'Xavier', phone: '+250788123456', pin: '4821' })).status, 409);

  const guest = await client()('GET', '/api/questions');
  assert.equal(guest.body.needAccount, true);
  assert.equal(guest.body.questions.length, 0);

  const q = await learner('GET', '/api/questions');
  assert.equal(q.body.full, false);
  assert.equal(q.body.questions.length, 16);
  assert.equal(q.body.freeCount, 16);
  const cats = new Set(q.body.questions.map((x) => x.category));
  assert.ok(cats.has('Amategeko') && cats.has('Ibyapa'), 'trial mixes both topics');
  assert.notEqual(q.body.questions[0].category, q.body.questions[1].category, 'mix starts from the first question');
  assert.equal(q.body.total, 60);

  assert.equal((await learner('POST', '/api/payments', { txid: '123' })).status, 400);
  assert.equal((await learner('POST', '/api/payments', { txid: '12345678901' })).status, 200);
  assert.equal((await learner('POST', '/api/payments', { txid: '12345678902' })).status, 409);

  const pending = await admin('GET', '/api/admin/payments?status=pending');
  assert.equal(pending.body.length, 1);
  assert.equal(pending.body[0].phone, '0788123456');
  assert.equal((await admin('POST', `/api/admin/payments/${pending.body[0].id}/approve`, {})).status, 200);
  assert.equal((await admin('POST', `/api/admin/payments/${pending.body[0].id}/approve`, {})).status, 409);

  const q2 = await learner('GET', '/api/questions');
  assert.equal(q2.body.full, true);
  assert.equal(q2.body.questions.length, 60);
});

test('same transaction ID cannot be reused by another account', async () => {
  await other('POST', '/api/auth/register', { name: 'Eric', phone: '0722000111', pin: '5930' });
  const r = await other('POST', '/api/payments', { txid: '12345678901' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'txid_used');
});

test('login lockout after 5 wrong PINs', async () => {
  const c = client();
  for (let i = 0; i < 5; i++) assert.equal((await c('POST', '/api/auth/login', { phone: '0722000111', pin: '0000' })).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { phone: '0722000111', pin: '5930' })).status, 429);
});

test('blocking a user ends their session', async () => {
  const users = await admin('GET', '/api/admin/users?q=Aline');
  const uid = users.body.users[0].id;
  await admin('POST', `/api/admin/users/${uid}`, { blocked: true });
  assert.equal((await learner('GET', '/api/me')).body.user, null);
  assert.equal((await learner('GET', '/api/questions')).body.full, false);
  await admin('POST', `/api/admin/users/${uid}`, { blocked: false });
});

test('free trial locks after the trial exam and stays locked on a new login', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { name: 'Trial Tester', phone: '0786660001', pin: '3917' });
  assert.equal((await c('GET', '/api/questions')).body.questions.length, 16);
  const done = await c('POST', '/api/exams', { score: 12, total: 16 });
  assert.equal(done.body.trialDone, true);
  const after = await c('GET', '/api/questions');
  assert.equal(after.body.trialDone, true);
  assert.equal(after.body.questions.length, 0);
  assert.equal((await c('POST', '/api/exams', { score: 16, total: 16 })).status, 403);

  // a fresh login (new phone, cleared browser) is still locked
  const c2 = client();
  await c2('POST', '/api/auth/login', { phone: '0786660001', pin: '3917' });
  const me = await c2('GET', '/api/me');
  assert.equal(me.body.user.trialDone, true);
  assert.equal(me.body.lastExam.score, 12);
  assert.equal((await c2('GET', '/api/questions')).body.questions.length, 0);

  // support can give another trial
  const uid = (await admin('GET', '/api/admin/users?q=Trial Tester')).body.users[0].id;
  await admin('POST', `/api/admin/users/${uid}`, { resetTrial: true });
  assert.equal((await c2('GET', '/api/questions')).body.questions.length, 16);
});

test('admin daily limits: questions per day and exams per day', async () => {
  await admin('PUT', '/api/admin/settings', { daily_questions: 5, daily_exams: 2 });
  const c = client();
  await c('POST', '/api/auth/register', { name: 'Daily Limit', phone: '0786660002', pin: '3918' });
  const uid = (await admin('GET', '/api/admin/users?q=Daily Limit')).body.users[0].id;
  await admin('POST', `/api/admin/users/${uid}`, { paid: true });

  const cfg = await c('GET', '/api/config');
  assert.deepEqual(cfg.body.limits, { questions: 5, exams: 2 });
  const ids = (await c('GET', '/api/questions')).body.questions.map((q) => q.id);
  let u = await c('POST', '/api/usage', { seen: ids.slice(0, 3) });
  assert.equal(u.body.questions, 3);
  u = await c('POST', '/api/usage', { seen: ids.slice(0, 10) });   // 2 repeats + 8 new, only 2 fit
  assert.equal(u.body.questions, 5);
  assert.equal((await c('GET', '/api/me')).body.usage.questions, 5);

  assert.equal((await c('POST', '/api/exams/start', {})).status, 200);
  assert.equal((await c('POST', '/api/exams/start', {})).status, 200);
  const third = await c('POST', '/api/exams/start', {});
  assert.equal(third.status, 429);
  assert.equal(third.body.error, 'daily_exam_limit');

  await admin('PUT', '/api/admin/settings', { daily_questions: 0, daily_exams: 0 });
  assert.equal((await c('POST', '/api/exams/start', {})).status, 200);
});

test('one account per phone; support changes a number', async () => {
  const users = await admin('GET', '/api/admin/users?q=Aline');
  const uid = users.body.users[0].id;
  // 0722000111 belongs to Eric: cannot be reused
  const taken = await admin('POST', `/api/admin/users/${uid}`, { phone: '0722000111' });
  assert.equal(taken.status, 409);
  assert.equal((await admin('POST', `/api/admin/users/${uid}`, { phone: '0788999000' })).status, 200);
  assert.equal((await admin('GET', '/api/admin/users?q=Aline')).body.users[0].phone, '0788999000');
  const again = await client()('POST', '/api/auth/register', { name: 'Someone', phone: '0788999000', pin: '5931' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'phone_taken');
});

test('settings validation and stats', async () => {
  assert.equal((await admin('PUT', '/api/admin/settings', { pass_mark: 99 })).status, 400);
  const s = await admin('PUT', '/api/admin/settings', { price: 2500, momo_number: '0788000000' });
  assert.equal(s.body.price, 2500);
  const cfg = await other('GET', '/api/config');
  assert.equal(cfg.body.price, 2500);
  assert.equal(cfg.body.categories.length, 2);
  const st = await admin('GET', '/api/admin/stats');
  assert.equal(st.body.sales, 1);
  assert.equal(st.body.revenue, 2000);
});

test('question edit validation', async () => {
  const bad = await admin('POST', '/api/admin/questions', { text: { rw: 'x' }, options: { rw: ['a'] }, answer: 0 });
  assert.equal(bad.status, 400);
  const evil = await admin('POST', '/api/admin/questions', { text: { rw: 'x' }, options: { rw: ['a', 'b'] }, answer: 0, image: 'javascript:alert(1)' });
  assert.equal(evil.status, 400);
  const ok = await admin('POST', '/api/admin/questions', { text: { rw: 'Ikibazo gishya', fr: 'Nouvelle question' }, options: { rw: ['a', 'b'], fr: ['a', 'b'] }, answer: 1 });
  assert.equal(ok.status, 200);
  assert.equal((await admin('DELETE', `/api/admin/questions/${ok.body.id}`, {})).status, 200);
});

test('reviews: need a finished exam, one per learner, admin can hide', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { name: 'Grace Iradukunda', phone: '0791234567', pin: '7351' });
  const early = await c('POST', '/api/reviews', { rating: 5, comment: 'Great' });
  assert.equal(early.status, 403);
  assert.equal(early.body.error, 'exam_first');

  assert.equal((await c('POST', '/api/exams', { score: 30, total: 20 })).status, 400);
  const ex = await c('POST', '/api/exams', { score: 15, total: 20 });
  assert.equal(ex.body.passed, true);
  assert.equal((await c('POST', '/api/reviews', { rating: 6 })).status, 400);
  assert.equal((await c('POST', '/api/reviews', { rating: 4, comment: 'Very helpful' })).status, 200);
  assert.equal((await c('POST', '/api/reviews', { rating: 5, comment: 'Passed my test!' })).status, 200);

  const me = await c('GET', '/api/me');
  assert.equal(me.body.review.rating, 5);
  assert.equal(me.body.examCount, 1);

  const pub = await other('GET', '/api/reviews');
  assert.equal(pub.body.count, 1);
  assert.equal(pub.body.average, 5);
  assert.equal(pub.body.recent[0].name, 'Grace I.');
  assert.equal(pub.body.recent[0].comment, 'Passed my test!');
  assert.equal(pub.body.recent[0].phone, undefined);

  const list = await admin('GET', '/api/admin/reviews');
  await admin('POST', `/api/admin/reviews/${list.body.reviews[0].id}`, { status: 'hidden' });
  assert.equal((await other('GET', '/api/reviews')).body.count, 0);
  await admin('POST', `/api/admin/reviews/${list.body.reviews[0].id}`, { status: 'published' });
  const st = await admin('GET', '/api/admin/stats');
  assert.ok(st.body.exams.n >= 1);
  assert.equal(st.body.reviews.n, 1);
});

// Reads server-sent events from a stream until `want` arrives.
async function nextEvent(res, want) {
  const reader = res.body.getReader();
  let buf = '';
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += Buffer.from(value).toString();
    const m = new RegExp('event: ' + want + '\\ndata: (.*)\\n').exec(buf);
    if (m) { reader.cancel(); return JSON.parse(m[1]); }
  }
  reader.cancel();
  return null;
}

test('live: learner is told the moment their payment is approved', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { name: 'Live Tester', phone: '0781231231', pin: '8264' });
  await c('POST', '/api/payments', { txid: '99887766551' });

  // Open the learner's live stream with the learner's session cookie.
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '0781231231', pin: '8264' }) });
  const sess = login.headers.getSetCookie()[0].split(';')[0];
  const stream = await fetch(BASE + '/api/events', { headers: { Cookie: sess } });
  assert.equal(stream.headers.get('content-type').split(';')[0], 'text/event-stream');

  const adminStream = await fetch(BASE + '/api/admin/events', { headers: { Cookie: 'x=1' } });
  assert.equal(adminStream.status, 401);

  const pending = await admin('GET', '/api/admin/payments?status=pending');
  const p = pending.body.find((x) => x.txid === '99887766551');
  const got = nextEvent(stream, 'account');
  await admin('POST', `/api/admin/payments/${p.id}/approve`, {});
  assert.deepEqual(await got, { paid: true });
});

test('MoMo Pay defaults and QR endpoint', async () => {
  const cfg = await other('GET', '/api/config');
  assert.equal(cfg.body.momoName, 'Tresor');
  assert.equal(cfg.body.momoPayCode, '675148');
  assert.equal(cfg.body.momoQr, 'tel:*182*8*1*675148%23');
  assert.equal(cfg.body.momoUssd, '*182*8*1*675148#');
  const r = await fetch(BASE + '/api/qr.svg?d=' + encodeURIComponent(cfg.body.momoQr));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/svg+xml');
  assert.match(await r.text(), /^<svg [^>]*viewBox="0 0 33 33"/); // version 2 (25) + quiet zone
  assert.equal((await fetch(BASE + '/api/qr.svg?d=' + 'x'.repeat(201))).status, 400);
});

test('static files and path traversal', async () => {
  assert.equal((await fetch(BASE + '/..%2fserver.js')).status, 404);
  assert.equal((await fetch(BASE + '/../data/secret.key')).status, 404);
});
