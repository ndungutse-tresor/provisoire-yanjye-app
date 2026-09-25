'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./src/db');
const { hashSecret } = require('./src/auth');
const { handle } = require('./src/api');
const { sendJson } = require('./src/http');

const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const PUBLIC = path.join(__dirname, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'"
  ].join('; ')
};
if (PROD) SECURITY['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';

const PAGES = { '/': 'index.html', '/admin': 'admin.html' };

function serveStatic(req, res, pathname) {
  const rel = PAGES[pathname] || pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) || rel.split('/').some((p) => p.startsWith('.'))) return notFound(res);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const ext = path.extname(file);
    const fresh = ext === '.html' || rel === 'sw.js' || ext === '.webmanifest';
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': fresh ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  const proto = TRUST_PROXY ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() : '';
  const secure = PROD || proto === 'https';
  const ip = TRUST_PROXY
    ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress
    : req.socket.remoteAddress;

  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { return notFound(res); }

  try {
    if (await handle(req, res, url, { ip, secure })) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method' });
    serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'server' });
  }
});

// First run on a host: create the admin from environment variables.
async function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (count) return;
  const user = process.env.ADMIN_USER, pass = process.env.ADMIN_PASSWORD;
  if (user && pass && pass.length >= 10) {
    db.prepare('INSERT INTO admins(username, pass_hash) VALUES(?, ?)').run(user, await hashSecret(pass));
    console.log(`Admin "${user}" created from ADMIN_USER / ADMIN_PASSWORD.`);
  } else {
    console.log('No admin account yet. Create one with:  npm run create-admin -- <username>');
  }
}

seedAdmin().then(() => {
  server.listen(PORT, () => {
    console.log(`Provisoire Yanjye running: http://localhost:${PORT}   admin: http://localhost:${PORT}/admin`);
  });
});
