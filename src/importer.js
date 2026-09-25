'use strict';
// Reads questions out of an existing app file (.html/.js), a .json file or a .csv sheet.
// Nothing in the file is executed: data is found by parsing literals only.
const dns = require('node:dns').promises;
const net = require('node:net');
const { parseLiteral } = require('./jsliteral');
const { HttpError } = require('./http');
const { validateQuestion } = require('./questions');

const MAX_SOURCE = 30 * 1024 * 1024;
const nk = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const NAMES = {
  text: ['question', 'questiontext', 'q', 'text', 'title', 'ikibazo', 'prompt', 'body', 'enonce', 'stem', 'qtext'],
  options: ['options', 'choices', 'answers', 'ibisubizo', 'propositions', 'reponses', 'alternatives', 'opts', 'choix', 'possibleanswers', 'answeroptions', 'amahitamo'],
  answer: ['answer', 'correct', 'correctanswer', 'correctindex', 'correctoption', 'ans', 'right', 'rightanswer', 'solution', 'key',
    'igisubizo', 'igisubizocyukuri', 'reponse', 'bonnereponse', 'answerindex', 'correctans', 'correctchoice'],
  image: ['image', 'img', 'imageurl', 'imagesrc', 'sign', 'signimage', 'icon', 'src', 'picture', 'photo', 'pic', 'ifoto', 'file', 'url'],
  explanation: ['explanation', 'explain', 'reason', 'hint', 'note', 'notes', 'ibisobanuro', 'details', 'why', 'explication', 'commentaire'],
  category: ['category', 'cat', 'section', 'type', 'topic', 'group', 'chapter', 'icyiciro', 'categorie', 'theme']
};
const OPT_TEXT = ['text', 'label', 'value', 't', 'option', 'answer', 'content', 'title', 'choice'];
const OPT_FLAG = ['correct', 'iscorrect', 'right', 'isright', 'valid', 'istrue'];

// ---------- finding arrays of objects ----------
function labelOf(o) {
  for (const k of ['name', 'title', 'category', 'section', 'label', 'icyiciro']) {
    const v = o[k];
    if (typeof v === 'string' && v.trim() && v.length <= 60) return v.trim();
  }
  return '';
}

function collect(v, path, groups, label, depth) {
  if (depth > 8 || v === null || typeof v !== 'object') return;
  if (Array.isArray(v)) {
    const objs = v.filter(isObj);
    if (objs.length && objs.length >= v.length * 0.8) {
      const g = groups.get(path) || { path, items: [] };
      for (const o of objs) g.items.push({ o, label });
      groups.set(path, g);
      for (const o of objs) {
        const l = labelOf(o) || label;
        for (const k of Object.keys(o)) collect(o[k], path + '[].' + k, groups, l, depth + 1);
      }
    } else {
      for (const x of v) collect(x, path + '[]', groups, label, depth + 1);
    }
    return;
  }
  for (const k of Object.keys(v)) collect(v[k], path ? path + '.' + k : k, groups, label, depth + 1);
}

function tryLiteral(src, start, name, groups) {
  try {
    const { value, end } = parseLiteral(src, start);
    if (value && typeof value === 'object') {
      collect(value, name, groups, '', 0);
      return end;
    }
  } catch (e) { /* not a plain literal */ }
  return -1;
}

function scanScript(src, groups) {
  const t = src.trimStart();
  if (t[0] === '[' || t[0] === '{') tryLiteral(src, src.length - t.length, 'data', groups);
  const re = /(?:[=:(,]|\breturn)\s*(?=[[{])/g;
  let m, tries = 0;
  while ((m = re.exec(src)) && tries++ < 50000) {
    const before = src.slice(Math.max(0, m.index - 80), m.index + 1);
    const nm = /([A-Za-z_$][\w$.]*)\s*[=:]\s*$/.exec(before);
    const end = tryLiteral(src, m.index + m[0].length, nm ? nm[1] : 'data', groups);
    if (end > 0) re.lastIndex = end;
  }
}

// ---------- CSV ----------
function parseCsv(text) {
  const firstLine = text.split('\n', 1)[0];
  const delim = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows
    .filter((r) => r.some((x) => x.trim()))
    .map((r) => {
      const o = {};
      head.forEach((h, i) => { if (h) o[h] = (r[i] || '').trim(); });
      return o;
    });
}

// ---------- mapping fields ----------
function keyStats(objs) {
  const s = new Map();
  for (const o of objs) {
    for (const k of Object.keys(o)) {
      const v = o[k];
      let e = s.get(k);
      if (!e) s.set(k, (e = { n: 0, str: 0, strLen: 0, arr: 0, arrLen: 0, num: 0, bool: 0 }));
      e.n++;
      if (typeof v === 'string' && v.trim()) { e.str++; e.strLen += v.length; }
      else if (Array.isArray(v)) { e.arr++; e.arrLen += v.length; }
      else if (typeof v === 'number') e.num++;
      else if (typeof v === 'boolean') e.bool++;
    }
  }
  return s;
}

function detectMapping(objs) {
  const sample = objs.slice(0, 300);
  const st = keyStats(sample);
  const need = Math.max(1, Math.ceil(sample.length * 0.6));
  const all = [...st.keys()];
  const common = all.filter((k) => st.get(k).n >= need);
  const used = new Set();
  const byName = (list, keys, ok) => {
    for (const name of list) {
      const k = keys.find((x) => nk(x) === name && !used.has(x) && ok(st.get(x)));
      if (k) return k;
    }
    return null;
  };
  const map = {};

  const optArr = (e) => e.arr >= need && e.arrLen / e.arr >= 2 && e.arrLen / e.arr <= 8;
  map.options = byName(NAMES.options, common, optArr) || common.find((k) => optArr(st.get(k))) || null;
  if (map.options) {
    used.add(map.options);
  } else {
    // answers stored as separate fields: a/b/c/d, option1..option4, choiceA..
    const groups = {};
    for (const k of common) {
      const m = /^(opt|option|choice|answer|ans|igisubizo|reponse|choix|)([a-h]|[1-8])$/.exec(nk(k));
      const e = st.get(k);
      if (m && e.str + e.num >= need) (groups[m[1]] = groups[m[1]] || []).push({ k, s: m[2] });
    }
    let best = null;
    for (const g of Object.values(groups)) if (g.length >= 2 && (!best || g.length > best.length)) best = g;
    if (best) {
      best.sort((a, b) => (a.s < b.s ? -1 : 1));
      map.optionKeys = best.map((x) => x.k);
      map.optionKeys.forEach((k) => used.add(k));
    }
  }

  map.answer = byName(NAMES.answer, common, (e) => e.num + e.str + e.bool >= need);
  if (map.answer) used.add(map.answer);
  for (const f of ['image', 'explanation', 'category']) {
    map[f] = byName(NAMES[f], all, (e) => e.str >= 1);
    if (map[f]) used.add(map[f]);
  }
  map.text = byName(NAMES.text, common, (e) => e.str >= need);
  if (!map.text) {
    let bestLen = 0;
    for (const k of common) {
      const e = st.get(k);
      if (used.has(k) || e.str < need) continue;
      const avg = e.strLen / e.str;
      if (avg > bestLen) { bestLen = avg; map.text = k; }
    }
  }
  return map;
}

function cleanText(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .trim();
}

function optionFrom(v) {
  if (typeof v === 'string' || typeof v === 'number') return { text: cleanText(v), correct: false };
  if (!isObj(v)) return { text: '', correct: false };
  let text = '', correct = false;
  for (const k of Object.keys(v)) {
    const x = v[k];
    if (!text && OPT_TEXT.includes(nk(k)) && (typeof x === 'string' || typeof x === 'number')) text = cleanText(x);
    if (OPT_FLAG.includes(nk(k)) && (x === true || x === 1 || x === 'true')) correct = true;
  }
  return { text, correct };
}

function numericAnswer(raw) {
  if (Array.isArray(raw)) raw = raw[0];
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
  if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) return Number(raw);
  return null;
}

function resolveAnswer(raw, opts, oneBased, optionKeys) {
  const flagged = opts.findIndex((o) => o.correct);
  if (flagged >= 0) return flagged;
  if (Array.isArray(raw)) raw = raw[0];
  const n = numericAnswer(raw);
  if (n != null) return oneBased ? n - 1 : n;
  if (typeof raw !== 'string') return -1;
  const s = raw.trim();
  const letter = /^([a-h])[).:]?$/i.exec(s);
  if (letter) return letter[1].toLowerCase().charCodeAt(0) - 97;
  if (optionKeys) {
    const k = optionKeys.findIndex((x) => nk(x) === nk(s));
    if (k >= 0) return k;
  }
  const t = cleanText(s).toLowerCase();
  return opts.findIndex((o) => o.text.toLowerCase() === t);
}

function describe(map, oneBased) {
  const parts = [`question ← "${map.text}"`];
  parts.push(map.options ? `answers ← "${map.options}"` : `answers ← ${map.optionKeys.map((k) => `"${k}"`).join(', ')}`);
  parts.push(map.answer ? `correct ← "${map.answer}"${oneBased ? ' (counted from 1)' : ''}` : 'correct ← marked inside the answers');
  if (map.image) parts.push(`image ← "${map.image}"`);
  if (map.explanation) parts.push(`explanation ← "${map.explanation}"`);
  if (map.category) parts.push(`category ← "${map.category}"`);
  return parts.join(' · ');
}

function buildCandidate(group, lang, baseUrl) {
  const objs = group.items.map((x) => x.o);
  const map = detectMapping(objs);
  if (!map.text || !(map.options || map.optionKeys)) return null;

  const rawOptions = (o) => {
    const list = map.options
      ? (Array.isArray(o[map.options]) ? o[map.options] : [])
      : map.optionKeys.map((k) => o[k]).filter((v) => v != null && String(v).trim() !== '');
    return list.map(optionFrom);
  };

  // Answers counted from 1 have no 0 anywhere (with 10+ questions, a 0-based set always has one).
  const nums = [];
  for (const o of objs) {
    const n = map.answer ? numericAnswer(o[map.answer]) : null;
    if (n != null) nums.push({ n, len: rawOptions(o).length });
  }
  const oneBased = nums.length > 0 && !nums.some((x) => x.n === 0) &&
    nums.every((x) => x.n >= 1 && x.n <= x.len) && (nums.length >= 10 || nums.some((x) => x.n === x.len));

  const questions = [], reasons = {};
  let relImages = 0, httpImages = 0;
  const skip = (why) => { reasons[why] = (reasons[why] || 0) + 1; };

  group.items.forEach(({ o, label }) => {
    const opts = rawOptions(o);
    const answer = resolveAnswer(map.answer ? o[map.answer] : null, opts, oneBased, map.optionKeys);
    let image = map.image && typeof o[map.image] === 'string' ? o[map.image].trim() : '';
    if (image && !/^(data:|https?:)/i.test(image)) {
      if (baseUrl) {
        try { image = new URL(image, baseUrl).href; } catch (e) { image = ''; }
      } else {
        relImages++;
        image = '';
      }
    }
    if (/^http:/i.test(image)) httpImages++;
    const ex = map.explanation && o[map.explanation] != null ? cleanText(o[map.explanation]) : '';
    const cat = map.category && typeof o[map.category] === 'string' ? o[map.category].trim() : label;
    try {
      questions.push(validateQuestion({
        category: cat.slice(0, 40),
        image: image || null,
        text: { [lang]: cleanText(o[map.text] == null ? '' : o[map.text]) },
        options: { [lang]: opts.map((x) => x.text) },
        answer,
        explanation: ex ? { [lang]: ex } : {}
      }));
    } catch (e) {
      skip(e.message);
    }
  });

  const warnings = [];
  const skipped = objs.length - questions.length;
  if (skipped) {
    warnings.push(`${skipped} item(s) skipped: ` +
      Object.entries(reasons).map(([r, n]) => `${r} (${n})`).slice(0, 3).join('; '));
  }
  if (relImages) warnings.push(`${relImages} image(s) point to files next to the original app (e.g. "img/sign.png") and were left out. Import from a link to that app, or add the pictures in the Questions tab.`);
  if (httpImages) warnings.push(`${httpImages} image(s) use http:// links, which phones may block. Use https:// links.`);

  return { path: group.path, found: objs.length, mapping: describe(map, oneBased), warnings, questions };
}

function parseSource({ content, filename, lang, baseUrl }) {
  if (typeof content !== 'string' || !content.trim()) throw new HttpError(400, 'empty', 'The file is empty.');
  if (content.length > MAX_SOURCE) throw new HttpError(413, 'too_large', 'The file is larger than 30 MB.');
  const text = content.replace(/^﻿/, '');
  const trimmed = text.trim();
  const groups = new Map();

  const looksCsv = /\.(csv|tsv)$/i.test(filename || '') ||
    (!/^[<[{]/.test(trimmed) && /[,;\t]/.test(trimmed.split('\n', 1)[0]) && !/[<>{}]/.test(trimmed.slice(0, 500)));

  if (looksCsv) {
    collect(parseCsv(trimmed), 'sheet', groups, '', 0);
  } else {
    if (trimmed[0] === '[' || trimmed[0] === '{') {
      try { collect(JSON.parse(trimmed), 'data', groups, '', 0); } catch (e) { /* JS, not JSON */ }
    }
    if (!groups.size) {
      const scripts = [];
      const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
      let m;
      while ((m = re.exec(text))) if (!/\bsrc\s*=/i.test(m[1])) scripts.push(m[2]);
      if (!scripts.length) scripts.push(text);
      for (const s of scripts) scanScript(s, groups);
    }
  }

  const candidates = [...groups.values()]
    .map((g) => buildCandidate(g, lang, baseUrl))
    .filter((c) => c && c.questions.length)
    .sort((a, b) => b.questions.length - a.questions.length);

  if (!candidates.length) {
    throw new HttpError(422, 'no_questions',
      'No question list was found in this file. If the questions are built by code or written as HTML, export them to JSON or CSV (columns: question, a, b, c, d, answer, image, explanation, category).');
  }
  return candidates;
}

// ---------- import from a link ----------
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const s = ip.toLowerCase();
  if (s.startsWith('::ffff:')) return isPrivateIp(s.slice(7));
  return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80');
}

async function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { throw new HttpError(400, 'bad_url', 'That is not a valid link.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'bad_url', 'Only http and https links work.');
  // GitHub "blob" pages are HTML views; the raw file is what we want.
  const gh = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(u.pathname);
  if (u.hostname === 'github.com' && gh) u = new URL(`https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`);
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new HttpError(400, 'bad_url', 'That website could not be found.');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new HttpError(400, 'bad_url', 'Links to private or local addresses are not allowed.');
  return u;
}

async function fetchSource(raw) {
  let u = await checkUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    let res;
    try {
      res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'ProvisoireYanjye-Importer' } });
    } catch (e) {
      throw new HttpError(502, 'fetch_failed', 'Could not download that link.');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      u = await checkUrl(new URL(res.headers.get('location'), u).href);
      continue;
    }
    if (!res.ok) throw new HttpError(502, 'fetch_failed', `The link answered with error ${res.status}.`);
    if (Number(res.headers.get('content-length') || 0) > MAX_SOURCE) throw new HttpError(413, 'too_large', 'The file is larger than 30 MB.');
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_SOURCE) { reader.cancel(); throw new HttpError(413, 'too_large', 'The file is larger than 30 MB.'); }
      chunks.push(value);
    }
    return { content: Buffer.concat(chunks).toString('utf8'), baseUrl: u.href, filename: u.pathname };
  }
  throw new HttpError(502, 'fetch_failed', 'Too many redirects.');
}

module.exports = { parseSource, fetchSource, parseCsv };
