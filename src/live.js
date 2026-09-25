'use strict';
// Real-time push over Server-Sent Events: learners hear when their account changes
// (payment approved, access removed); admins hear about new payments, reviews and exams.

const MAX_PER_USER = 5;
const users = new Map();   // user id -> Set of open responses
const admins = new Set();

function open(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 5000\n\n');
}

function send(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(data || {})}\n\n`);
}

function subscribeUser(uid, res) {
  let set = users.get(uid);
  if (!set) users.set(uid, (set = new Set()));
  if (set.size >= MAX_PER_USER) set.values().next().value.end();
  open(res);
  set.add(res);
  res.on('close', () => {
    set.delete(res);
    if (!set.size && users.get(uid) === set) users.delete(uid);
  });
}

function subscribeAdmin(res) {
  open(res);
  admins.add(res);
  res.on('close', () => admins.delete(res));
}

function toUser(uid, type, data) {
  const set = users.get(uid);
  if (set) for (const r of set) send(r, type, data);
}

function toAdmins(type, data) {
  for (const r of admins) send(r, type, data);
}

// Comment pings keep proxies from closing idle connections.
setInterval(() => {
  for (const set of users.values()) for (const r of set) r.write(': ping\n\n');
  for (const r of admins) r.write(': ping\n\n');
}, 25000).unref();

module.exports = { subscribeUser, subscribeAdmin, toUser, toAdmins };
