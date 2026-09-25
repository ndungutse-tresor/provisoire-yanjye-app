'use strict';
const { HttpError } = require('./http');

const LANGS = ['rw', 'en', 'fr'];
const MAX_IMAGE = 3 * 1024 * 1024;
const IMAGE_RE = /^(data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+|https?:\/\/[^\s"'<>]+)$/i;

function bad(msg) { return new HttpError(400, 'invalid_question', msg); }

function str(v, max) {
  if (v == null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') throw bad('Text fields must be text.');
  const s = String(v).trim();
  if (s.length > max) throw bad(`Text is too long (max ${max} characters).`);
  return s;
}

// Checks and cleans a question from the admin panel or the importer.
// Shape: { category, image, text: {rw,en,fr}, options: {rw:[...],...}, answer, explanation: {...} }
function validateQuestion(q) {
  if (!q || typeof q !== 'object') throw bad('Question is missing.');
  const text = {}, options = {}, explanation = {};
  let optCount = null;

  for (const lang of LANGS) {
    const t = str(q.text && q.text[lang], 2000);
    const opts = q.options && q.options[lang];
    const hasOpts = Array.isArray(opts) && opts.some((o) => String(o || '').trim());
    if (!t && !hasOpts) continue;
    if (!t) throw bad(`Question text is missing in ${lang}.`);
    if (!hasOpts) throw bad(`Answers are missing in ${lang}.`);
    const clean = opts.map((o) => str(o, 500));
    if (clean.length < 2 || clean.length > 8) throw bad('A question needs 2 to 8 answers.');
    if (clean.some((o) => !o)) throw bad(`An answer is empty in ${lang}.`);
    if (optCount != null && clean.length !== optCount) throw bad('Every language must have the same number of answers.');
    optCount = clean.length;
    text[lang] = t;
    options[lang] = clean;
    const ex = str(q.explanation && q.explanation[lang], 3000);
    if (ex) explanation[lang] = ex;
  }
  if (optCount == null) throw bad('Add the question and its answers in at least one language.');

  const answer = Number(q.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer >= optCount) throw bad('Choose which answer is correct.');

  let image = q.image == null ? null : String(q.image).trim() || null;
  if (image) {
    if (image.length > MAX_IMAGE) throw bad('Image is too large (max 3 MB).');
    if (!IMAGE_RE.test(image)) throw bad('Image must be an uploaded picture or an https:// link.');
  }

  return { category: str(q.category, 40), image, text, options, answer, explanation };
}

module.exports = { LANGS, validateQuestion, IMAGE_RE };
