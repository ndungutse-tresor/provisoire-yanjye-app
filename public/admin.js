(function () {
  'use strict';

  var LANGS = ['rw', 'en', 'fr'];
  var LANG_NAMES = { rw: 'Kinyarwanda', en: 'English', fr: 'Français' };
  var LETTERS = 'ABCDEFGH';
  var root = document.getElementById('root');
  var modal = document.getElementById('modal');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var ICONS = {
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.7 3.5 2.9 3.5 6"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/>',
    upload: '<path d="M12 16V4m0 0-5 5m5-5 5 5M5 20h14"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    star: '<path d="M12 3.2l2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.4-4.2 6-.9z"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'
  };
  function icon(n) { return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (res.status === 401 && path !== '/api/admin/login') { A.me = null; disconnectLive(); renderLogin(); }
        if (!res.ok) throw new Error((data && data.message) || 'Request failed (' + res.status + ').');
        return data;
      });
    });
  }
  function fail(e) { toast(e.message || 'Something went wrong.'); }
  function money(n) { return Number(n || 0).toLocaleString('en-US') + ' ' + (A.settings ? A.settings.currency : 'RWF'); }
  function when(s) {
    if (!s) return '—';
    var d = new Date(s.replace(' ', 'T') + 'Z');
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function firstText(q) { for (var i = 0; i < LANGS.length; i++) if (q.text[LANGS[i]]) return q.text[LANGS[i]]; return ''; }

  // ---------- state ----------
  var A = {
    me: null, settings: null, stats: null,
    payStatus: 'pending', payments: [],
    users: { q: '', filter: '', list: [], total: 0 },
    questions: null, qSearch: '',
    imp: { source: 'file', lang: 'rw', content: '', filename: '', url: '', candidates: null, pick: 0, mode: 'replace', busy: false }
  };
  var edit = null;

  var PAGES = [
    ['dashboard', 'dash', 'Dashboard'],
    ['payments', 'money', 'Payments'],
    ['users', 'users', 'Learners'],
    ['reviews', 'star', 'Reviews'],
    ['questions', 'book', 'Questions'],
    ['import', 'upload', 'Import'],
    ['poster', 'print', 'Poster'],
    ['settings', 'gear', 'Settings']
  ];

  function page() {
    var p = location.hash.replace(/^#\/?/, '');
    return PAGES.some(function (x) { return x[0] === p; }) ? p : 'dashboard';
  }

  // ---------- login ----------
  function renderLogin() {
    root.innerHTML = '<div class="login-wrap"><div class="card"><div class="brand"><img src="icons/icon.svg" alt="" width="34" height="34"><span class="wordmark">Provisoire <em>Yanjye</em></span></div><p class="muted small">Admin</p>' +
      '<form data-form="login"><div class="form-error" hidden></div>' +
      '<label class="field"><span>Username</span><input class="input" name="username" autocomplete="username" required></label>' +
      '<label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>' +
      '<button class="btn btn-primary btn-block" type="submit">Log in</button></form></div></div>';
    root.querySelector('input').focus();
  }

  // ---------- shell ----------
  function shell(content) {
    var cur = page();
    var pending = A.stats ? A.stats.pending : 0;
    var nav = PAGES.map(function (p) {
      return '<a href="#/' + p[0] + '"' + (cur === p[0] ? ' aria-current="page"' : '') + '>' + icon(p[1]) + p[2] +
        (p[0] === 'payments' && pending ? '<span class="count">' + pending + '</span>' : '') + '</a>';
    }).join('');
    root.innerHTML = '<div class="shell"><nav class="side"><div class="brand"><img src="icons/icon.svg" alt=""><span class="wordmark">Provisoire <em>Yanjye</em><small>Admin</small></span></div>' + nav +
      '<div class="foot"><a href="/" target="_blank" rel="noopener">' + icon('open') + 'Open app</a>' +
      '<button class="navbtn" data-action="logout">' + icon('logout') + 'Log out</button><div class="who">' + esc(A.me) +
      ' <span class="live-ind"><span class="live-dot"></span>Live</span></div></div></nav>' +
      '<main class="main" id="main">' + content + '</main></div>';
    root.querySelectorAll('[data-h]').forEach(function (el) { el.style.height = el.getAttribute('data-h') + '%'; });
  }

  function loading(title) { shell('<div class="head"><h1>' + esc(title) + '</h1></div><div class="loading"><span class="spinner"></span></div>'); }

  function render() {
    if (!A.me) return renderLogin();
    var p = page();
    connectLive();
    ({ dashboard: showDashboard, payments: showPayments, users: showUsers, reviews: showReviews, questions: showQuestions, import: showImport, poster: showPoster, settings: showSettings })[p]();
  }

  // ---------- live updates ----------
  var live = null;
  function connectLive() {
    if (live || !window.EventSource) return;
    live = new EventSource('/api/admin/events');
    live.onopen = function () { document.body.classList.add('is-live'); };
    live.onerror = function () {
      document.body.classList.remove('is-live');
      if (!A.me) { live.close(); live = null; }
    };
    var refresh = function (pages) {
      refreshStats().then(function () {
        var p = page();
        if (pages.indexOf(p) >= 0 && modal.hidden) render();
        else {
          var c = root.querySelector('.side .count');
          if (c) c.textContent = A.stats.pending;
          else if (A.stats.pending) render();
        }
      }).catch(function () {});
    };
    live.addEventListener('payment', function (e) {
      var d = JSON.parse(e.data || '{}');
      toast('New payment to check' + (d.name ? ' from ' + d.name : '') + '.');
      refresh(['dashboard', 'payments']);
    });
    live.addEventListener('review', function (e) {
      var d = JSON.parse(e.data || '{}');
      toast('New review: ' + '★'.repeat(d.rating || 0));
      refresh(['dashboard', 'reviews']);
    });
    live.addEventListener('exam', function () { refresh(['dashboard']); });
    live.addEventListener('stats', function () { refresh(['dashboard']); });
  }
  function disconnectLive() {
    if (live) { live.close(); live = null; }
    document.body.classList.remove('is-live');
  }

  function starText(n) {
    return '<span class="stars-txt">' + '★★★★★'.slice(0, n) + '<span>' + '★★★★★'.slice(n) + '</span></span>';
  }

  // ---------- reviews ----------
  A.reviewStatus = 'all';
  function showReviews() {
    loading('Reviews');
    api('GET', '/api/admin/reviews?limit=200' + (A.reviewStatus !== 'all' ? '&status=' + A.reviewStatus : '')).then(function (r) {
      if (page() !== 'reviews') return;
      var s = r.summary, maxBar = Math.max.apply(null, s.distribution.concat([1]));
      var h = '<div class="head"><h1>Reviews</h1><div class="tabs">' + [['all', 'All'], ['published', 'Published'], ['hidden', 'Hidden']].map(function (x) {
        return '<button data-action="review-status" data-s="' + x[0] + '" aria-pressed="' + (A.reviewStatus === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div></div>';
      h += '<div class="grid2"><div class="card"><div class="rating-big"><b>' + (s.count ? s.average.toFixed(1) : '—') + '</b><div>' + starText(Math.round(s.average)) +
        '<div class="muted">' + s.count + ' published review' + (s.count === 1 ? '' : 's') + (r.hidden ? ' · ' + r.hidden + ' hidden' : '') + '</div></div></div>' +
        '<div class="dist">' + [5, 4, 3, 2, 1].map(function (n) {
          return '<div class="drow"><span>' + n + ' ★</span><div class="dbar"><i data-w="' + Math.round(s.distribution[n - 1] / maxBar * 100) + '"></i></div><span>' + s.distribution[n - 1] + '</span></div>';
        }).join('') + '</div></div>' +
        '<div class="card"><h3>How reviews are collected</h3><p class="muted small">Learners are asked for a review right after they pass a mock exam, and after their second exam. Any learner who has finished an exam can also review from their Account page. The app shows reviews once there are at least 3.</p>' +
        '<p class="muted small">Hide only spam, insults or personal information. Hiding honest negative reviews misleads buyers, and in many places it breaks consumer-protection law. Reply to problems on WhatsApp instead.</p></div></div><div class="gap"></div>';
      if (!r.reviews.length) h += '<div class="card empty">No reviews yet. They arrive as learners finish mock exams.</div>';
      r.reviews.forEach(function (v) {
        h += '<div class="card pay' + (v.status === 'hidden' ? ' dimmed' : '') + '"><div><div class="row">' + starText(v.rating) + '<b>' + esc(v.name) + '</b><span class="muted small">' + esc(v.phone) + '</span>' +
          (v.paid ? '<span class="badge badge-ok">Paid</span>' : '<span class="badge badge-free">Free</span>') +
          (v.status === 'hidden' ? '<span class="badge badge-lock">Hidden</span>' : '') + '</div>' +
          (v.comment ? '<p class="mt">' + esc(v.comment) + '</p>' : '<p class="mt muted small">(stars only)</p>') +
          '<div class="muted small">' + esc(when(v.updated_at)) + '</div></div>' +
          '<div class="btns"><button class="btn btn-ghost btn-sm" data-action="review-toggle" data-id="' + v.id + '" data-s="' + (v.status === 'hidden' ? 'published' : 'hidden') + '">' +
          (v.status === 'hidden' ? 'Show again' : 'Hide') + '</button></div></div>';
      });
      shell(h);
      root.querySelectorAll('[data-w]').forEach(function (el) { el.style.width = el.getAttribute('data-w') + '%'; });
    }).catch(fail);
  }

  function refreshStats() {
    return api('GET', '/api/admin/stats').then(function (s) { A.stats = s; });
  }

  // ---------- dashboard ----------
  function showDashboard() {
    if (!A.stats) loading('Dashboard');
    refreshStats().then(function () {
      if (page() !== 'dashboard') return;
      var s = A.stats;
      var h = '<div class="head"><h1>Dashboard</h1></div><div class="stats">' +
        '<div class="card stat' + (s.pending ? ' hot' : '') + '"><div class="l">Payments to check</div><div class="v">' + s.pending + '</div>' +
        (s.pending ? '<a href="#/payments">Review now →</a>' : '<span class="muted small">All done</span>') + '</div>' +
        '<div class="card stat"><div class="l">Revenue this month</div><div class="v">' + esc(money(s.revenueMonth)) + '</div></div>' +
        '<div class="card stat"><div class="l">Total revenue</div><div class="v">' + esc(money(s.revenue)) + '</div><span class="muted small">' + s.sales + ' sales</span></div>' +
        '<div class="card stat"><div class="l">Learners</div><div class="v">' + s.users + '</div><span class="muted small">' + s.paidUsers + ' paid · ' + s.newToday + ' new today</span></div>' +
        '<div class="card stat"><div class="l">Mock exams taken</div><div class="v">' + s.exams.n + '</div><span class="muted small">' + s.examsToday + ' today · ' +
        (s.exams.n ? Math.round(s.exams.passed / s.exams.n * 100) : 0) + '% passed</span></div>' +
        '<div class="card stat"><div class="l">Reviews</div><div class="v">' + (s.reviews.n ? Number(s.reviews.avg).toFixed(1) + ' ★' : '—') + '</div>' +
        '<a href="#/reviews">' + s.reviews.n + ' review' + (s.reviews.n === 1 ? '' : 's') + ' →</a></div>' +
        '<div class="card stat"><div class="l">Questions</div><div class="v">' + s.questions + '</div>' + (s.questions ? '' : '<a href="#/import">Import them →</a>') + '</div></div>';

      var days = [];
      for (var i = 13; i >= 0; i--) {
        var d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
        var row = s.days.filter(function (x) { return x.day === d; })[0];
        days.push({ d: d, sales: row ? row.sales : 0, revenue: row ? row.revenue : 0 });
      }
      var max = Math.max.apply(null, days.map(function (x) { return x.sales; }).concat([1]));
      h += '<div class="grid2"><div class="card"><h3>Sales, last 14 days</h3><div class="chart">' + days.map(function (x) {
        return '<div class="col" title="' + esc(x.d + ': ' + x.sales + ' sales, ' + money(x.revenue)) + '"><span class="n">' + (x.sales || '') + '</span>' +
          '<div class="b" data-h="' + Math.round(x.sales / max * 85) + '"></div><span>' + x.d.slice(8) + '</span></div>';
      }).join('') + '</div></div>';
      h += '<div class="card"><h3>Recent admin activity</h3><ul class="log">' + (s.log.length ? s.log.map(function (l) {
        return '<li><span><b>' + esc(l.action.replace(/_/g, ' ')) + '</b> <span class="muted">' + esc(l.detail || '') + '</span></span><span class="muted">' + esc(when(l.at)) + '</span></li>';
      }).join('') : '<li class="muted">Nothing yet.</li>') + '</ul></div></div>';
      shell(h);
    }).catch(fail);
  }

  // ---------- payments ----------
  function showPayments() {
    loading('Payments');
    Promise.all([api('GET', '/api/admin/payments?status=' + A.payStatus + '&limit=100'), refreshStats(), ensureSettings()]).then(function (r) {
      if (page() !== 'payments') return;
      A.payments = r[0];
      var tabs = ['pending', 'approved', 'rejected', 'all'].map(function (s) {
        return '<button data-action="pay-status" data-s="' + s + '" aria-pressed="' + (A.payStatus === s) + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</button>';
      }).join('');
      var h = '<div class="head"><h1>Payments</h1><div class="tabs">' + tabs + '</div></div>';
      if (A.payStatus === 'pending') {
        h += '<p class="muted">Match each Transaction ID and amount against your MoMo messages before approving. Approving unlocks the learner immediately.</p>';
      }
      if (!A.payments.length) {
        h += '<div class="card empty">' + (A.payStatus === 'pending' ? 'No payments waiting. 🎉' : 'Nothing here.') + '</div>';
      }
      A.payments.forEach(function (p) {
        h += '<div class="card pay"><div><div class="who">' + esc(p.name) + ' · ' + esc(p.phone) + '</div>' +
          '<div class="meta"><span>TxID <button class="tx" data-action="copy" data-text="' + esc(p.txid) + '" title="Copy">' + esc(p.txid) + '</button></span>' +
          '<span>' + esc(money(p.amount)) + '</span>' + (p.payer && p.payer !== p.phone ? '<span>Paid from ' + esc(p.payer) + '</span>' : '') +
          '<span>Sent ' + esc(when(p.created_at)) + '</span>' +
          (p.status !== 'pending' ? '<span class="badge ' + (p.status === 'approved' ? 'badge-ok' : 'badge-free') + '">' + p.status + '</span>' : '') +
          (p.note ? '<span>Note: ' + esc(p.note) + '</span>' : '') + '</div></div>' +
          (p.status === 'pending' ? '<div class="btns"><button class="btn btn-ok btn-sm" data-action="approve" data-id="' + p.id + '">' + icon('check') + 'Approve</button>' +
            '<button class="btn btn-danger btn-sm" data-action="reject" data-id="' + p.id + '">' + icon('x') + 'Reject</button></div>' : '') + '</div>';
      });
      shell(h);
    }).catch(fail);
  }

  // ---------- users ----------
  function showUsers(keepFocus) {
    var u = A.users;
    var qs = '?limit=100&q=' + encodeURIComponent(u.q) + (u.filter ? '&filter=' + u.filter : '');
    api('GET', '/api/admin/users' + qs).then(function (r) {
      if (page() !== 'users') return;
      u.list = r.users;
      u.total = r.total;
      var h = '<div class="head"><h1>Learners <span class="muted">(' + r.total + ')</span></h1></div>' +
        '<div class="toolbar"><input class="input grow" type="search" data-bind="user-q" placeholder="Search name or phone" value="' + esc(u.q) + '">' +
        '<select class="input" data-bind="user-filter">' + [['', 'Everyone'], ['paid', 'Paid'], ['unpaid', 'Free'], ['blocked', 'Blocked']].map(function (o) {
          return '<option value="' + o[0] + '"' + (u.filter === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></div>';
      h += '<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Joined</th><th>Last seen</th><th></th></tr></thead><tbody>';
      if (!u.list.length) h += '<tr><td colspan="6" class="muted">No learners found.</td></tr>';
      u.list.forEach(function (x) {
        var status = x.blocked ? '<span class="badge badge-free">Blocked</span>' : x.paid ? '<span class="badge badge-ok">Paid</span>'
          : x.trialDone ? '<span class="badge badge-lock">Trial used</span>' : '<span class="badge badge-free">On trial</span>';
        h += '<tr><td><b>' + esc(x.name) + '</b></td><td>' + esc(x.phone) + '</td><td>' + status + '</td><td>' + esc(when(x.created_at)) + '</td><td>' + esc(when(x.last_seen)) + '</td>' +
          '<td><div class="actions">' +
          '<button class="btn btn-ghost btn-sm" data-action="user-paid" data-id="' + x.id + '" data-v="' + (!x.paid) + '">' + (x.paid ? 'Remove access' : 'Give access') + '</button>' +
          (x.trialDone && !x.paid ? '<button class="btn btn-ghost btn-sm" data-action="user-trial" data-id="' + x.id + '">Give new trial</button>' : '') +
          '<button class="btn btn-ghost btn-sm" data-action="user-pin" data-id="' + x.id + '">Reset PIN</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="user-phone" data-id="' + x.id + '" data-phone="' + esc(x.phone) + '">Change phone</button>' +
          '<button class="btn ' + (x.blocked ? 'btn-ghost' : 'btn-danger') + ' btn-sm" data-action="user-block" data-id="' + x.id + '" data-v="' + (!x.blocked) + '">' + (x.blocked ? 'Unblock' : 'Block') + '</button>' +
          '</div></td></tr>';
      });
      h += '</tbody></table></div>';
      if (u.total > u.list.length) h += '<p class="muted small">Showing the newest ' + u.list.length + '. Search to find others.</p>';
      shell(h);
      if (keepFocus) {
        var inp = root.querySelector('[data-bind="user-q"]');
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }).catch(fail);
  }

  function userUpdate(id, body, msg) {
    return api('POST', '/api/admin/users/' + id, body).then(function () { toast(msg); showUsers(); }).catch(fail);
  }

  // ---------- questions ----------
  function showQuestions() {
    if (!A.questions) loading('Questions');
    var p = A.questions ? Promise.resolve(A.questions) : api('GET', '/api/admin/questions');
    Promise.all([p, ensureSettings()]).then(function (r) {
      A.questions = r[0];
      if (page() !== 'questions') return;
      paintQuestions();
    }).catch(fail);
  }

  function paintQuestions(keepFocus) {
    var s = A.qSearch.toLowerCase();
    var free = A.settings ? A.settings.free_count : 0;
    var list = A.questions.map(function (q, i) { return { q: q, n: i + 1 }; }).filter(function (x) {
      if (!s) return true;
      var hay = LANGS.map(function (l) { return (x.q.text[l] || '') + ' ' + (x.q.options[l] || []).join(' '); }).join(' ') + ' ' + x.q.category;
      return hay.toLowerCase().indexOf(s) >= 0 || String(x.n) === s;
    });
    var h = '<div class="head"><h1>Questions <span class="muted">(' + A.questions.length + ')</span></h1>' +
      '<button class="btn btn-primary btn-sm" data-action="q-new">' + icon('plus') + 'Add question</button></div>' +
      '<div class="toolbar"><input class="input grow" type="search" data-bind="q-search" placeholder="Search text, answers, topic or number" value="' + esc(A.qSearch) + '"></div>';
    if (!A.questions.length) {
      h += '<div class="card empty">No questions yet. <a href="#/import">Import your question file</a> or add them one by one.</div>';
    } else {
      var cover = LANGS.map(function (l) {
        var n = A.questions.filter(function (q) { return q.text[l]; }).length;
        return '<span class="cover' + (n === A.questions.length ? ' full' : '') + '"><b>' + l.toUpperCase() + '</b> ' + n + '/' + A.questions.length + '</span>';
      }).join('');
      h += '<div class="coverage"><span class="muted small">Translated:</span>' + cover + '</div>' +
        '<p class="muted small">Questions marked <span class="badge badge-ok">FREE</span> are the ' + free + '-question free trial for new accounts. They are picked automatically across topics (e.g. Ibyapa and Amategeko), and questions translated into all 3 languages come first. The rest need payment.</p><div class="card qlist">';
      list.slice(0, 500).forEach(function (x) {
        var q = x.q;
        h += '<button class="qrow" data-action="q-edit" data-id="' + q.id + '"><span class="num">#' + x.n + '</span>' + (q.free ? '<span class="badge badge-ok">FREE</span>' : '') +
          (q.image ? '<img class="thumb" src="' + esc(q.image) + '" alt="" loading="lazy">' : '<span class="thumb none"></span>') +
          '<span class="txt">' + esc(firstText(q)) + (q.category ? ' <span class="muted small">· ' + esc(q.category) + '</span>' : '') + '</span>' +
          '<span class="langs">' + LANGS.map(function (l) { return '<span class="' + (q.text[l] ? 'on' : '') + '">' + l.toUpperCase() + '</span>'; }).join('') + '</span></button>';
      });
      if (!list.length) h += '<p class="muted">No match.</p>';
      h += '</div>';
    }
    shell(h);
    if (keepFocus) {
      var inp = root.querySelector('[data-bind="q-search"]');
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }

  function openEditor(q) {
    var count = q ? q.options[Object.keys(q.options)[0]].length : 4;
    edit = {
      id: q ? q.id : null,
      category: q ? q.category : '',
      image: q ? q.image : null,
      text: {}, options: {}, explanation: {},
      answer: q ? q.answer : 0,
      count: count,
      tab: q ? (LANGS.filter(function (l) { return q.text[l]; })[0] || 'rw') : 'rw'
    };
    LANGS.forEach(function (l) {
      edit.text[l] = q && q.text[l] || '';
      edit.options[l] = [];
      for (var i = 0; i < count; i++) edit.options[l].push(q && q.options[l] ? q.options[l][i] || '' : '');
      edit.explanation[l] = q && q.explanation && q.explanation[l] || '';
    });
    paintEditor();
    modal.hidden = false;
  }

  function paintEditor() {
    var l = edit.tab;
    var h = '<div class="modal-box" role="dialog" aria-modal="true"><div class="modal-head"><h2>' + (edit.id ? 'Edit question' : 'New question') + '</h2>' +
      '<button class="icon-btn" data-action="close-modal" aria-label="Close">' + icon('x') + '</button></div><div class="form-error" hidden></div>';
    h += '<div class="form-grid"><label class="field"><span>Topic (optional)</span><input class="input" data-bind="category" maxlength="40" value="' + esc(edit.category) + '" placeholder="e.g. Ibyapa"></label>' +
      '<div class="field"><span>Picture (optional)</span><div class="img-edit">' + (edit.image ? '<img src="' + esc(edit.image) + '" alt="">' : '') +
      '<label class="btn btn-ghost btn-sm">' + icon('upload') + 'Upload<input type="file" accept="image/*" data-bind="image-file" hidden></label>' +
      (edit.image ? '<button class="btn btn-danger btn-sm" data-action="img-remove">Remove</button>' : '') + '</div></div></div>' +
      '<label class="field"><span>…or picture link (https://)</span><input class="input" data-bind="image-url" value="' + esc(edit.image && edit.image.indexOf('data:') !== 0 ? edit.image : '') + '" placeholder="https://"></label>';
    h += '<div class="tabs">' + LANGS.map(function (x) {
      return '<button data-action="ed-tab" data-l="' + x + '" aria-pressed="' + (x === l) + '">' + LANG_NAMES[x] + (edit.text[x] ? ' ✓' : '') + '</button>';
    }).join('') + '</div><div class="gap"></div>';
    h += '<label class="field"><span>Question (' + LANG_NAMES[l] + ')</span><textarea class="input" data-bind="text">' + esc(edit.text[l]) + '</textarea></label>';
    h += '<div class="field"><span>Answers — tick the correct one</span>';
    for (var i = 0; i < edit.count; i++) {
      h += '<div class="opt-row"><input type="radio" name="correct" data-bind="answer" value="' + i + '"' + (edit.answer === i ? ' checked' : '') + ' aria-label="Correct answer ' + LETTERS[i] + '">' +
        '<b>' + LETTERS[i] + '</b><input class="input" data-bind="opt" data-i="' + i + '" value="' + esc(edit.options[l][i]) + '"></div>';
    }
    h += '<div class="row">' + (edit.count < 8 ? '<button class="btn btn-ghost btn-sm" data-action="opt-add">' + icon('plus') + 'Add answer</button>' : '') +
      (edit.count > 2 ? '<button class="btn btn-ghost btn-sm" data-action="opt-remove">Remove last</button>' : '') + '</div></div>';
    h += '<label class="field"><span>Explanation (optional, ' + LANG_NAMES[l] + ')</span><textarea class="input" data-bind="expl">' + esc(edit.explanation[l]) + '</textarea></label>';
    h += '<p class="help">Fill in the languages you have. Learners see their chosen language, or another one if it is missing. Answers and the correct letter are shared across languages.</p>';
    h += '<div class="row">' + (edit.id ? '<button class="btn btn-danger" data-action="q-delete">Delete</button>' : '') +
      '<span class="grow"></span><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="q-save">Save</button></div></div>';
    modal.innerHTML = h;
  }

  function editorPayload() {
    var out = { category: edit.category, image: edit.image, text: {}, options: {}, explanation: {}, answer: edit.answer };
    LANGS.forEach(function (l) {
      var hasAny = edit.text[l].trim() || edit.options[l].some(function (o) { return o.trim(); });
      if (!hasAny) return;
      out.text[l] = edit.text[l];
      out.options[l] = edit.options[l];
      if (edit.explanation[l].trim()) out.explanation[l] = edit.explanation[l];
    });
    return out;
  }

  function resizeImage(file) {
    return new Promise(function (resolve, reject) {
      if (file.size > 15 * 1024 * 1024) return reject(new Error('Picture is too large.'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read the picture.')); };
      reader.onload = function () {
        if (file.type === 'image/svg+xml') return resolve(reader.result);
        var img = new Image();
        img.onload = function () {
          var max = 800, w = img.width, h = img.height;
          if (w > max || h > max) { var k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          var png = c.toDataURL('image/png');
          var jpg = c.toDataURL('image/jpeg', 0.85);
          resolve(png.length < jpg.length * 1.3 ? png : jpg);
        };
        img.onerror = function () { reject(new Error('That file is not a picture.')); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- import ----------
  function showImport() {
    Promise.all([ensureSettings(), refreshStats()]).then(function () {
      if (page() === 'import') paintImport();
    }).catch(fail);
  }

  function paintImport() {
    var m = A.imp;
    var h = '<div class="head"><h1>Import questions</h1></div>' +
      '<p class="muted">Connect your existing app here. Load <b>amategeko-yumuhanda.html</b> (or a link to it) and the questions are read out of it. Nothing in the file is run on the server. You can also use a JSON file or a spreadsheet saved as CSV.</p>';

    h += '<div class="card"><h3>1. Choose the source</h3><div class="tabs">' + [['file', 'File'], ['url', 'Link'], ['paste', 'Paste']].map(function (s) {
      return '<button data-action="imp-source" data-s="' + s[0] + '" aria-pressed="' + (m.source === s[0]) + '">' + s[1] + '</button>';
    }).join('') + '</div><div class="gap"></div>';
    if (m.source === 'file') {
      h += '<label class="drop">' + icon('upload') + '<div><b>' + (m.filename ? esc(m.filename) : 'Choose a file') + '</b></div>' +
        '<div class="muted small">.html, .json, .csv or .js, up to 30 MB</div><input type="file" data-bind="imp-file" accept=".html,.htm,.json,.csv,.tsv,.js,.txt"></label>';
    } else if (m.source === 'url') {
      h += '<label class="field"><span>Link to the file</span><input class="input" data-bind="imp-url" type="url" placeholder="https://…/amategeko-yumuhanda.html" value="' + esc(m.url) + '"></label>' +
        '<p class="help">Pictures stored next to the file online are found automatically when you use a link.</p>';
    } else {
      h += '<label class="field"><span>Paste the content</span><textarea class="input" data-bind="imp-paste" rows="8" placeholder="Paste HTML, JSON or CSV">' + esc(m.source === 'paste' ? m.content : '') + '</textarea></label>';
    }
    h += '<label class="field"><span>Language of the questions in this file</span><select class="input" data-bind="imp-lang">' + LANGS.map(function (l) {
      return '<option value="' + l + '"' + (m.lang === l ? ' selected' : '') + '>' + LANG_NAMES[l] + '</option>';
    }).join('') + '</select></label>' +
      '<button class="btn btn-primary" data-action="imp-read"' + (m.busy ? ' disabled' : '') + '>' + (m.busy ? '<span class="spinner"></span>' : '') + 'Read questions</button></div>';

    if (m.candidates) {
      var c = m.candidates[m.pick];
      h += '<div class="gap"></div><div class="card"><h3>2. Check what was found</h3>';
      if (m.candidates.length > 1) {
        h += '<label class="field"><span>Question lists found in the file</span><select class="input" data-bind="imp-pick">' + m.candidates.map(function (x, i) {
          return '<option value="' + i + '"' + (i === m.pick ? ' selected' : '') + '>' + esc(x.path) + ' — ' + x.questions.length + ' questions</option>';
        }).join('') + '</select></label>';
      }
      h += '<p><b>' + c.questions.length + ' questions</b> ready' + (c.found > c.questions.length ? ' (of ' + c.found + ' items found)' : '') + '.</p>' +
        '<p class="small muted">Read as: ' + esc(c.mapping) + '</p>';
      c.warnings.forEach(function (w) { h += '<div class="warn">' + esc(w) + '</div>'; });
      c.questions.slice(0, 5).forEach(function (q, i) {
        var opts = q.options[m.lang];
        h += '<div class="preview-q">' + (q.image ? '<img src="' + esc(q.image) + '" alt="">' : '') +
          '<div><b>' + (i + 1) + '. ' + esc(q.text[m.lang]) + '</b>' + (q.category ? ' <span class="muted small">· ' + esc(q.category) + '</span>' : '') + '</div>' +
          opts.map(function (o, k) { return '<div class="o' + (k === q.answer ? ' ok' : '') + '">' + LETTERS[k] + '. ' + esc(o) + (k === q.answer ? ' ✓' : '') + '</div>'; }).join('') + '</div>';
      });
      if (c.questions.length > 5) h += '<p class="muted small">…and ' + (c.questions.length - 5) + ' more.</p>';
      h += '<p class="help">Check that the ✓ is on the right answer. If every ✓ is one place off, tell your developer. The file may count answers differently.</p></div>';

      var existing = A.questions ? A.questions.length : (A.stats ? A.stats.questions : 0);
      h += '<div class="gap"></div><div class="card"><h3>3. Import</h3>' +
        radio('replace', 'Replace all questions', 'Deletes the ' + existing + ' current questions and uses these instead.') +
        radio('append', 'Add to the end', 'Keeps current questions and adds these after them.') +
        radio('translate', 'Add as a translation', 'Adds ' + LANG_NAMES[m.lang] + ' text to the current questions, matched in order (question 1 to question 1…). Use this for the same questions in another language.') +
        '<button class="btn btn-accent" data-action="imp-commit"' + (m.busy ? ' disabled' : '') + '>' + icon('upload') + 'Import ' + c.questions.length + ' questions</button></div>';
    }
    shell(h);
  }

  function radio(v, title, desc) {
    return '<label class="radio-card"><input type="radio" name="imp-mode" data-bind="imp-mode" value="' + v + '"' + (A.imp.mode === v ? ' checked' : '') + '>' +
      '<span><b>' + title + '</b><br><span class="muted small">' + esc(desc) + '</span></span></label>';
  }

  // ---------- settings ----------
  function ensureSettings() {
    return A.settings ? Promise.resolve(A.settings) : api('GET', '/api/admin/settings').then(function (s) { A.settings = s; return s; });
  }

  function field(key, label, type, help, attrs) {
    return '<div><label class="field"><span>' + label + '</span><input class="input" name="' + key + '" type="' + (type || 'text') + '" value="' + esc(A.settings[key]) + '" ' + (attrs || '') + '></label>' +
      (help ? '<p class="help">' + help + '</p>' : '') + '</div>';
  }

  function showSettings() {
    A.settings = null;
    loading('Settings');
    ensureSettings().then(function () {
      if (page() !== 'settings') return;
      var h = '<div class="head"><h1>Settings</h1></div><form data-form="settings" class="card"><div class="form-error" hidden></div>' +
        '<h3>Price and MoMo</h3><div class="form-grid">' +
        field('price', 'Price', 'number', 'Changing the price only affects new payments.', 'min="0" step="50"') +
        field('currency', 'Currency') +
        field('momo_name', 'MoMo Pay name', 'text', 'Shown big above the QR code, so learners know who they are paying.') +
        field('momo_number', 'MoMo number', 'tel', 'Shown under the name.') +
        field('momo_pay_code', 'MoMo Pay code', 'text', 'Your merchant code, e.g. 675148.') +
        '</div><div class="form-grid">' +
        field('momo_ussd', 'Dial code', 'text', 'For the "Dial to pay" button. {code}, {number} and {amount} are filled in for you.') +
        field('momo_qr', 'QR code content', 'text', 'Default tel:*182*8*1*{code}%23 opens the phone dialer with the code ready. %23 means #.') +
        '</div><div class="qr-preview"><img id="qr-preview" alt="QR preview" width="150" height="150"><div><b>QR preview</b><div class="muted small" id="qr-text"></div>' +
        '<p class="help">Scan it with your phone camera to check. Then print it from the <a href="#/poster">Poster</a> page.</p></div></div>' +
        '<div class="hr"></div><h3>Support and access</h3><div class="form-grid">' +
        field('whatsapp', 'WhatsApp support number', 'tel', 'Shown as a help button. Leave empty to hide it.') +
        field('free_count', 'Free trial questions', 'number', 'Given after sign-up for study, practice and a trial exam. Mixed across topics automatically.', 'min="0"') +
        field('daily_questions', 'Questions per day', 'number', 'How many different questions a learner can study or practise each day. 0 = no limit.', 'min="0"') +
        field('daily_exams', 'Exams per day', 'number', 'How many mock exams a paid learner can start each day. 0 = no limit.', 'min="0"') +
        field('app_name', 'App name') + '</div>' +
        '<div class="hr"></div><h3>Mock exam</h3><div class="form-grid">' +
        field('exam_count', 'Questions per exam', 'number', '', 'min="1"') +
        field('exam_minutes', 'Minutes', 'number', '', 'min="1"') +
        field('pass_mark', 'Correct answers needed to pass', 'number', '', 'min="1"') +
        '</div><p class="help">Set these to match the real Rwanda provisional exam.</p>' +
        '<button class="btn btn-primary" type="submit">Save settings</button></form>';
      h += '<div class="gap"></div><form data-form="password" class="card"><h3>Change admin password</h3><div class="form-error" hidden></div><div class="form-grid">' +
        '<label class="field"><span>Current password</span><input class="input" name="current" type="password" autocomplete="current-password" required></label>' +
        '<label class="field"><span>New password (10+ characters)</span><input class="input" name="next" type="password" autocomplete="new-password" minlength="10" required></label>' +
        '</div><button class="btn btn-ghost" type="submit">Change password</button></form>';
      shell(h);
      updateQrPreview();
    }).catch(fail);
  }

  function fillPay(tpl, s) {
    return String(tpl || '')
      .replace(/\{code\}/g, String(s.momo_pay_code || '').replace(/\s/g, ''))
      .replace(/\{number\}/g, String(s.momo_number || '').replace(/\s/g, ''))
      .replace(/\{amount\}/g, String(s.price));
  }
  function qrUrl(text) { return '/api/qr.svg?d=' + encodeURIComponent(text); }
  function phoneFmt(p) {
    var d = String(p).replace(/\D/g, '');
    return d.length === 10 ? d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7) : String(p);
  }

  // Live preview while typing in Settings (uses the values in the form, saved or not).
  function updateQrPreview() {
    var f = root.querySelector('form[data-form="settings"]');
    var img = document.getElementById('qr-preview');
    if (!f || !img) return;
    var text = fillPay(f.momo_qr.value, { momo_pay_code: f.momo_pay_code.value, momo_number: f.momo_number.value, price: f.price.value });
    document.getElementById('qr-text').textContent = text || '(empty)';
    if (text) img.src = qrUrl(text);
    img.hidden = !text;
  }

  // ---------- poster ----------
  function showPoster() {
    A.settings = null;
    loading('Poster');
    ensureSettings().then(function (s) {
      if (page() !== 'poster') return;
      var appUrl = location.origin + '/';
      var local = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
      var pay = fillPay(s.momo_qr, s);
      var h = '<div class="head no-print"><h1>Poster</h1><button class="btn btn-primary btn-sm" data-action="print">Print</button></div>' +
        '<p class="muted no-print">Print it for driving schools, bus stops and notice boards. One QR code opens the app, and the other pays with MoMo Pay.</p>' +
        (local ? '<div class="warn no-print">The app QR points to <b>' + esc(appUrl) + '</b>, which only works on this computer. Put the app online before printing.</div><div class="gap no-print"></div>' : '') +
        '<div class="poster"><div class="poster-top"><img src="icons/icon.svg" alt=""><span class="wordmark">' +
        esc(s.app_name.split(' ').slice(0, -1).join(' ') || s.app_name) + (s.app_name.indexOf(' ') > 0 ? ' <em>' + esc(s.app_name.split(' ').pop()) + '</em>' : '') + '</span></div>' +
        '<h2>Tsinda provisoire ku nshuro ya mbere</h2>' +
        '<p class="poster-sub">Ibibazo, ibyapa n’ibizamini by’igerageza muri telefoni yawe. Ibibazo ' + s.free_count + ' ni ubuntu.</p>' +
        '<div class="poster-cols"><div class="pcol"><h3>1. Fungura porogaramu</h3><img class="pqr" src="' + qrUrl(appUrl) + '" alt="">' +
        '<div class="purl">' + esc(appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</div></div>' +
        '<div class="pcol pmomo"><h3>2. Fungura byose · ' + Number(s.price).toLocaleString('en-US') + ' ' + esc(s.currency) + '</h3>' +
        '<span class="momo-badge">MoMo Pay</span>' +
        (s.momo_name ? '<div class="momo-name">' + esc(s.momo_name) + '</div>' : '') +
        (s.momo_number ? '<div class="momo-number">' + esc(phoneFmt(s.momo_number)) + '</div>' : '') +
        (pay ? '<img class="pqr" src="' + qrUrl(pay) + '" alt=""><div class="ussd-code">' + esc(fillPay(s.momo_ussd, s) || pay) + '</div>' : '') +
        '</div></div>' +
        (s.whatsapp ? '<p class="poster-foot">Ubufasha kuri WhatsApp: <b>' + esc(phoneFmt(s.whatsapp)) + '</b></p>' : '') + '</div>';
      shell(h);
    }).catch(fail);
  }

  // ---------- events ----------
  var actions = {
    logout: function () {
      disconnectLive();
      api('POST', '/api/admin/logout', {}).finally(function () { A.me = null; A.stats = null; renderLogin(); });
    },
    copy: function (el) {
      if (navigator.clipboard) navigator.clipboard.writeText(el.getAttribute('data-text')).then(function () { toast('Copied'); });
    },
    'pay-status': function (el) { A.payStatus = el.getAttribute('data-s'); showPayments(); },
    print: function () { window.print(); },
    'review-status': function (el) { A.reviewStatus = el.getAttribute('data-s'); showReviews(); },
    'review-toggle': function (el) {
      var hide = el.getAttribute('data-s') === 'hidden';
      if (hide && !confirm('Hide this review from the app? Only hide spam, insults or personal details.')) return;
      api('POST', '/api/admin/reviews/' + el.getAttribute('data-id'), { status: el.getAttribute('data-s') })
        .then(function () { toast(hide ? 'Review hidden.' : 'Review shown again.'); showReviews(); }).catch(fail);
    },
    approve: function (el) {
      var p = A.payments.filter(function (x) { return String(x.id) === el.getAttribute('data-id'); })[0];
      if (!confirm('Approve ' + p.txid + ' (' + money(p.amount) + ') for ' + p.name + ' ' + p.phone + '?\n\nOnly approve if this payment is in your MoMo messages.')) return;
      el.disabled = true;
      api('POST', '/api/admin/payments/' + p.id + '/approve', {}).then(function () { toast('Approved: ' + p.name + ' is unlocked.'); showPayments(); }).catch(function (e) { el.disabled = false; fail(e); });
    },
    reject: function (el) {
      var note = prompt('Reason (the learner sees this):', 'We could not find this Transaction ID. Please check it and send again.');
      if (note === null) return;
      api('POST', '/api/admin/payments/' + el.getAttribute('data-id') + '/reject', { note: note }).then(function () { toast('Rejected.'); showPayments(); }).catch(fail);
    },
    'user-paid': function (el) {
      var give = el.getAttribute('data-v') === 'true';
      if (!confirm(give ? 'Give this learner full access without a payment record?' : 'Remove full access from this learner?')) return;
      userUpdate(el.getAttribute('data-id'), { paid: give }, give ? 'Access given.' : 'Access removed.');
    },
    'user-block': function (el) {
      var block = el.getAttribute('data-v') === 'true';
      if (block && !confirm('Block this learner? They are logged out everywhere.')) return;
      userUpdate(el.getAttribute('data-id'), { blocked: block }, block ? 'Blocked.' : 'Unblocked.');
    },
    'user-trial': function (el) {
      if (!confirm('Give this learner a new free trial (16 questions + one trial exam)?')) return;
      userUpdate(el.getAttribute('data-id'), { resetTrial: true }, 'New free trial given.');
    },
    'user-phone': function (el) {
      var phone = prompt('New phone number for this learner (was ' + el.getAttribute('data-phone') + ').\nOnly change it after confirming the request on WhatsApp.');
      if (phone === null || !phone.trim()) return;
      userUpdate(el.getAttribute('data-id'), { phone: phone.trim() }, 'Phone number changed. They must log in again with the new number.');
    },
    'user-pin': function (el) {
      var pin = prompt('New PIN for this learner (4 to 6 digits). Tell it to them privately:');
      if (pin === null) return;
      userUpdate(el.getAttribute('data-id'), { pin: pin.trim() }, 'PIN changed. They were logged out on other phones.');
    },
    'q-new': function () { openEditor(null); },
    'q-edit': function (el) {
      var id = Number(el.getAttribute('data-id'));
      openEditor(A.questions.filter(function (q) { return q.id === id; })[0]);
    },
    'close-modal': function () { modal.hidden = true; modal.innerHTML = ''; edit = null; },
    'ed-tab': function (el) { edit.tab = el.getAttribute('data-l'); paintEditor(); },
    'opt-add': function () { edit.count++; LANGS.forEach(function (l) { edit.options[l].push(''); }); paintEditor(); },
    'opt-remove': function () {
      edit.count--;
      LANGS.forEach(function (l) { edit.options[l].pop(); });
      if (edit.answer >= edit.count) edit.answer = 0;
      paintEditor();
    },
    'img-remove': function () { edit.image = null; paintEditor(); },
    'q-save': function (el) {
      el.disabled = true;
      var req = edit.id ? api('PUT', '/api/admin/questions/' + edit.id, editorPayload()) : api('POST', '/api/admin/questions', editorPayload());
      req.then(function (saved) {
        if (edit.id) A.questions = A.questions.map(function (q) { return q.id === saved.id ? saved : q; });
        else A.questions.push(saved);
        actions['close-modal']();
        toast('Saved.');
        paintQuestions();
      }).catch(function (e) {
        el.disabled = false;
        var box = modal.querySelector('.form-error');
        box.textContent = e.message;
        box.hidden = false;
        box.scrollIntoView({ block: 'center' });
      });
    },
    'q-delete': function () {
      if (!confirm('Delete this question for good?')) return;
      var id = edit.id;
      api('DELETE', '/api/admin/questions/' + id, {}).then(function () {
        A.questions = A.questions.filter(function (q) { return q.id !== id; });
        actions['close-modal']();
        toast('Deleted.');
        paintQuestions();
      }).catch(fail);
    },
    'imp-source': function (el) { A.imp.source = el.getAttribute('data-s'); A.imp.candidates = null; paintImport(); },
    'imp-read': function () {
      var m = A.imp;
      var body = { lang: m.lang };
      if (m.source === 'url') {
        if (!m.url) return toast('Paste a link first.');
        body.url = m.url;
      } else {
        if (!m.content) return toast(m.source === 'file' ? 'Choose a file first.' : 'Paste something first.');
        body.content = m.content;
        body.filename = m.source === 'file' ? m.filename : '';
      }
      m.busy = true;
      paintImport();
      api('POST', '/api/admin/import/parse', body).then(function (r) {
        m.candidates = r.candidates;
        m.pick = 0;
        m.mode = (A.stats && A.stats.questions) ? m.mode : 'replace';
      }).catch(function (e) {
        m.candidates = null;
        fail(e);
      }).finally(function () { m.busy = false; paintImport(); });
    },
    'imp-commit': function () {
      var m = A.imp, c = m.candidates[m.pick];
      var what = { replace: 'REPLACE all current questions with', append: 'ADD', translate: 'add ' + LANG_NAMES[m.lang] + ' text from' }[m.mode];
      if (!confirm('This will ' + what + ' ' + c.questions.length + ' questions. Continue?')) return;
      m.busy = true;
      paintImport();
      api('POST', '/api/admin/import/commit', { lang: m.lang, mode: m.mode, questions: c.questions }).then(function (r) {
        toast(r.added ? r.added + ' questions imported.' : r.updated + ' questions translated' + (r.skipped ? ', ' + r.skipped + ' skipped (different answers)' : '') + '.');
        m.candidates = null;
        m.content = '';
        m.filename = '';
        A.questions = null;
        A.stats = null;
        location.hash = '#/questions';
      }).catch(fail).finally(function () { m.busy = false; if (page() === 'import') paintImport(); });
    }
  };

  document.addEventListener('click', function (e) {
    if (e.target === modal) return actions['close-modal']();
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-action')];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) actions['close-modal']();
  });

  var searchTimer;
  var qrTimer;
  document.addEventListener('input', function (e) {
    if (e.target.form && e.target.form.getAttribute('data-form') === 'settings' && /^(momo_|price)/.test(e.target.name)) {
      clearTimeout(qrTimer);
      qrTimer = setTimeout(updateQrPreview, 250);
    }
    var b = e.target.getAttribute('data-bind');
    if (!b) return;
    var v = e.target.value;
    if (edit) {
      if (b === 'text') { edit.text[edit.tab] = v; return; }
      if (b === 'opt') { edit.options[edit.tab][Number(e.target.getAttribute('data-i'))] = v; return; }
      if (b === 'expl') { edit.explanation[edit.tab] = v; return; }
      if (b === 'category') { edit.category = v; return; }
      if (b === 'image-url') { edit.image = v.trim() || null; return; }
    }
    if (b === 'user-q') {
      A.users.q = v;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { showUsers(true); }, 300);
    }
    if (b === 'q-search') {
      A.qSearch = v;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { paintQuestions(true); }, 200);
    }
    if (b === 'imp-url') A.imp.url = v.trim();
    if (b === 'imp-paste') A.imp.content = v;
  });

  document.addEventListener('change', function (e) {
    var b = e.target.getAttribute('data-bind');
    if (!b) return;
    if (b === 'answer' && edit) edit.answer = Number(e.target.value);
    if (b === 'image-file' && edit && e.target.files[0]) {
      resizeImage(e.target.files[0]).then(function (url) { edit.image = url; paintEditor(); }).catch(fail);
    }
    if (b === 'user-filter') { A.users.filter = e.target.value; showUsers(); }
    if (b === 'imp-lang') { A.imp.lang = e.target.value; if (A.imp.candidates) { A.imp.candidates = null; paintImport(); } }
    if (b === 'imp-pick') { A.imp.pick = Number(e.target.value); paintImport(); }
    if (b === 'imp-mode') A.imp.mode = e.target.value;
    if (b === 'imp-file' && e.target.files[0]) {
      var f = e.target.files[0];
      if (f.size > 30 * 1024 * 1024) return toast('The file is larger than 30 MB.');
      f.text().then(function (text) {
        A.imp.content = text;
        A.imp.filename = f.name;
        A.imp.candidates = null;
        paintImport();
      });
    }
  });

  function formError(form, msg) {
    var box = form.querySelector('.form-error');
    box.textContent = msg || '';
    box.hidden = !msg;
  }

  document.addEventListener('submit', function (e) {
    var f = e.target, kind = f.getAttribute('data-form');
    if (!kind) return;
    e.preventDefault();
    formError(f, '');
    var btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    var done = function () { btn.disabled = false; };

    if (kind === 'login') {
      api('POST', '/api/admin/login', { username: f.username.value, password: f.password.value }).then(function (r) {
        A.me = r.username;
        render();
      }).catch(function (err) { done(); formError(f, err.message); });
    } else if (kind === 'settings') {
      var body = {};
      Array.prototype.forEach.call(f.elements, function (el) {
        if (!el.name) return;
        body[el.name] = el.type === 'number' ? Number(el.value) : el.value;
      });
      api('PUT', '/api/admin/settings', body).then(function (s) { A.settings = s; done(); toast('Settings saved.'); })
        .catch(function (err) { done(); formError(f, err.message); });
    } else if (kind === 'password') {
      api('POST', '/api/admin/password', { current: f.current.value, next: f.next.value }).then(function () {
        toast('Password changed. Log in again.');
        A.me = null;
        renderLogin();
      }).catch(function (err) { done(); formError(f, err.message); });
    }
  });

  window.addEventListener('hashchange', function () {
    if (!modal.hidden) actions['close-modal']();
    render();
  });

  // Keep the pending-payments badge fresh.
  setInterval(function () {
    if (!A.me || document.hidden) return;
    var before = A.stats ? A.stats.pending : 0;
    refreshStats().then(function () {
      if (A.stats.pending !== before) {
        if (A.stats.pending > before) toast('New payment to check.');
        var p = page();
        if (p === 'dashboard' || p === 'payments') render();
        else { var c = root.querySelector('.side .count'); if (c) c.textContent = A.stats.pending; }
      }
    }).catch(function () {});
  }, 30000);

  api('GET', '/api/admin/me').then(function (r) { A.me = r.username; render(); }).catch(function () { renderLogin(); });
})();
