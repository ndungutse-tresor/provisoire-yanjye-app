(function () {
  'use strict';

  // ---------- basics ----------
  var LANGS = ['rw', 'en', 'fr'];
  var LETTERS = 'ABCDEFGH';
  var view = document.getElementById('view');
  var nav = document.getElementById('nav');

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  var lang = store.get('prov.lang', null);
  if (LANGS.indexOf(lang) < 0) {
    var nl = (navigator.language || '').slice(0, 2);
    lang = nl === 'fr' ? 'fr' : nl === 'en' ? 'en' : 'rw';
  }
  document.documentElement.lang = lang;

  function t(key, vars) {
    var s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; }) : s;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8 7h7M8 11h5"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 7.8-1.2"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    chat: '<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.5-4.8A8.5 8.5 0 1 1 20.5 12z"/>',
    download: '<path d="M12 3v12m0 0-5-5m5 5 5-5M5 21h14"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    sign: '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/><path d="M12 8v5M12 16h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
    study: '<path d="M2.5 5.5C5 4 8.5 4 12 6c3.5-2 7-2 9.5-.5V19c-2.5-1.5-6-1.5-9.5.5-3.5-2-7-2-9.5-.5z"/><path d="M12 6v13.5"/>',
    star: '<path d="M12 3.2l2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.4-4.2 6-.9z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'
  };
  // "Provisoire Yanjye": last word highlighted in road-sign yellow.
  function wordmark(name) {
    var parts = String(name).trim().split(/\s+/);
    var last = parts.length > 1 ? parts.pop() : '';
    return '<span class="wordmark">' + esc(parts.join(' ')) + (last ? ' <em>' + esc(last) + '</em>' : '') + '</span>';
  }

  // Road running to the horizon, with a warning sign: decoration behind the home header.
  var HERO_ART = '<svg class="hero-art" viewBox="0 0 240 200" aria-hidden="true">' +
    '<path d="M104 46h32l104 154H0z" fill="#fff" fill-opacity=".07"/>' +
    '<path d="M104 46 0 200M136 46l104 154" stroke="#fff" stroke-opacity=".22" stroke-width="2"/>' +
    '<path d="M120 54v10M120 78v16M120 110v22M120 150v30" stroke="#ffc400" stroke-width="5" stroke-linecap="round"/>' +
    '<rect x="196" y="40" width="4" height="70" fill="#fff" fill-opacity=".35"/>' +
    '<path d="M198 6 222 30 198 54 174 30z" fill="#ffc400"/><path d="M198 15 213 30 198 45 183 30z" fill="none" stroke="#0f1b2d" stroke-width="3"/>' +
    '<path d="M198 23v9M198 37v1" stroke="#0f1b2d" stroke-width="3.5" stroke-linecap="round"/></svg>';

  function icon(name) { return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>'; }

  // ---------- state ----------
  var S = {
    config: null, me: null, payment: null, qs: [], full: false, total: 0, freeCount: 0, loaded: false,
    review: null, examCount: 0, reviews: null
  };
  var progress = store.get('prov.progress', null) || {};
  progress.answers = progress.answers || {};
  progress.pos = progress.pos || {};
  progress.exams = progress.exams || [];
  progress.pendingExams = progress.pendingExams || [];
  function saveProgress() { store.set('prov.progress', progress); }

  var pr = { key: null, list: [], idx: 0, picked: null, done: {} }; // practice session (done: answers given this session)
  var ex = null;                                                  // running or finished exam
  var authMode = 'register';
  var installPrompt = null;
  var study = { key: null, limit: 20, search: '', lang: store.get('prov.studyLang', null) || lang }; // study (read answers) session
  var rateValue = 0;                                              // stars picked in the review form
  var editingReview = false;
  var liveSource = null, liveUid = null;

  // ---------- API ----------
  function api(method, path, body) {
    return fetch(path, {
      method: method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          var e = new Error((data && data.message) || 'error');
          e.code = data && data.error;
          throw e;
        }
        return data;
      });
    });
  }
  function errText(e) {
    if (e instanceof TypeError) return t('error_offline');
    return (e.code && I18N[lang]['err_' + e.code]) ? t('err_' + e.code) : (e.message || t('error_generic'));
  }

  function clearDataCache() {
    return window.caches ? caches.delete('prov-data').catch(function () {}) : Promise.resolve();
  }

  function load() {
    return Promise.all([
      api('GET', '/api/config'), api('GET', '/api/me'), api('GET', '/api/questions'),
      api('GET', '/api/reviews').catch(function () { return S.reviews; })
    ]).then(function (r) {
      S.config = r[0];
      S.me = r[1].user;
      S.payment = r[1].payment;
      S.review = r[1].review || null;
      S.examCount = r[1].examCount || 0;
      S.qs = r[2].questions;
      S.full = r[2].full;
      S.total = r[2].total;
      S.freeCount = r[2].freeCount;
      S.reviews = r[3];
      S.usage = r[1].usage || null;
      S.trialDone = !!(r[2].trialDone || (r[1].user && r[1].user.trialDone));
      S.lastExam = r[1].lastExam || null;
      S.loaded = true;
      pr.key = null;
      study.key = null;
      document.title = S.config.appName;
      connectLive();
      flushExams();
      syncUsage();
    });
  }

  // Live channel: the server tells this phone the moment its payment is approved.
  function connectLive() {
    var uid = S.me ? S.me.id : null;
    if (uid === liveUid) return;
    if (liveSource) { liveSource.close(); liveSource = null; }
    liveUid = uid;
    if (!uid || !window.EventSource) return;
    liveSource = new EventSource('/api/events');
    liveSource.addEventListener('account', function (e) {
      var d = {};
      try { d = JSON.parse(e.data); } catch (err) { /* empty event */ }
      var wasFull = S.full;
      reload().then(function () {
        if (!wasFull && S.full) toast(t('unlocked_now'));
        else if (d.rejected) toast(t('payment_rejected_live'));
        render();
      }).catch(function () {});
    });
  }

  // ---------- daily limits (set by the admin; 0 = none) ----------
  // Days follow Rwanda time, like the server.
  function rwDay() { return new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10); }
  function limits() { return (S.config && S.config.limits) || { questions: 0, exams: 0 }; }
  function seenToday() {
    var d = rwDay();
    if (!progress.seen || progress.seen.day !== d) progress.seen = { day: d, ids: [], sync: [] };
    return progress.seen;
  }
  function questionsUsed() {
    var server = S.usage && S.usage.day === rwDay() ? S.usage.questions : 0;
    return Math.max(server, seenToday().ids.length);
  }
  // Questions already opened today stay open; new ones only while under the limit.
  function canOpen(q) {
    var lim = limits().questions;
    if (!lim || !S.me) return true;
    return seenToday().ids.indexOf(q.id) >= 0 || questionsUsed() < lim;
  }
  var usageTimer;
  function markSeen(ids) {
    if (!S.me) return;
    var s = seenToday(), added = false;
    ids.forEach(function (id) {
      if (s.ids.indexOf(id) < 0) { s.ids.push(id); s.sync.push(id); added = true; }
    });
    if (!added) return;
    saveProgress();
    clearTimeout(usageTimer);
    usageTimer = setTimeout(syncUsage, 800);
  }
  function syncUsage() {
    var s = seenToday();
    if (!s.sync.length || !navigator.onLine) return;
    var batch = s.sync.slice();
    api('POST', '/api/usage', { seen: batch }).then(function (u) {
      S.usage = u;
      s.sync = s.sync.filter(function (id) { return batch.indexOf(id) < 0; });
      saveProgress();
    }).catch(function () {});
  }
  function examsUsed() {
    var server = S.usage && S.usage.day === rwDay() ? S.usage.exams : 0;
    var local = progress.examDay === rwDay() ? progress.examStarts || 0 : 0;
    return Math.max(server, local);
  }
  function limitCard(kind) {
    var n = kind === 'e' ? limits().exams : limits().questions;
    return '<div class="card state-card"><div class="state-icon bi-blue">' + icon('clock') + '</div><h2>' + esc(t('daily_limit_title')) + '</h2>' +
      '<p class="muted">' + esc(t(kind === 'e' ? 'daily_limit_e' : 'daily_limit_q', { n: n })) + '</p>' +
      '<a class="btn btn-ghost btn-block" href="#/">' + esc(t('back_home')) + '</a></div>';
  }
  function usageLine() {
    var L = limits();
    if (!S.me || (!L.questions && !L.exams)) return '';
    return '<p class="usage-line">' + icon('clock') + esc(t('today_usage', {
      q: questionsUsed(), ql: L.questions || '∞', e: examsUsed(), el: L.exams || '∞'
    })) + '</p>';
  }

  // Exam results finished offline are sent when the connection is back.
  function flushExams() {
    if (!S.me || !progress.pendingExams.length || !navigator.onLine) return;
    var list = progress.pendingExams.splice(0);
    saveProgress();
    list.forEach(function (x) {
      api('POST', '/api/exams', x).then(function () { S.examCount++; }).catch(function (e) {
        if (e instanceof TypeError) { progress.pendingExams.push(x); saveProgress(); }
      });
    });
  }

  function reload() { return clearDataCache().then(load); }

  // ---------- helpers ----------
  function money(n) { return Number(n).toLocaleString('en-US') + ' ' + (S.config ? S.config.currency : 'RWF'); }
  function priceText() { return money(S.config.price); }
  function pickLang(q) {
    if (q.text[lang]) return lang;
    for (var i = 0; i < LANGS.length; i++) if (q.text[LANGS[i]]) return LANGS[i];
    return Object.keys(q.text)[0];
  }
  function qText(q) { return q.text[pickLang(q)]; }
  function qOpts(q) { return q.options[pickLang(q)]; }
  function qExpl(q) { var e = q.explanation || {}; return e[pickLang(q)] || ''; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  // 0784243475 -> 0784 243 475
  function phoneFmt(p) {
    var d = String(p).replace(/\D/g, '');
    return d.length === 10 ? d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7) : String(p);
  }
  function fmtTime(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function waLink(text) {
    var d = String(S.config.whatsapp || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10 && d[0] === '0') d = '250' + d.slice(1);
    else if (d.length === 9) d = '250' + d;
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text);
  }
  function stats() {
    var ids = Object.keys(progress.answers), ok = 0;
    ids.forEach(function (id) { if (progress.answers[id].ok) ok++; });
    return { answered: ids.length, ok: ok };
  }
  function mistakeIds() {
    return Object.keys(progress.answers).filter(function (id) { return !progress.answers[id].ok; });
  }

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2800);
  }

  function setBars() {
    view.querySelectorAll('[data-w]').forEach(function (el) { el.style.width = el.getAttribute('data-w') + '%'; });
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function copy(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(t('copied')); });
  }

  // ---------- nav ----------
  function renderNav(section) {
    var items = [['', 'home', 'nav_home'], ['study', 'study', 'nav_study'], ['practice', 'book', 'nav_practice'], ['exam', 'timer', 'nav_exam'], ['account', 'user', 'nav_account']];
    nav.innerHTML = items.map(function (it) {
      var cur = it[0] === section || (section === 'unlock' && it[0] === 'account');
      return '<a href="#/' + it[0] + '"' + (cur ? ' aria-current="page"' : '') + '>' + icon(it[1]) + '<span>' + esc(t(it[2])) + '</span></a>';
    }).join('');
  }

  function langSwitch(extraClass) {
    return '<div class="seg ' + (extraClass || '') + '" role="group" aria-label="' + esc(t('language')) + '">' +
      LANGS.map(function (l) {
        return '<button type="button" data-action="lang" data-lang="' + l + '" aria-pressed="' + (l === lang) + '">' + l.toUpperCase() + '</button>';
      }).join('') + '</div>';
  }

  function topbar(title, backHash, right) {
    return '<div class="topbar"><a class="icon-btn" href="' + (backHash || '#/') + '" aria-label="Back">' + icon('back') + '</a>' +
      '<div class="title">' + esc(title) + '</div>' + (right || '') + '</div>';
  }

  // ---------- HOME ----------
  function viewHome() {
    var st = stats();
    var avail = S.full ? S.total : S.qs.length;
    var pct = avail ? Math.round(Math.min(st.answered, avail) / avail * 100) : 0;
    var okPct = st.answered ? Math.round(st.ok / st.answered * 100) : 0;
    var pos = progress.pos.all || 0;
    var mist = mistakeIds().length;
    var cfg = S.config;
    var h = '';

    var fresh = !S.me;
    h += '<header class="hero' + (fresh ? ' hero-guest' : '') + '">' + HERO_ART +
      '<div class="hero-top"><div class="brand"><img src="icons/icon.svg" alt="">' + wordmark(cfg.appName) + '</div>' + langSwitch() + '</div>';
    if (fresh) {
      // First visit: sell the app.
      h += '<h1>' + esc(t('hero_guest')) + '</h1><p>' + esc(t('hero_guest_sub')) + '</p>' +
        '<div class="pills"><span class="pill">' + icon('book') + esc(t('pill_questions', { n: S.total })) + '</span>' +
        '<span class="pill">' + icon('timer') + esc(t('pill_exam')) + '</span>' +
        '<span class="pill">' + icon('check') + esc(t('pill_offline')) + '</span></div>' +
        '<a class="btn btn-accent hero-cta" href="#/practice">' + esc(t('start_free')) + icon('chev') + '</a></header>';
    } else {
      h += '<h1>' + esc(S.me ? t('hello', { name: S.me.name.split(' ')[0] }) : t('welcome')) + '</h1><p>' + esc(t('tagline')) + '</p>';
      h += '<div class="progress-card"><div class="ring-wrap"><svg class="ring" viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="27"/>' +
        '<circle class="fill" cx="32" cy="32" r="27" pathLength="100" stroke-dasharray="' + pct + ' 100"/></svg><b>' + pct + '%</b></div>' +
        '<div><div class="title">' + esc(t('progress_title')) + '</div><div class="sub">' + esc(t('answered_of', { n: Math.min(st.answered, avail), total: avail })) +
        (st.answered ? ' · ' + esc(t('correct_rate', { p: okPct })) : '') + '</div></div></div></header>';
    }

    if (!S.total) return h + '<div class="empty">' + esc(t('no_questions')) + '</div>';

    if (S.full) {
      h += '<div class="card path-card"><h3>' + esc(t('path_title')) + '</h3><div class="paths">' +
        '<a class="path" href="#/study">' + icon('study') + '<b>' + esc(t('path_study')) + '</b><span>' + esc(t('path_study_d')) + '</span></a>' +
        '<a class="path" href="#/exam">' + icon('timer') + '<b>' + esc(t('path_exam')) + '</b><span>' + esc(t('path_exam_d')) + '</span></a></div></div><div class="gap"></div>';
    } else if (S.trialDone) {
      return h + trialOverCard() + reviewsBlock(3);
    } else {
      // Free trial, spelled out: what it contains, the 3 steps, and what payment adds.
      h += '<div class="card trial-card"><h3>' + esc(t('trial_path_title', { n: S.qs.length })) + '</h3><ol class="trial-steps">' +
        '<li><a href="#/study">' + icon('study') + '<span>' + esc(t('trial_step1')) + '</span></a></li>' +
        '<li><a href="#/practice">' + icon('book') + '<span>' + esc(t('trial_step2')) + '</span></a></li>' +
        '<li><a href="#/exam">' + icon('timer') + '<span>' + esc(t('trial_step3')) + '</span></a></li>' +
        '<li class="locked"><a href="#/unlock">' + icon('lock') + '<span>' + esc(t('locked')) + '</span></a></li></ol>' +
        '<p class="small muted">' + esc(t('trial_path_note')) + '</p></div><div class="gap"></div>';
    }

    h += usageLine();
    h += '<div class="tiles">';
    if (!S.me) {
      h += '<a class="tile tile-guide" href="#/guide"><div class="badge-icon bi-yellow">' + icon('study') + '</div><div class="grow"><div class="t">' + esc(t('guide_title')) + '</div>' +
        '<div class="d">' + esc(t('why_title')) + '</div></div><span class="chev">' + icon('chev') + '</span></a>';
    }
    h += '<a class="tile" href="#/study"><div class="badge-icon bi-green">' + icon('study') + '</div><div class="grow"><div class="t">' + esc(t('study')) + '</div>' +
      '<div class="d">' + esc(t('study_desc')) + '</div></div><span class="chev">' + icon('chev') + '</span></a>';
    h += '<a class="tile" href="#/practice"><div class="badge-icon bi-blue">' + icon('book') + '</div><div class="grow"><div class="t">' + esc(t('practice')) + '</div>' +
      '<div class="d">' + esc(pos > 0 && pos < avail ? t('continue_at', { n: pos + 1 }) : t('practice_desc')) + '</div></div><span class="chev">' + icon('chev') + '</span></a>';
    h += '<a class="tile" href="#/exam"><div class="badge-icon bi-yellow">' + icon('timer') + '</div><div class="grow"><div class="t">' + esc(t('exam')) +
      (S.full ? '' : ' <span class="badge badge-lock">' + esc(t('trial_badge')) + '</span>') + '</div>' +
      '<div class="d">' + esc(t('exam_desc', { count: cfg.exam.count, minutes: cfg.exam.minutes })) + '</div></div><span class="chev">' + icon('chev') + '</span></a>';
    if (mist) {
      h += '<a class="tile" href="#/practice?mode=mistakes"><div class="badge-icon bi-red">' + icon('alert') + '</div><div class="grow"><div class="t">' + esc(t('mistakes')) + '</div>' +
        '<div class="d">' + esc(t('mistakes_desc', { n: mist })) + '</div></div><span class="chev">' + icon('chev') + '</span></a>';
    }
    if (!S.full) {
      h += '<a class="unlock-banner" href="#/unlock">' + icon('unlock') + '<div class="grow"><div class="t">' + esc(t('unlock_cta', { price: priceText() })) + '</div>' +
        '<div class="d">' + esc(t('unlock_teaser', { free: S.freeCount, total: S.total })) + '</div></div>' + icon('chev') + '</a>';
    }
    h += '</div>';

    // Topics (Ibyapa, Amategeko...) separately: a paid feature. Free learners see them locked.
    if (cfg.categories.length > 1) {
      h += '<div class="section-title">' + esc(S.full ? t('categories') : t('topics_locked')) + '</div><div class="chips">';
      cfg.categories.forEach(function (c) {
        h += S.full
          ? '<a class="chip" href="#/study?cat=' + encodeURIComponent(c.name) + '">' + icon('sign') + esc(c.name) + ' <span>' + c.count + '</span></a>'
          : '<a class="chip chip-locked" href="#/unlock">' + icon('lock') + esc(c.name) + ' <span>' + c.count + '</span></a>';
      });
      h += '</div>';
    }

    h += reviewsBlock(3);

    if (progress.exams.length) {
      h += '<div class="section-title">' + esc(t('recent_exams')) + '</div><div class="history">';
      progress.exams.slice(0, 5).forEach(function (e) {
        h += '<div class="h"><span>' + esc(e.d) + '</span><b>' + e.s + '/' + e.t + '</b><span class="badge ' + (e.p ? 'badge-ok' : 'badge-free') + '">' +
          esc(e.p ? t('passed') : t('failed')) + '</span></div>';
      });
      h += '</div>';
    }

    if (installPrompt) {
      h += '<div class="gap"></div><button class="btn btn-outline btn-block" data-action="install">' + icon('download') + esc(t('install')) + '</button>';
    }
    return h;
  }

  // ---------- REVIEWS ----------
  function starsShow(n) {
    var h = '<span class="stars-show" aria-label="' + n + '/5">';
    for (var i = 1; i <= 5; i++) h += '<span class="' + (i <= Math.round(n) ? 'on' : '') + '">' + icon('star') + '</span>';
    return h + '</span>';
  }

  // Shown once there are a few real reviews; never padded with made-up ones.
  function reviewsBlock(max) {
    var R = S.reviews;
    if (!R || R.count < 3) return '';
    var h = '<div class="section-title">' + esc(t('reviews_title')) + '</div><div class="card"><div class="rating-head">' +
      '<b class="avg">' + R.average.toFixed(1) + '</b><div>' + starsShow(R.average) + '<div class="muted small">' + esc(t('reviews_count', { n: R.count })) + '</div></div></div>';
    R.recent.slice(0, max).forEach(function (r) {
      h += '<div class="review"><div class="row"><b class="grow">' + esc(r.name) + (r.verified ? ' <span class="badge badge-ok">' + icon('check') + esc(t('verified')) + '</span>' : '') + '</b>' +
        starsShow(r.rating) + '</div><p>' + esc(r.comment) + '</p><div class="muted small">' + esc(r.date) + '</div></div>';
    });
    return h + '</div>';
  }

  function reviewForm(context, passed) {
    rateValue = S.review ? S.review.rating : 0;
    var title = context === 'exam' && passed ? t('rate_passed_title') : t('rate_title');
    var sub = context === 'exam' && passed ? t('rate_passed_sub') : t('rate_sub');
    var h = '<form class="card review-card" data-form="review" data-context="' + context + '" novalidate><h3>' + esc(title) + '</h3>' +
      '<p class="muted small">' + esc(sub) + '</p><div class="stars" role="radiogroup" aria-label="' + esc(t('rate_pick')) + '">';
    for (var i = 1; i <= 5; i++) {
      h += '<button type="button" role="radio" aria-checked="' + (i === rateValue) + '" aria-label="' + i + '/5" data-action="star" data-v="' + i + '" class="' + (i <= rateValue ? 'on' : '') + '">' + icon('star') + '</button>';
    }
    h += '</div><label class="field"><span class="sr">' + esc(t('rate_comment')) + '</span><textarea class="input" name="comment" maxlength="500" rows="3" placeholder="' +
      esc(t('rate_comment')) + '">' + esc(S.review && S.review.comment || '') + '</textarea></label><div class="form-error" hidden></div>' +
      '<div class="row"><button class="btn btn-primary grow" type="submit">' + icon('star') + esc(t('rate_send')) + '</button>' +
      (context === 'exam' ? '<button class="btn btn-ghost" type="button" data-action="rate-later">' + esc(t('rate_later')) + '</button>' : '') + '</div></form>';
    return h;
  }

  // ---------- STUDY (read every question with its answer) ----------
  function studyList(params) {
    var mode = params.get('mode'), cat = params.get('cat');
    if (mode === 'mistakes') {
      var ids = mistakeIds();
      return { key: 'm', title: t('mistakes'), list: S.qs.filter(function (q) { return ids.indexOf(String(q.id)) >= 0; }) };
    }
    if (cat) return { key: 'c:' + cat, title: cat, list: S.qs.filter(function (q) { return q.category === cat; }) };
    return { key: 'all', title: t('study'), list: S.qs };
  }

  function viewStudy(params) {
    var sel = studyList(params);
    if (study.key !== sel.key) { study.key = sel.key; study.limit = 20; study.search = ''; }
    study.sel = sel;
    var h = topbar(sel.title, '#/', '<span class="counter">' + esc(t('study_count', { n: sel.list.length })) + '</span>');
    h += '<label class="searchbox">' + icon('search') + '<input class="input" type="search" data-bind="study-search" placeholder="' +
      esc(t('study_search')) + '" value="' + esc(study.search) + '"></label>' + studyLangSwitch();
    if (S.full && S.config.categories.length > 1 && sel.key !== 'm') {
      h += '<div class="chips scroll"><a class="chip' + (sel.key === 'all' ? ' on' : '') + '" href="#/study">' + esc(t('all_questions')) + '</a>' +
        S.config.categories.map(function (c) {
          return '<a class="chip' + (sel.key === 'c:' + c.name ? ' on' : '') + '" href="#/study?cat=' + encodeURIComponent(c.name) + '">' + esc(c.name) + '</a>';
        }).join('') + '</div>';
    }
    return h + '<div id="study-list">' + studyItems() + '</div>';
  }

  // Which languages to show on the Study page: one of LANGS, or 'all' for every translation side by side.
  function studyLangSwitch() {
    return '<div class="seg on-surface study-langs" role="group" aria-label="' + esc(t('language')) + '">' +
      LANGS.concat(['all']).map(function (l) {
        return '<button type="button" data-action="study-lang" data-l="' + l + '" aria-pressed="' + (study.lang === l) + '">' +
          (l === 'all' ? esc(t('study_all_langs')) : l.toUpperCase()) + '</button>';
      }).join('') + '</div>';
  }

  // One language version of a question: text, answers (correct one marked) and explanation.
  function studyBlock(q, L, tagged) {
    var opts = q.options[L] || [], expl = (q.explanation || {})[L] || '';
    var h = '<div class="lang-block">' + (tagged ? '<span class="lang-tag">' + L.toUpperCase() + '</span>' : '') +
      '<div class="q-text">' + esc(q.text[L]) + '</div><ul class="answers">';
    opts.forEach(function (o, i) {
      h += '<li class="' + (i === q.answer ? 'ok' : '') + '"><span class="key">' + LETTERS[i] + '</span><span class="grow">' + esc(o) + '</span>' +
        (i === q.answer ? icon('check') : '') + '</li>';
    });
    return h + '</ul>' + (expl ? '<div class="expl"><b>' + esc(t('explanation')) + ':</b> ' + esc(expl) + '</div>' : '') + '</div>';
  }

  function studyItems() {
    var s = study.search.trim().toLowerCase();
    var list = study.sel.list.filter(function (q) {
      if (!s) return true;
      // search every language, so a word typed in English also finds the Kinyarwanda question
      var hay = LANGS.map(function (l) { return (q.text[l] || '') + ' ' + (q.options[l] || []).join(' '); }).join(' ');
      return hay.toLowerCase().indexOf(s) >= 0;
    });
    var h = '';
    if (!list.length) h += '<div class="card empty">' + esc(study.sel.key === 'm' ? t('mistakes_none') : t('no_questions')) + '</div>';
    // Daily question limit: show questions until today's quota is used up.
    var shown = [], limitHit = false;
    for (var k = 0; k < list.length && shown.length < study.limit; k++) {
      if (!canOpen(list[k])) { limitHit = true; break; }
      shown.push(list[k]);
      markSeen([list[k].id]);
    }
    shown.forEach(function (q) {
      var have = LANGS.filter(function (l) { return q.text[l]; });
      h += '<article class="card study-item"><div class="q-cat">#' + (S.qs.indexOf(q) + 1) + (q.category ? ' · ' + esc(q.category) : '') + '</div>';
      if (q.image) h += '<img class="q-img" src="' + esc(q.image) + '" alt="" loading="lazy">';
      if (study.lang === 'all') {
        have.forEach(function (L) { h += studyBlock(q, L, have.length > 1); });
        var missing = LANGS.filter(function (l) { return !q.text[l]; });
        if (missing.length) {
          h += '<div class="lang-missing">' + esc(t('study_missing', { lang: missing.map(function (l) { return t('lang_' + l); }).join(', ') })) + '</div>';
        }
      } else if (q.text[study.lang]) {
        h += studyBlock(q, study.lang, false);
      } else {
        h += '<div class="lang-missing">' + esc(t('study_missing', { lang: t('lang_' + study.lang) })) + '</div>' + studyBlock(q, have[0], true);
      }
      h += '</article>';
    });
    if (limitHit) h += limitCard('q');
    else if (list.length > study.limit) {
      h += '<button class="btn btn-ghost btn-block" data-action="study-more">' + esc(t('show_more')) + ' (' + (list.length - study.limit) + ')</button>';
    }
    if (!S.full && study.sel.key === 'all' && !s && S.total > S.qs.length && list.length <= study.limit) {
      h += '<div class="card state-card"><div class="state-icon bi-yellow">' + icon('lock') + '</div><p>' + esc(t('study_locked', { n: S.total - S.qs.length })) + '</p>' +
        '<a class="btn btn-accent btn-block" href="#/unlock">' + icon('unlock') + esc(t('unlock_cta', { price: priceText() })) + '</a></div>';
    }
    return h;
  }

  // ---------- PRACTICE ----------
  function practiceList(params) {
    var mode = params.get('mode'), cat = params.get('cat');
    if (mode === 'mistakes') {
      var ids = mistakeIds();
      return { key: 'm', title: t('mistakes'), list: S.qs.filter(function (q) { return ids.indexOf(String(q.id)) >= 0; }) };
    }
    if (cat) return { key: 'c:' + cat, title: cat, list: S.qs.filter(function (q) { return q.category === cat; }) };
    return { key: 'all', title: t('practice'), list: S.qs };
  }

  function viewPractice(params) {
    var sel = practiceList(params);
    if (pr.key !== sel.key) {
      pr.key = sel.key;
      pr.list = sel.list;
      pr.title = sel.title;
      pr.idx = Math.min(progress.pos[sel.key] || 0, sel.list.length);
      if (sel.key === 'm') pr.idx = 0;
      pr.picked = null;
      pr.done = {};
    }
    return practiceHtml();
  }

  function practiceHtml() {
    var list = pr.list;
    var shownTotal = pr.key === 'all' && !S.full ? S.total : list.length;
    var h = topbar(pr.title, '#/', '<span class="counter">' + esc(t('question_n', { n: Math.min(pr.idx + 1, shownTotal), total: shownTotal })) + '</span>');
    h += '<div class="bar"><i data-w="' + (shownTotal ? Math.round(Math.min(pr.idx, shownTotal) / shownTotal * 100) : 0) + '"></i></div>';

    if (!list.length) {
      return h + '<div class="card empty">' + esc(pr.key === 'm' ? t('mistakes_none') : t('no_questions')) + '</div>';
    }

    if (pr.idx >= list.length) {
      if (!S.full) {
        // End of the free practice: next step of the trial is the (one-time) trial exam.
        h += '<div class="card state-card"><div class="state-icon bi-yellow">' + icon('timer') + '</div><h2>' + esc(t('end_free')) + '</h2>' +
          '<p class="muted">' + esc(t('trial_exam_once')) + '</p>' +
          '<a class="btn btn-primary btn-block" href="#/exam">' + icon('timer') + esc(t('practice_to_exam')) + '</a><div class="gap"></div>' +
          '<a class="btn btn-accent btn-block" href="#/unlock">' + icon('unlock') + esc(t('unlock_cta', { price: priceText() })) + '</a></div>';
      } else {
        var ok = list.filter(function (q) { var a = progress.answers[q.id]; return a && a.ok; }).length;
        h += '<div class="card state-card"><div class="state-icon bi-green">' + icon('trophy') + '</div><h2>' + esc(t('end_all')) + '</h2>' +
          '<p class="muted">' + esc(t('end_all_body', { ok: ok, total: list.length })) + '</p>' +
          '<button class="btn btn-primary btn-block" data-action="restart">' + icon('refresh') + esc(t('restart')) + '</button></div>';
      }
      return h;
    }

    var q = list[pr.idx];
    if (!canOpen(q)) return h + limitCard('q');
    markSeen([q.id]);
    var opts = qOpts(q);
    // Answers given in this session stay visible when going back.
    pr.picked = pr.done[q.id] != null ? pr.done[q.id] : null;
    var answered = pr.picked != null;
    h += '<article class="card q-card">';
    if (q.category) h += '<div class="q-cat">' + esc(q.category) + '</div>';
    if (q.image) h += '<img class="q-img" src="' + esc(q.image) + '" alt="">';
    h += '<div class="q-text">' + esc(qText(q)) + '</div><div class="opts">';
    opts.forEach(function (o, i) {
      var cls = '';
      if (answered) cls = i === q.answer ? 'correct' : i === pr.picked ? 'wrong' : 'dim';
      h += '<button class="opt ' + cls + '" data-action="pick" data-i="' + i + '"' + (answered ? ' disabled' : '') + '>' +
        '<span class="key">' + LETTERS[i] + '</span><span>' + esc(o) + '</span></button>';
    });
    h += '</div>';
    if (answered) {
      var right = pr.picked === q.answer;
      var expl = qExpl(q);
      h += '<div class="feedback ' + (right ? 'ok' : 'bad') + '" role="status">' + icon(right ? 'check' : 'x') + '<div class="body">' +
        '<div class="head">' + esc(right ? t('correct') : t('wrong')) + '</div>' +
        (right ? '' : '<div>' + esc(t('right_answer_is', { a: LETTERS[q.answer] + '. ' + opts[q.answer] })) + '</div>') +
        (expl ? '<div class="small"><b>' + esc(t('explanation')) + ':</b> ' + esc(expl) + '</div>' : '') + '</div></div>';
    }
    h += '</article>';
    // "Ibikurikira" only after answering: no skipping.
    h += '<div class="actionbar"><button class="btn btn-ghost" data-action="prev"' + (pr.idx === 0 ? ' disabled' : '') + '>' + icon('back') + esc(t('prev')) + '</button>' +
      '<button class="btn btn-primary" data-action="next"' + (answered ? '' : ' disabled title="' + esc(t('answer_first')) + '"') + '>' + esc(t('next')) + icon('chev') + '</button></div>' +
      (answered ? '' : '<p class="hint-center">' + esc(t('answer_first')) + '</p>');
    return h;
  }

  function practiceMove(d) {
    var q = pr.list[pr.idx];
    if (d > 0 && q && pr.done[q.id] == null) return;
    pr.idx = Math.max(0, Math.min(pr.list.length, pr.idx + d));
    pr.picked = null;
    if (pr.key !== 'm') { progress.pos[pr.key] = pr.idx; saveProgress(); }
    paint(practiceHtml());
    window.scrollTo(0, 0);
  }

  function practicePick(i) {
    if (pr.picked != null) return;
    var q = pr.list[pr.idx];
    if (!q || i >= qOpts(q).length || pr.done[q.id] != null) return;
    pr.picked = i;
    pr.done[q.id] = i;
    progress.answers[q.id] = { c: i, ok: i === q.answer };
    saveProgress();
    paint(practiceHtml());
  }

  // ---------- EXAM ----------
  function examPlan() {
    var c = S.config.exam;
    var n = Math.min(c.count, S.qs.length);
    // Fewer questions than a real exam (e.g. a small free trial): scale the pass mark and the time.
    var pass = n < c.count ? Math.ceil(c.passMark * n / c.count) : c.passMark;
    var minutes = n < c.count ? Math.max(1, Math.round(c.minutes * n / c.count)) : c.minutes;
    return { n: n, pass: pass, minutes: minutes };
  }

  // Shown to learners who haven't paid: the trial exam uses the free questions, once.
  function trialNote() {
    return '<div class="trial-note">' + icon('unlock') + '<div><b>' + esc(t('trial_badge')) + '.</b> ' +
      esc(t('trial_exam_once')) + '</div></div>';
  }

  // Free trial used up: locked (on the server) until payment; results stay saved.
  function trialOverCard() {
    var L = S.lastExam;
    return '<div class="card state-card trial-over"><div class="state-icon bi-yellow">' + icon('lock') + '</div>' +
      '<h2>' + esc(t('trial_over_title')) + '</h2>' +
      (L ? '<p class="score-pill ' + (L.passed ? 'ok' : 'bad') + '">' + esc(t('trial_over_score', { score: L.score, total: L.total })) + '</p>' : '') +
      '<p class="muted">' + esc(t('trial_over_body')) + '</p><ul class="benefits">' +
      [t('benefit_all', { total: S.total }), t('after_pay_signs'), t('after_pay_rules'), t('after_pay_exams')].map(function (x) {
        return '<li>' + icon('check') + '<span>' + esc(x) + '</span></li>';
      }).join('') + '</ul><div class="gap"></div>' +
      '<a class="btn btn-accent btn-block" href="#/unlock">' + icon('unlock') + esc(t('unlock_cta', { price: priceText() })) + '</a></div>';
  }

  function viewExamStart() {
    var p = examPlan();
    var h = topbar(t('exam'), '#/');
    if (!p.n) return h + '<div class="card empty">' + esc(t('no_questions')) + '</div>';
    h += '<div class="card"><div class="state-icon bi-yellow">' + icon('timer') + '</div>' +
      '<h2 class="center">' + esc(t('exam')) + (S.full ? '' : ' <span class="badge badge-lock">' + esc(t('trial_badge')) + '</span>') + '</h2>' +
      (S.full ? '' : trialNote()) +
      '<div class="rules"><div><b>' + p.n + '</b><span>' + esc(t('rule_questions')) + '</span></div>' +
      '<div><b>' + p.minutes + '</b><span>' + esc(t('rule_minutes')) + '</span></div><div><b>' + p.pass + '</b><span>' + esc(t('rule_pass')) + '</span></div></div>' +
      '<p class="muted center">' + esc(t('exam_tip')) + '</p>';
    if (ex && !ex.result) h += '<button class="btn btn-primary btn-block" data-action="resume-exam">' + esc(t('resume_exam')) + '</button><div class="gap"></div>';
    h += '<button class="btn ' + (ex && !ex.result ? 'btn-ghost' : 'btn-primary') + ' btn-block" data-action="start-exam">' + icon('timer') + esc(t('start_exam')) + '</button></div>';
    return h;
  }

  function startExam() {
    if (!S.full && (S.trialDone || !window.confirm(t('trial_exam_confirm')))) return;
    var lim = limits().exams;
    var limitScreen = function () { paint(topbar(t('exam'), '#/') + limitCard('e')); };
    if (S.full && lim && examsUsed() >= lim) return limitScreen();
    // The server counts exams per day; offline, the phone counts until it can sync.
    api('POST', '/api/exams/start', {}).then(function (u) { S.usage = u; beginExam(); }).catch(function (e) {
      if (e instanceof TypeError) return beginExam();
      if (e.code === 'daily_exam_limit') return limitScreen();
      toast(errText(e));
    });
  }

  // Furthest question reachable: the first unanswered one.
  function examReach() {
    for (var i = 0; i < ex.ans.length; i++) if (ex.ans[i] == null) return i;
    return ex.ans.length - 1;
  }

  function beginExam() {
    if (progress.examDay !== rwDay()) { progress.examDay = rwDay(); progress.examStarts = 0; }
    progress.examStarts++;
    saveProgress();
    var p = examPlan();
    ex = {
      qs: shuffle(S.qs.slice()).slice(0, p.n),
      ans: [],
      idx: 0,
      pass: p.pass,
      start: Date.now(),
      endAt: Date.now() + p.minutes * 60000,
      result: null
    };
    for (var i = 0; i < p.n; i++) ex.ans.push(null);
    go('#/exam/run');
  }

  function viewExamRun() {
    var q = ex.qs[ex.idx];
    var left = ex.endAt - Date.now();
    var h = '<div class="topbar"><span class="counter grow">' + esc(t('question_n', { n: ex.idx + 1, total: ex.qs.length })) + '</span>' +
      '<span class="timer' + (left < 60000 ? ' low' : '') + '" id="timer" aria-label="' + esc(t('time_left')) + '">' + icon('clock') + fmtTime(left) + '</span>' +
      '<button class="btn btn-primary btn-sm" data-action="finish-exam">' + esc(t('finish')) + '</button></div>';
    var done = ex.ans.filter(function (a) { return a != null; }).length;
    h += '<div class="bar"><i data-w="' + Math.round(done / ex.qs.length * 100) + '"></i></div>';
    h += '<article class="card q-card">';
    if (q.image) h += '<img class="q-img" src="' + esc(q.image) + '" alt="">';
    h += '<div class="q-text">' + esc(qText(q)) + '</div><div class="opts">';
    qOpts(q).forEach(function (o, i) {
      h += '<button class="opt' + (ex.ans[ex.idx] === i ? ' selected' : '') + '" data-action="exam-pick" data-i="' + i + '">' +
        '<span class="key">' + LETTERS[i] + '</span><span>' + esc(o) + '</span></button>';
    });
    h += '</div></article>';
    h += '<div class="actionbar"><button class="btn btn-ghost" data-action="exam-prev"' + (ex.idx === 0 ? ' disabled' : '') + '>' + icon('back') + esc(t('prev')) + '</button>' +
      (ex.idx < ex.qs.length - 1
        ? '<button class="btn btn-primary" data-action="exam-next"' + (ex.ans[ex.idx] == null ? ' disabled' : '') + '>' + esc(t('next')) + icon('chev') + '</button>'
        : '<button class="btn btn-accent" data-action="finish-exam">' + esc(t('finish')) + icon('check') + '</button>') + '</div>' +
      (ex.ans[ex.idx] == null ? '<p class="hint-center">' + esc(t('answer_first')) + '</p>' : '');
    // Jump back to any answered question, or to the next one to answer, never further ahead.
    var reach = examReach();
    h += '<div class="qgrid">' + ex.qs.map(function (x, i) {
      return '<button data-action="exam-go" data-i="' + i + '" class="' + (ex.ans[i] != null ? 'answered' : '') + (i === ex.idx ? ' current' : '') + '"' +
        (i > reach ? ' disabled' : '') + '>' + (i + 1) + '</button>';
    }).join('') + '</div>';
    return h;
  }

  function finishExam(force) {
    if (!ex || ex.result) return;
    var empty = ex.ans.filter(function (a) { return a == null; }).length;
    if (!force && empty && !window.confirm(t('finish_confirm', { n: empty }))) return;
    var score = 0;
    ex.qs.forEach(function (q, i) {
      var ok = ex.ans[i] === q.answer;
      if (ok) score++;
      if (ex.ans[i] != null) progress.answers[q.id] = { c: ex.ans[i], ok: ok };
    });
    ex.result = { score: score, passed: score >= ex.pass, used: Math.min(Date.now(), ex.endAt) - ex.start };
    progress.exams.unshift({ d: new Date().toISOString().slice(0, 10), s: score, t: ex.qs.length, p: ex.result.passed });
    progress.exams = progress.exams.slice(0, 20);
    saveProgress();
    if (!S.full) {
      // The trial ends now, even offline; the server records it when the result is sent.
      S.trialDone = true;
      S.lastExam = { score: score, total: ex.qs.length, passed: ex.result.passed };
    }
    if (S.me) {
      var rec = { score: score, total: ex.qs.length };
      ex.saved = api('POST', '/api/exams', rec).then(function () { S.examCount++; }).catch(function (e) {
        if (e instanceof TypeError) { progress.pendingExams.push(rec); saveProgress(); }
      });
    }
    go('#/exam/result');
  }

  function viewExamResult() {
    var r = ex.result, n = ex.qs.length;
    var pct = Math.round(r.score / n * 100);
    var h = topbar(t('exam'), '#/');
    h += '<div class="card result-hero"><div class="big-ring"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/>' +
      '<circle class="fill ' + (r.passed ? 'ok' : 'bad') + '" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="' + pct + ' 100"/></svg>' +
      '<div class="score"><b>' + r.score + '</b><span>/ ' + n + '</span></div></div>' +
      '<h1 class="' + (r.passed ? 'ok' : 'bad') + '">' + esc(r.passed ? t('passed') : t('failed')) + '</h1>' +
      '<p class="muted">' + esc(r.passed ? t('passed_body', { score: r.score, total: n }) : t('failed_body', { score: r.score, total: n, pass: ex.pass })) + '</p>' +
      '<p class="small muted">' + esc(t('time_used', { t: fmtTime(r.used) })) + '</p>' +
      '<div class="row">' + (S.full
        ? '<button class="btn btn-primary grow" data-action="start-exam">' + icon('refresh') + esc(t('try_again')) + '</button>'
        : '<a class="btn btn-accent grow" href="#/unlock">' + icon('unlock') + esc(t('unlock_cta', { price: priceText() })) + '</a>') +
      '<a class="btn btn-ghost grow" href="#/">' + esc(t('back_home')) + '</a></div>' +
      (S.full ? '<div class="gap"></div><a class="btn btn-outline btn-block" href="#/study?mode=mistakes">' + icon('study') + esc(t('study_answers')) + '</a>' : '') + '</div>';

    // After a trial exam: this is the moment they see the value, so offer the full version.
    if (!S.full && S.total > S.qs.length) {
      h += '<div class="gap"></div><a class="unlock-banner" href="#/unlock">' + icon('unlock') + '<div class="grow"><div class="t">' +
        esc(t('exam_trial_done')) + '</div><div class="d">' + esc(t('exam_trial_done_d', { total: S.total, price: priceText() })) + '</div></div>' + icon('chev') + '</a>';
    }

    // Ask for a review at a good moment: after a pass, or once they've used the exam a few times.
    if (S.me && !S.review && !ex.reviewDismissed && (r.passed || progress.exams.length >= 2)) {
      h += '<div class="gap"></div>' + reviewForm('exam', r.passed);
    }

    var wrong = [];
    ex.qs.forEach(function (q, i) { if (ex.ans[i] !== q.answer) wrong.push(i); });
    if (wrong.length) {
      h += '<div class="section-title">' + esc(t('review_mistakes')) + ' (' + wrong.length + ')</div><div class="card">';
      wrong.forEach(function (i) {
        var q = ex.qs[i], opts = qOpts(q), a = ex.ans[i];
        h += '<div class="review-item">';
        if (q.image) h += '<img class="q-img" src="' + esc(q.image) + '" alt="">';
        h += '<div class="q">' + (i + 1) + '. ' + esc(qText(q)) + '</div>' +
          '<div class="a bad">' + icon('x') + '<span>' + esc(t('your_answer')) + ': ' + esc(a == null ? t('no_answer') : LETTERS[a] + '. ' + opts[a]) + '</span></div>' +
          '<div class="a ok">' + icon('check') + '<span>' + esc(LETTERS[q.answer] + '. ' + opts[q.answer]) + '</span></div>';
        var e = qExpl(q);
        if (e) h += '<div class="small muted">' + esc(e) + '</div>';
        h += '</div>';
      });
      h += '</div>';
    }
    return h;
  }

  setInterval(function () {
    if (!ex || ex.result) return;
    var left = ex.endAt - Date.now();
    if (left <= 0) { finishExam(true); return; }
    var el = document.getElementById('timer');
    if (el) {
      el.lastChild.textContent = fmtTime(left);
      el.classList.toggle('low', left < 60000);
    }
  }, 1000);

  // ---------- ACCOUNT ----------
  function authHtml(next) {
    var reg = authMode === 'register';
    var h = '<div class="card"><h2>' + esc(reg ? t('register') : t('login')) + '</h2>' +
      '<p class="muted small">' + esc(t('account_why')) + '</p>' +
      '<form data-form="' + (reg ? 'register' : 'login') + '" data-next="' + esc(next || '') + '" novalidate><div class="form-error" hidden></div>';
    if (reg) h += '<label class="field"><span>' + esc(t('name')) + '</span><input class="input" name="name" autocomplete="name" maxlength="60" required></label>';
    h += '<label class="field"><span>' + esc(t('phone')) + (reg ? ' · <b>' + esc(t('one_account')) + '</b>' : '') + '</span>' +
      '<input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07XX XXX XXX" required></label>' +
      '<label class="field"><span>' + esc(t('pin')) + '</span><input class="input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" required></label>';
    if (reg) h += '<label class="field"><span>' + esc(t('pin_again')) + '</span><input class="input" name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required></label>';
    h += '<button class="btn btn-primary btn-block" type="submit">' + esc(reg ? t('register') : t('login')) + '</button></form>' +
      '<div class="center"><button class="linkbtn" data-action="auth-mode">' + esc(reg ? t('have_account') : t('no_account')) + '</button></div>';
    if (S.config.whatsapp) {
      h += '<div class="support-note">' + icon('chat') + '<span>' + esc(reg ? t('support_wa') : t('forgot_pin') + ' ' + t('support_wa')) +
        ' <a href="' + esc(waLink(t('wa_msg', { app: S.config.appName }))) + '" target="_blank" rel="noopener">WhatsApp</a></span></div>';
    }
    return h + '</div>';
  }

  // Guidance for new users: why the app matters, simple guidelines, tips. Shown before sign-up.
  function guideBody() {
    var L = limits();
    var steps = [t('step_g1'), t('step_g2', { n: S.freeCount }), t('step_g3', { price: priceText() }), t('step_g4'), t('step_g5')];
    if (L.questions || L.exams) steps.push(t('step_g6', { q: L.questions || t('no_limit'), e: L.exams || t('no_limit') }));
    var wa = S.config.whatsapp ? ' <a href="' + esc(waLink(t('wa_msg', { app: S.config.appName }))) + '" target="_blank" rel="noopener">WhatsApp</a>' : '';
    return '<h3>' + esc(t('why_title')) + '</h3><ul class="benefits">' +
      ['why1', 'why2', 'why3', 'why4'].map(function (k) { return '<li>' + icon('check') + '<span>' + esc(t(k)) + '</span></li>'; }).join('') + '</ul>' +
      '<h3>' + esc(t('steps_title')) + '</h3><ol class="guide-steps">' +
      steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<h3>' + esc(t('tips_title')) + '</h3><ul class="tips"><li>' + icon('lock') + '<span>' + esc(t('tip1')) + '</span></li>' +
      '<li>' + icon('chat') + '<span>' + esc(t('tip2')) + wa + '</span></li></ul>';
  }
  function guideCard(open) {
    return '<details class="card guide"' + (open ? ' open' : '') + '><summary>' + icon('study') + esc(t('guide_title')) + '</summary>' + guideBody() + '</details>';
  }

  // Study, practice and the trial exam start only after creating an account.
  function viewGate() {
    var n = S.freeCount;
    authMode = authMode || 'register';
    return topbar(t('gate_title'), '#/') +
      '<div class="card gate"><div class="state-icon bi-yellow">' + icon('unlock') + '</div><h2 class="center">' + esc(t('gate_title')) + '</h2>' +
      '<p class="muted">' + esc(t('gate_body', { n: n })) + '</p><ul class="benefits">' +
      ['gate_b1', 'gate_b2', 'gate_b3', 'gate_b4'].map(function (k) { return '<li>' + icon('check') + '<span>' + esc(t(k, { n: n })) + '</span></li>'; }).join('') +
      '</ul></div><div class="gap"></div>' + guideCard(false) + '<div class="gap"></div>' + authHtml(location.hash || '#/practice');
  }

  function viewAccount() {
    var h = topbar(t('account'), '#/');
    if (!S.me) return h + guideCard(authMode === 'register') + '<div class="gap"></div>' + authHtml('');
    h += '<div class="card"><div class="profile"><div class="avatar">' + esc(S.me.name.charAt(0).toUpperCase()) + '</div><div class="grow">' +
      '<h2>' + esc(S.me.name) + '</h2><div class="muted">' + esc(S.me.phone) + '</div></div>' +
      '<span class="badge ' + (S.me.paid ? 'badge-ok' : 'badge-free') + '">' + esc(S.me.paid ? t('full_badge') : t('free_badge')) + '</span></div>' +
      '<div class="support-note">' + icon('phone') + '<span>' + esc(t('change_phone_note')) +
      (S.config.whatsapp ? ' <a href="' + esc(waLink(t('wa_msg', { app: S.config.appName }) + ' ' + S.me.phone)) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
      '</span></div></div>';
    if (!S.me.paid) {
      h += '<div class="gap"></div><a class="unlock-banner" href="#/unlock">' + icon('unlock') + '<div class="grow"><div class="t">' +
        esc(t('unlock_cta', { price: priceText() })) + '</div><div class="d">' + esc(t('unlock_teaser', { free: S.freeCount, total: S.total })) + '</div></div>' + icon('chev') + '</a>';
    }
    h += '<div class="section-title">' + esc(t('my_review')) + '</div>';
    if (S.review && !editingReview) {
      h += '<div class="card"><div class="row"><span class="grow">' + starsShow(S.review.rating) + '</span>' +
        '<button class="btn btn-ghost btn-sm" data-action="edit-review">' + esc(t('edit_review')) + '</button></div>' +
        (S.review.comment ? '<p class="mt">' + esc(S.review.comment) + '</p>' : '') + '</div>';
    } else if (S.examCount > 0 || S.review) {
      h += reviewForm('account');
    } else {
      h += '<p class="card muted small">' + esc(t('review_after_exam')) + '</p>';
    }
    h += '<div class="section-title">' + esc(t('language')) + '</div>' + langSwitch('on-surface');
    h += '<div class="gap"></div><div class="stack">';
    if (S.config.whatsapp) {
      h += '<a class="btn btn-wa btn-block" href="' + esc(waLink(t('wa_msg', { app: S.config.appName }) + ' ' + S.me.phone)) + '" target="_blank" rel="noopener">' + icon('chat') + esc(t('whatsapp_help')) + '</a>';
    }
    h += '<button class="btn btn-danger btn-block" data-action="logout">' + icon('logout') + esc(t('logout')) + '</button></div>';
    return h;
  }

  // ---------- UNLOCK ----------
  // MoMo Pay card: name, then number, then the QR code, as on MoMo Pay stickers.
  // Tapping the QR opens the dialer too: a phone can't scan its own screen.
  function momoCard() {
    var cfg = S.config;
    if (!cfg.momoNumber && !cfg.momoPayCode) return '<div>' + esc(t('pay_step1', { price: priceText(), number: '…' })) + '</div>';
    var dialHref = cfg.momoUssd ? 'tel:' + cfg.momoUssd.replace(/#/g, '%23') : '';
    var qr = cfg.momoQr ? '<img class="qr" src="/api/qr.svg?d=' + encodeURIComponent(cfg.momoQr) + '" alt="QR: ' + esc(cfg.momoUssd || cfg.momoQr) + '" width="200" height="200">' : '';
    return '<div>' + esc(t('pay_momopay', { price: priceText() })) + '</div>' +
      '<div class="momo-card"><span class="momo-badge">MoMo Pay</span>' +
      (cfg.momoName ? '<div class="momo-name">' + esc(cfg.momoName) + '</div>' : '') +
      (cfg.momoNumber ? '<div class="momo-number">' + esc(phoneFmt(cfg.momoNumber)) + '</div>' : '') +
      (qr ? (dialHref ? '<a class="qr-link" href="' + esc(dialHref) + '">' + qr + '</a>' : qr) +
        '<code class="ussd-code">' + esc(cfg.momoUssd || cfg.momoQr) + '</code>' : '') +
      '</div>' +
      '<p class="small muted">' + esc(t('pay_hint', { dial: t('dial'), price: priceText() })) + '</p>' +
      '<div class="row">' +
      (dialHref ? '<a class="btn btn-accent btn-sm grow" href="' + esc(dialHref) + '">' + icon('phone') + esc(t('dial')) + '</a>' : '') +
      (cfg.momoNumber ? '<button class="btn btn-ghost btn-sm grow" data-action="copy" data-text="' + esc(cfg.momoNumber) + '">' + icon('copy') + esc(t('copy_number')) + '</button>' : '') +
      '</div>';
  }

  function viewUnlock() {
    var cfg = S.config;
    var h = topbar(t('unlock_title'), '#/');
    if (S.full) {
      return h + '<div class="card state-card"><div class="state-icon bi-green">' + icon('check') + '</div><h2>' + esc(t('paid_title')) + '</h2>' +
        '<p class="muted">' + esc(t('paid_body')) + '</p><a class="btn btn-primary btn-block" href="#/practice">' + esc(t('practice')) + '</a></div>';
    }

    h += '<div class="card price-card"><div class="price">' + Number(cfg.price).toLocaleString('en-US') + ' <small>' + esc(cfg.currency) + '</small></div>' +
      '<ul class="benefits">' + ['benefit_all', 'benefit_exam', 'benefit_offline', 'benefit_once'].map(function (k) {
        return '<li>' + icon('check') + '<span>' + esc(t(k, { total: S.total })) + '</span></li>';
      }).join('') + '</ul></div>';
    h += reviewsBlock(2);

    if (!S.me) {
      // Show how to pay straight away; the account is only needed to send the Transaction ID.
      return h + '<div class="section-title">' + esc(t('pay_title')) + '</div><div class="card">' + momoCard() + '</div>' +
        '<div class="gap"></div><p class="notice">' + esc(t('need_account_to_pay')) + '</p><div class="gap"></div>' + authHtml('#/unlock');
    }

    var p = S.payment;
    if (p && p.status === 'pending') {
      return h + '<div class="gap"></div><div class="card state-card"><div class="state-icon bi-blue">' + icon('clock') + '</div>' +
        '<h2>' + esc(t('pending_title')) + '</h2><p class="muted">' + esc(t('pending_body', { txid: p.txid })) + '</p>' +
        (window.EventSource ? '<p class="live-note"><span class="live-dot"></span>' + esc(t('live_waiting')) + '</p>' : '') +
        '<button class="btn btn-primary btn-block" data-action="check-payment">' + icon('refresh') + esc(t('check_again')) + '</button>' +
        (cfg.whatsapp ? '<div class="gap"></div><a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="' +
          esc(waLink(t('wa_msg', { app: cfg.appName }) + ' ' + S.me.phone + ' · ' + t('txid') + ': ' + p.txid)) + '">' + icon('chat') + esc(t('whatsapp_help')) + '</a>' : '') +
        '</div>';
    }

    h += '<div class="section-title">' + esc(t('pay_title')) + '</div><div class="card">';
    if (p && p.status === 'rejected') {
      h += '<div class="form-error"><b>' + esc(t('rejected_title')) + '.</b> ' + esc(p.note || t('rejected_body')) + '</div>';
    }
    h += '<ol class="steps"><li><div>' + momoCard();
    h += '</div></li><li><div><div>' + esc(t('pay_step2')) + '</div>' +
      '<form data-form="pay" novalidate><div class="form-error" hidden></div>' +
      '<label class="field"><span class="sr">' + esc(t('txid')) + '</span><input class="input" name="txid" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + esc(t('txid')) + '" required></label>' +
      '<label class="check"><input type="checkbox" name="other"> ' + esc(t('paid_other')) + '</label>' +
      '<label class="field" data-payer hidden><span>' + esc(t('payer_phone')) + '</span><input class="input" name="payer" type="tel" inputmode="tel" placeholder="07XX XXX XXX"></label>' +
      '<button class="btn btn-primary btn-block" type="submit">' + esc(t('submit_payment')) + '</button></form></div></li></ol></div>';
    if (cfg.whatsapp) {
      h += '<div class="gap"></div><a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="' +
        esc(waLink(t('wa_msg', { app: cfg.appName }) + ' ' + S.me.phone)) + '">' + icon('chat') + esc(t('whatsapp_help')) + '</a>';
    }
    return h;
  }

  // ---------- rendering ----------
  function paint(html) {
    view.innerHTML = html;
    setBars();
  }

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var i = h.indexOf('?');
    return { path: i < 0 ? h : h.slice(0, i), params: new URLSearchParams(i < 0 ? '' : h.slice(i + 1)) };
  }

  function render() {
    var r = parseHash();
    var parts = r.path.split('/');
    var section = parts[0];
    renderNav(section);
    if (!S.loaded) return;
    var html;
    var learning = section === 'study' || section === 'practice' || section === 'exam';
    if (!S.me && learning) section = 'gate';
    else if (S.me && !S.full && S.trialDone && learning && !(parts[1] === 'result' && ex && ex.result)) section = 'trialover';
    switch (section) {
      case 'guide': html = topbar(t('guide_title'), '#/') + '<div class="card guide">' + guideBody() + '</div>' +
        (S.me ? '' : '<div class="gap"></div><a class="btn btn-primary btn-block" href="#/account">' + esc(t('register')) + '</a>'); break;
      case 'gate': html = viewGate(); break;
      case 'trialover': html = topbar(t('trial_over_title'), '#/') + trialOverCard(); break;
      case 'study': html = viewStudy(r.params); break;
      case 'practice': html = viewPractice(r.params); break;
      case 'exam':
        if (parts[1] === 'run' && ex && !ex.result) html = viewExamRun();
        else if (parts[1] === 'result' && ex && ex.result) html = viewExamResult();
        else html = viewExamStart();
        break;
      case 'account': html = viewAccount(); break;
      case 'unlock': html = viewUnlock(); break;
      default: html = viewHome();
    }
    paint(html);
    window.scrollTo(0, 0);
  }

  // ---------- events ----------
  var actions = {
    lang: function (el) {
      lang = el.getAttribute('data-lang');
      store.set('prov.lang', lang);
      document.documentElement.lang = lang;
      var keep = pr.key; pr.key = null;
      render();
      pr.key = keep;
    },
    pick: function (el) { practicePick(Number(el.getAttribute('data-i'))); },
    next: function () { practiceMove(1); },
    prev: function () { practiceMove(-1); },
    restart: function () { pr.idx = 0; pr.picked = null; pr.done = {}; progress.pos[pr.key] = 0; saveProgress(); paint(practiceHtml()); },
    'start-exam': startExam,
    'resume-exam': function () { go('#/exam/run'); },
    'exam-pick': function (el) { ex.ans[ex.idx] = Number(el.getAttribute('data-i')); paint(viewExamRun()); },
    'exam-next': function () {
      if (ex.ans[ex.idx] == null) return;
      ex.idx = Math.min(ex.qs.length - 1, ex.idx + 1); paint(viewExamRun()); window.scrollTo(0, 0);
    },
    'exam-prev': function () { ex.idx = Math.max(0, ex.idx - 1); paint(viewExamRun()); window.scrollTo(0, 0); },
    'exam-go': function (el) {
      var i = Number(el.getAttribute('data-i'));
      if (i > examReach()) return;
      ex.idx = i; paint(viewExamRun()); window.scrollTo(0, 0);
    },
    'finish-exam': function () { finishExam(false); },
    'auth-mode': function () { authMode = authMode === 'register' ? 'login' : 'register'; render(); },
    logout: function () {
      api('POST', '/api/auth/logout', {}).catch(function () {}).then(reload).then(function () {
        toast(t('logged_out'));
        go('#/');
      }).catch(function () { go('#/'); });
    },
    'check-payment': function (el) {
      el.disabled = true;
      reload().then(function () {
        if (!S.full) toast(t('still_pending'));
        render();
      }).catch(function (e) { el.disabled = false; toast(errText(e)); });
    },
    copy: function (el) { copy(el.getAttribute('data-text')); },
    star: function (el) {
      rateValue = Number(el.getAttribute('data-v'));
      el.parentNode.querySelectorAll('button').forEach(function (b) {
        var v = Number(b.getAttribute('data-v'));
        b.classList.toggle('on', v <= rateValue);
        b.setAttribute('aria-checked', String(v === rateValue));
      });
    },
    'rate-later': function () { if (ex) ex.reviewDismissed = true; paint(viewExamResult()); },
    'edit-review': function () { editingReview = true; render(); },
    'study-lang': function (el) {
      study.lang = el.getAttribute('data-l');
      store.set('prov.studyLang', study.lang);
      view.querySelectorAll('[data-action="study-lang"]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-l') === study.lang));
      });
      document.getElementById('study-list').innerHTML = studyItems();
    },
    'study-more': function () {
      study.limit += 20;
      document.getElementById('study-list').innerHTML = studyItems();
    },
    install: function () {
      if (!installPrompt) return;
      installPrompt.prompt();
      installPrompt = null;
    }
  };

  view.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-action')];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  var studyTimer;
  view.addEventListener('input', function (e) {
    if (e.target.getAttribute('data-bind') !== 'study-search') return;
    study.search = e.target.value;
    study.limit = 20;
    clearTimeout(studyTimer);
    studyTimer = setTimeout(function () { document.getElementById('study-list').innerHTML = studyItems(); }, 150);
  });

  view.addEventListener('change', function (e) {
    if (e.target.name === 'other') {
      var box = view.querySelector('[data-payer]');
      if (box) box.hidden = !e.target.checked;
    }
  });

  function formBusy(form, busy) {
    var b = form.querySelector('button[type=submit]');
    if (!b) return;
    b.disabled = busy;
    if (busy) { b.dataset.label = b.innerHTML; b.innerHTML = '<span class="spinner"></span>'; }
    else if (b.dataset.label) b.innerHTML = b.dataset.label;
  }
  function formError(form, msg) {
    var box = form.querySelector('.form-error');
    box.textContent = msg;
    box.hidden = !msg;
  }

  var forms = {
    register: function (f) {
      var d = { name: f.name.value, phone: f.phone.value, pin: f.pin.value };
      if (f.pin.value !== f.pin2.value) return formError(f, t('pin_mismatch'));
      return api('POST', '/api/auth/register', d);
    },
    login: function (f) {
      return api('POST', '/api/auth/login', { phone: f.phone.value, pin: f.pin.value });
    },
    pay: function (f) {
      var body = { txid: f.txid.value };
      if (f.other.checked && f.payer.value) body.payer = f.payer.value;
      return api('POST', '/api/payments', body);
    },
    review: function (f) {
      if (!rateValue) return formError(f, t('rate_pick'));
      var body = { rating: rateValue, comment: f.comment.value };
      // The server only accepts reviews after a recorded exam; wait for this exam's record first.
      var ready = f.getAttribute('data-context') === 'exam' && ex && ex.saved ? ex.saved : Promise.resolve();
      return ready.then(function () { return api('POST', '/api/reviews', body); });
    }
  };

  function afterReview(res) {
    S.review = res;
    editingReview = false;
    toast(t('rate_thanks'));
    return api('GET', '/api/reviews').then(function (r) { S.reviews = r; }).catch(function () {}).then(function () {
      if (parseHash().path === 'exam/result' && ex && ex.result) paint(viewExamResult());
      else render();
    });
  }

  view.addEventListener('submit', function (e) {
    var f = e.target;
    var kind = f.getAttribute('data-form');
    if (!forms[kind]) return;
    e.preventDefault();
    formError(f, '');
    var p = forms[kind](f);
    if (!p) return;
    formBusy(f, true);
    p.then(function (res) {
      if (kind === 'review') return afterReview(res);
      return reload().then(function () {
        if (kind === 'pay') toast(t('payment_sent'));
        else toast(t('welcome_back', { name: res.user.name.split(' ')[0] }));
        var next = f.getAttribute('data-next');
        if (next) go(next); else render();
      });
    }).catch(function (err) {
      formBusy(f, false);
      formError(f, errText(err));
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    var sec = parseHash().path;
    var n = Number(e.key);
    if (sec.indexOf('practice') === 0 && S.loaded) {
      if (n >= 1 && n <= 8) practicePick(n - 1);
      else if (e.key === 'ArrowRight') practiceMove(1);
      else if (e.key === 'ArrowLeft') practiceMove(-1);
    } else if (sec === 'exam/run' && ex && !ex.result) {
      if (n >= 1 && n <= qOpts(ex.qs[ex.idx]).length) actions['exam-pick']({ getAttribute: function () { return n - 1; } });
      else if (e.key === 'ArrowRight') actions['exam-next']();
      else if (e.key === 'ArrowLeft') actions['exam-prev']();
    }
  });

  window.addEventListener('hashchange', render);

  // ---------- offline / install ----------
  var offline = document.getElementById('offline');
  function onlineState() {
    offline.textContent = t('offline');
    offline.hidden = navigator.onLine;
  }
  window.addEventListener('online', function () { onlineState(); reload().then(render).catch(function () {}); });
  window.addEventListener('offline', onlineState);
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installPrompt = e;
    if (!parseHash().path) render();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }

  // ---------- start ----------
  function boot() {
    onlineState();
    renderNav(parseHash().path.split('/')[0]);
    view.innerHTML = '<div class="loading splash"><img src="icons/icon.svg" alt="" width="72" height="72">' + wordmark('Provisoire Yanjye') +
      '<span class="spinner"></span><span>' + esc(t('loading')) + '</span></div>';
    load().then(render).catch(function () {
      view.innerHTML = '<div class="card state-card"><div class="state-icon bi-red">' + icon('alert') + '</div><p>' + esc(t('error_load')) + '</p>' +
        '<button class="btn btn-primary btn-block" id="retry">' + esc(t('retry')) + '</button></div>';
      document.getElementById('retry').addEventListener('click', boot);
    });
  }
  boot();
})();
