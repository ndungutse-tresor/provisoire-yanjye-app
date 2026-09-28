'use strict';
// Reads questions out of an existing app file (.html/.js), a .json file or a .csv sheet.
// Several files can be read together, e.g. questions.json plus images.json, where the
// questions name their pictures ("i5") and the second file maps names to pictures.
// Nothing in the files is executed: data is found by parsing literals only.
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
    'igisubizo', 'igisubizocyukuri', 'reponse', 'bonnereponse', 'answerindex', 'correctans', 'correctchoice', 'a'],
  image: ['image', 'img', 'imageurl', 'imagesrc', 'sign', 'signimage', 'icon', 'src', 'picture', 'photo', 'pic', 'ifoto', 'file', 'url',
    'images', 'imgs', 'il', 'imagelist', 'pictures', 'photos', 'signs'],
  explanation: ['explanation', 'explain', 'reason', 'hint', 'note', 'notes', 'ibisobanuro', 'details', 'why', 'explication', 'commentaire'],
  category: ['category', 'cat', 'section', 'type', 'topic', 'group', 'chapter', 'icyiciro', 'categorie', 'theme']
};
const OPT_TEXT = ['text', 'label', 'value', 't', 'option', 'answer', 'content', 'title', 'choice'];
const OPT_FLAG = ['correct', 'iscorrect', 'right', 'isright', 'valid', 'istrue', 'c'];
const OPT_IMAGE = ['g', 'img', 'image', 'imageurl', 'src', 'picture', 'pic', 'icon', 'sign'];
// Answers that are pictures become "Sign A", "Sign B"... under one combined picture.
const SIGN_WORD = { rw: 'Icyapa', en: 'Sign', fr: 'Panneau' };
const LETTERS = 'ABCDEFGH';

// ---------- picture dictionaries ----------
const isImageRef = (v) => typeof v === 'string' &&
  (/^data:image\//i.test(v) || /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(v.trim()));

// Finds objects like { i0: "data:image/...", i1: "..." } and adds them to `out`.
function findImageMaps(v, out, depth = 0) {
  if (depth > 6 || v === null || typeof v !== 'object') return;
  if (Array.isArray(v)) { for (const x of v) findImageMaps(x, out, depth + 1); return; }
  const entries = Object.entries(v);
  const pics = entries.filter(([, x]) => isImageRef(x));
  if (entries.length >= 2 && pics.length >= entries.length * 0.8) {
    for (const [k, x] of pics) out.set(k, x.trim());
    return;
  }
  for (const [, x] of entries) findImageMaps(x, out, depth + 1);
}

// Several pictures (a sign in two parts, or four answer signs) become one SVG picture.
// Only pictures stored inside the file (data:) can be combined; linked ones can't load inside an SVG.
function combineImages(items) {
  const CELL = 200, PAD = 12, LABEL = items.some((x) => x.label) ? 36 : 0;
  const cols = items.length <= 2 ? items.length : items.length <= 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);
  const w = cols * CELL + (cols + 1) * PAD, h = rows * (CELL + LABEL) + (rows + 1) * PAD;
  const attr = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let body = '';
  items.forEach((it, i) => {
    const x = PAD + (i % cols) * (CELL + PAD), y = PAD + Math.floor(i / cols) * (CELL + LABEL + PAD);
    body += `<image x="${x}" y="${y}" width="${CELL}" height="${CELL}" preserveAspectRatio="xMidYMid meet" href="${attr(it.src)}"/>`;
    if (it.label) {
      body += `<text x="${x + CELL / 2}" y="${y + CELL + 28}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" fill="#111">${attr(it.label)}</text>`;
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

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

function tryLiteral(src, start, name, groups, images) {
  try {
    const { value, end } = parseLiteral(src, start);
    if (value && typeof value === 'object') {
      collect(value, name, groups, '', 0);
      findImageMaps(value, images);
      return end;
    }
  } catch (e) { /* not a plain literal */ }
  return -1;
}

function scanScript(src, groups, images, prefix) {
  const t = src.trimStart();
  if (t[0] === '[' || t[0] === '{') tryLiteral(src, src.length - t.length, prefix + 'data', groups, images);
  const re = /(?:[=:(,]|\breturn)\s*(?=[[{])/g;
  let m, tries = 0;
  while ((m = re.exec(src)) && tries++ < 50000) {
    const before = src.slice(Math.max(0, m.index - 80), m.index + 1);
    const nm = /([A-Za-z_$][\w$.]*)\s*[=:]\s*$/.exec(before);
    const end = tryLiteral(src, m.index + m[0].length, prefix + (nm ? nm[1] : 'data'), groups, images);
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
    map[f] = byName(NAMES[f], all, (e) => e.str + (f === 'image' ? e.arr : 0) >= 1);
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
  if (typeof v === 'string' || typeof v === 'number') return { text: cleanText(v), correct: false, image: '' };
  if (!isObj(v)) return { text: '', correct: false, image: '' };
  let text = '', correct = false, image = '';
  for (const k of Object.keys(v)) {
    const x = v[k];
    if (!text && OPT_TEXT.includes(nk(k)) && (typeof x === 'string' || typeof x === 'number')) text = cleanText(x);
    if (OPT_FLAG.includes(nk(k)) && (x === true || x === 1 || x === 'true')) correct = true;
    if (!image && OPT_IMAGE.includes(nk(k)) && typeof x === 'string' && x.trim()) image = x.trim();
  }
  return { text, correct, image };
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
  if (map.image) parts.push(`picture ← "${map.image}"`);
  if (map.explanation) parts.push(`explanation ← "${map.explanation}"`);
  if (map.category) parts.push(`category ← "${map.category}"`);
  return parts.join(' · ');
}

function buildCandidate(group, lang, baseUrl, images) {
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
  let relImages = 0, httpImages = 0, namedImages = 0, unmerged = 0, combined = 0;
  const skip = (why) => { reasons[why] = (reasons[why] || 0) + 1; };

  // A picture reference becomes a usable picture: a name from a pictures file, a data:/https: link,
  // or a path next to the linked app. Returns '' when it can't be found.
  const picture = (ref) => {
    const image = String(ref).trim();
    if (images.has(image)) return images.get(image);
    if (/^(data:|https?:)/i.test(image)) return image;
    if (!/[./]/.test(image)) { namedImages++; return ''; }   // a name like "i5", but no pictures file
    if (baseUrl) {
      try { return new URL(image, baseUrl).href; } catch (e) { return ''; }
    }
    relImages++;
    return '';
  };

  group.items.forEach(({ o, label }) => {
    const opts = rawOptions(o);
    const answer = resolveAnswer(map.answer ? o[map.answer] : null, opts, oneBased, map.optionKeys);
    const refs = map.image ? [].concat(o[map.image]).filter((x) => typeof x === 'string' && x.trim()) : [];
    const pics = refs.map(picture).filter(Boolean).map((src) => ({ src, label: '' }));
    // Answers given as pictures: label them A, B, C... and show them together with the question.
    const pictureAnswers = opts.some((x) => !x.text && x.image);
    const optionTexts = opts.map((x, i) => {
      if (!pictureAnswers || !x.image) return x.text;
      const src = picture(x.image);
      if (src) pics.push({ src, label: LETTERS[i] });
      return x.text || `${SIGN_WORD[lang] || 'Sign'} ${LETTERS[i]}`;
    });
    let image = '';
    if (pics.length === 1 && !pics[0].label) image = pics[0].src;
    else if (pics.length && pics.every((p) => /^data:image\//i.test(p.src))) { image = combineImages(pics); combined++; }
    else if (pics.length) { image = pics[0].src; unmerged++; }
    if (/^http:/i.test(image)) httpImages++;
    const ex = map.explanation && o[map.explanation] != null ? cleanText(o[map.explanation]) : '';
    const cat = map.category && typeof o[map.category] === 'string' ? o[map.category].trim() : label;
    try {
      questions.push(validateQuestion({
        category: cat.slice(0, 40),
        image: image || null,
        text: { [lang]: cleanText(o[map.text] == null ? '' : o[map.text]) },
        options: { [lang]: optionTexts },
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
  if (namedImages) warnings.push(`${namedImages} picture(s) are named (e.g. "i5") but the pictures file was not loaded, so they were left out. Choose the questions file and the pictures file (e.g. images.json) together.`);
  if (combined) warnings.push(`${combined} question(s) with several pictures, or with pictures as answers, now show them as one combined picture (answers labelled A, B, C...).`);
  if (unmerged) warnings.push(`${unmerged} question(s) have several linked pictures; only the first is kept.`);
  if (relImages) warnings.push(`${relImages} image(s) point to files next to the original app (e.g. "img/sign.png") and were left out. Import from a link to that app, or add the pictures in the Questions tab.`);
  if (httpImages) warnings.push(`${httpImages} image(s) use http:// links, which phones may block. Use https:// links.`);

  const pictures = questions.filter((q) => q.image).length;
  return { path: group.path, found: objs.length, pictures, mapping: describe(map, oneBased), warnings, questions };
}

function parseSource({ content, filename, files, lang, baseUrl }) {
  const list = Array.isArray(files) ? files : [{ content, filename }];
  if (!list.length || list.length > 10) throw new HttpError(400, 'bad_files', 'Choose 1 to 10 files.');
  let total = 0;
  for (const f of list) {
    if (!f || typeof f.content !== 'string') throw new HttpError(400, 'empty', 'A file could not be read.');
    total += f.content.length;
  }
  if (total > MAX_SOURCE) throw new HttpError(413, 'too_large', 'The files are larger than 30 MB together.');
  if (!list.some((f) => f.content.trim())) throw new HttpError(400, 'empty', 'The file is empty.');

  const groups = new Map();
  const images = new Map();
  for (const f of list) {
    const text = f.content.replace(/^\uFEFF/, '');
    const trimmed = text.trim();
    if (!trimmed) continue;
    const name = String(f.filename || '');
    // With several files, keep each file's lists apart.
    const prefix = list.length > 1 ? name.replace(/^.*[\\/]/, '') + ':' : '';
    const before = groups.size;

    const looksCsv = /\.(csv|tsv)$/i.test(name) ||
      (!/^[<[{]/.test(trimmed) && /[,;\t]/.test(trimmed.split('\n', 1)[0]) && !/[<>{}]/.test(trimmed.slice(0, 500)));

    if (looksCsv) {
      collect(parseCsv(trimmed), prefix + 'sheet', groups, '', 0);
      continue;
    }
    let json = false;
    if (trimmed[0] === '[' || trimmed[0] === '{') {
      try {
        const value = JSON.parse(trimmed);
        json = true;
        collect(value, prefix + 'data', groups, '', 0);
        findImageMaps(value, images);
      } catch (e) { /* JS, not JSON */ }
    }
    if (!json && groups.size === before) {
      const scripts = [];
      const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
      let m;
      while ((m = re.exec(text))) if (!/\bsrc\s*=/i.test(m[1])) scripts.push(m[2]);
      if (!scripts.length) scripts.push(text);
      for (const sc of scripts) scanScript(sc, groups, images, prefix);
    }
  }

  const candidates = [...groups.values()]
    .map((g) => buildCandidate(g, lang, baseUrl, images))
    .filter((c) => c && c.questions.length)
    .sort((a, b) => b.questions.length - a.questions.length);

  if (!candidates.length) {
    throw new HttpError(422, 'no_questions', images.size && !groups.size
      ? `This looks like a pictures file (${images.size} pictures) with no questions. Choose it together with the questions file.`
      : 'No question list was found in this file. If your app keeps its questions in a separate file (e.g. questions.json), choose that file, together with its pictures file (e.g. images.json). Otherwise export them to JSON or CSV (columns: question, a, b, c, d, answer, image, explanation, category).');
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
