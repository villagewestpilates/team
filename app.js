/* Village West Team app. Stage 1: personal links. */
(function () {
  'use strict';

  var API = 'https://script.google.com/macros/s/AKfycbz7i8unoDEf_x9vOwhwvel71qbyrDs0QVSsQWK7Gm33_LzL9L3EVv3RS_AEXhrVUKMJjQ/exec';
  var STORE_KEY = 'vwp.k';

  var app = document.getElementById('app');
  var tabbar = document.getElementById('tabbar');
  var toastEl = document.getElementById('toast');
  var state = { k: '', me: null, settings: { beta: false }, tab: 'home', unread: 0 };

  /* ---------- Small helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (window.ICONS[name] || '') + '</svg>'; }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function store(k) { try { if (k) localStorage.setItem(STORE_KEY, k); else localStorage.removeItem(STORE_KEY); } catch (e) {} }
  function stored() { try { return localStorage.getItem(STORE_KEY) || ''; } catch (e) { return ''; } }

  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  /* ---------- Talking to the server ---------- */

  function api(action, data) {
    var body = Object.assign({ action: action, k: state.k }, data || {});
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);
    return fetch(API, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  /* ---------- Screens ---------- */

  function showSkeleton() {
    tabbar.hidden = true;
    app.innerHTML =
      '<div class="screen" aria-busy="true" aria-label="Loading">' +
        '<div class="hello"><div class="sk sk-circle"></div><div class="hello-text">' +
          '<div class="sk" style="width:110px;height:14px;margin-bottom:8px"></div>' +
          '<div class="sk" style="width:150px;height:22px"></div></div></div>' +
        '<div class="sk sk-card" style="height:84px"></div>' +
        '<div class="sk sk-card"></div><div class="sk sk-card"></div>' +
      '</div>';
  }

  function showLinkProblem() {
    tabbar.hidden = true;
    app.innerHTML =
      '<div class="center full">' +
        '<div class="bubble">' + icon('link') + '</div>' +
        '<h1>This link didn\'t work</h1>' +
        '<p>Open your personal link again, or ask Barbara to resend it.</p>' +
        '<a class="btn btn-outline" href="sms:+14432779647" target="_blank" rel="noopener">' + icon('message-circle') + 'Text Barbara</a>' +
      '</div>';
  }

  function showOffline() {
    tabbar.hidden = true;
    app.innerHTML =
      '<div class="center full">' +
        '<div class="bubble coral">' + icon('wifi-off') + '</div>' +
        '<h1>Can\'t connect right now</h1>' +
        '<p>Check your signal or Wi-Fi, then try again.</p>' +
        '<button class="btn btn-primary" id="retry">' + icon('refresh-cw') + 'Try again</button>' +
      '</div>';
    document.getElementById('retry').addEventListener('click', boot);
  }

  function header() {
    var me = state.me;
    return '<header class="hello">' +
      '<div class="avatar" aria-hidden="true">' + esc(me.firstName.charAt(0).toUpperCase()) + '</div>' +
      '<div class="hello-text"><div class="hello-small">' + greeting() + '</div>' +
      '<div class="hello-name">' + esc(me.firstName) + '</div></div>' +
      '<div class="brand"><span class="wordmark">VILLAGE WEST</span>' +
      (state.settings.beta ? '<span class="beta">Beta</span>' : '') + '</div>' +
    '</header>';
  }

  var ROLE_WORDS = { admin: 'Admin', poster: 'Poster', member: 'Team member' };

  function renderTab() {
    var me = state.me;
    var html = '';
    if (state.tab === 'home') {
      html = '<div class="screen">' + header() +
        '<div class="card"><div class="card-title">Your personal link works</div>' +
        '<p class="muted" style="margin-top:6px">The app knows it\'s you, ' + esc(me.firstName) + '. No password needed.</p>' +
        '<div class="rows">' +
          '<div class="row"><span class="muted">Name</span><b>' + esc(me.name) + '</b></div>' +
          '<div class="row"><span class="muted">Role</span><b>' + esc(ROLE_WORDS[me.role] || 'Team member') + '</b></div>' +
          '<div class="row"><span class="muted">Apprentices group</span><b>' + (me.apprentice ? 'Yes' : 'No') + '</b></div>' +
        '</div></div>' +
        '<div class="section-label">Save it to your phone</div>' +
        '<div class="card"><p><b>iPhone:</b> in Safari, tap the Share button, then "Add to Home Screen."</p>' +
        '<p style="margin-top:10px"><b>Android:</b> in Chrome, tap the three dots, then "Add to Home screen."</p>' +
        '<p class="muted small" style="margin-top:10px">Then open it from the new icon and check that it still greets you by name.</p></div>' +
      '</div>';
    } else {
      var names = { bulletins: 'Bulletins', resources: 'Resources', contact: 'Contact', team: 'Team' };
      html = '<div class="center"><div class="bubble">' + icon(TAB_ICONS[state.tab]) + '</div>' +
        '<h1>' + names[state.tab] + '</h1><p>This screen is coming in a later stage.</p></div>';
    }
    app.innerHTML = html;
    renderTabbar();
    window.scrollTo(0, 0);
  }

  var TAB_ICONS = { home: 'house', bulletins: 'newspaper', resources: 'layout-grid', contact: 'message-circle', team: 'users' };

  function renderTabbar() {
    var tabs = [['home', 'Home'], ['bulletins', 'Bulletins'], ['resources', 'Resources'], ['contact', 'Contact']];
    if (state.me.role === 'admin') tabs.push(['team', 'Team']);
    tabbar.innerHTML = '<div class="tabbar-in">' + tabs.map(function (t) {
      var on = state.tab === t[0];
      var badge = t[0] === 'bulletins' && state.unread > 0
        ? '<span class="count" aria-label="' + state.unread + ' to read">' + state.unread + '</span>' : '';
      return '<button class="tab' + (on ? ' on' : '') + '" data-tab="' + t[0] + '"' + (on ? ' aria-current="page"' : '') + '>' +
        '<span class="ic-wrap">' + icon(TAB_ICONS[t[0]]) + badge + '</span><span>' + t[1] + '</span></button>';
    }).join('') + '</div>';
    tabbar.hidden = false;
  }

  tabbar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    state.tab = b.getAttribute('data-tab');
    renderTab();
  });

  /* ---------- Start ---------- */

  function boot() {
    var fromLink = new URLSearchParams(location.search).get('k') || '';
    state.k = fromLink || stored();
    if (!state.k) { showLinkProblem(); return; }
    showSkeleton();
    api('boot').then(function (res) {
      if (res && res.ok) {
        state.me = res.me;
        state.settings = res.settings || state.settings;
        store(state.k);
        renderTab();
      } else if (res && res.code === 'auth') {
        // A bad link never falls back to a saved one. The link is the source of truth.
        if (!fromLink) store('');
        showLinkProblem();
      } else {
        showOffline();
      }
    }).catch(showOffline);
  }

  boot();
})();
