'use strict';

// Parses a JavaScript literal (array/object/string/number/bool/null) starting at src[start].
// It never runs code: anything that isn't a plain literal (a function call, a variable,
// `${...}` in a template string) throws. Returns { value, end }.
function parseLiteral(src, start) {
  let i = start;
  let depth = 0;

  function fail() { throw new SyntaxError('not a literal at ' + i); }

  function ws() {
    for (;;) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        const e = src.indexOf('*/', i + 2);
        if (e < 0) fail();
        i = e + 2;
        continue;
      }
      return;
    }
  }

  function value() {
    ws();
    const c = src[i];
    if (c === '[') return arr();
    if (c === '{') return obj();
    if (c === '"' || c === "'" || c === '`') return string();
    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) return number();
    const id = ident();
    switch (id) {
      case 'true': return true;
      case 'false': return false;
      case 'null': case 'undefined': return null;
      default: return fail();
    }
  }

  function ident() {
    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 64));
    if (!m) fail();
    i += m[0].length;
    return m[0];
  }

  function number() {
    const m = /^[+-]?(0[xX][\da-fA-F]+|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(src.slice(i, i + 40));
    if (!m) fail();
    i += m[0].length;
    return Number(m[0]);
  }

  function string() {
    const q = src[i++];
    let out = '';
    for (;;) {
      if (i >= src.length) fail();
      const c = src[i++];
      if (c === q) return out;
      if (q === '`' && c === '$' && src[i] === '{') fail();
      if ((c === '\n' || c === '\r') && q !== '`') fail();
      if (c !== '\\') { out += c; continue; }
      const e = src[i++];
      switch (e) {
        case 'n': out += '\n'; break;
        case 't': out += '\t'; break;
        case 'r': out += '\r'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'v': out += '\v'; break;
        case '0': out += '\0'; break;
        case '\r': if (src[i] === '\n') i++; break;
        case '\n': break;
        case 'x': {
          const h = src.slice(i, i + 2);
          if (!/^[\da-fA-F]{2}$/.test(h)) fail();
          out += String.fromCharCode(parseInt(h, 16));
          i += 2;
          break;
        }
        case 'u': {
          let h;
          if (src[i] === '{') {
            const end = src.indexOf('}', i);
            h = src.slice(i + 1, end);
            i = end + 1;
          } else {
            h = src.slice(i, i + 4);
            i += 4;
          }
          if (!/^[\da-fA-F]{1,6}$/.test(h)) fail();
          out += String.fromCodePoint(parseInt(h, 16));
          break;
        }
        default: out += e;
      }
    }
  }

  function arr() {
    if (++depth > 200) fail();
    i++;
    const out = [];
    for (;;) {
      ws();
      if (src[i] === ']') { i++; depth--; return out; }
      if (src[i] === ',') { i++; out.push(null); continue; } // hole
      out.push(value());
      ws();
      if (src[i] === ',') i++;
      else if (src[i] !== ']') fail();
    }
  }

  function obj() {
    if (++depth > 200) fail();
    i++;
    const out = {};
    for (;;) {
      ws();
      if (src[i] === '}') { i++; depth--; return out; }
      const c = src[i];
      let key;
      if (c === '"' || c === "'") key = string();
      else if (c >= '0' && c <= '9') key = String(number());
      else key = ident();
      ws();
      if (src[i] !== ':') fail();
      i++;
      const v = value();
      Object.defineProperty(out, key, { value: v, enumerable: true, writable: true, configurable: true });
      ws();
      if (src[i] === ',') i++;
      else if (src[i] !== '}') fail();
    }
  }

  const v = value();
  return { value: v, end: i };
}

module.exports = { parseLiteral };
