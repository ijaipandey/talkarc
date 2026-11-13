/* PenMuse AI chatbot - interface + per-user history. AI replies stay off until
   billing approval: when disabled, messages are saved to history and the
   assistant answers with an honest status notice. No fake AI output. */
(function () {
  var PAGE = location.pathname.replace(/^\//, '').replace('.html', '') || 'index';
  function request(url, options) {
    return window.penmuseAuth && penmuseAuth.localMode ? penmuseAuth.localFetch(url, options) : fetch(url, options);
  }
  var CONTEXT = {
    'index': ['What can PenMuse do?', 'Help me plan my first week of posts', 'What is the Post Studio?'],
    'dashboard': ['Suggest a productivity routine', 'What should I set up first?', 'Review my content plan'],
    'studio': ['Give me a hook idea for my next post', 'Improve this draft', 'Suggest hashtags for my niche'],
    'planner': ['Build me a weekly content calendar', 'What should I post this week?', 'Best posting times for LinkedIn'],
    'page-editor': ['Improve my bio', 'Write a tagline for my page', 'Personal branding tips'],
    'pricing': ['Explain the plans', 'What does Pro include?', 'Is there a free plan?'],
    'explore': ['How do creator pages work?', 'How do I get discovered?'],
    'integrations': ['Which integrations are planned?', 'When can I connect YouTube?']
  };
  var sugg = CONTEXT[PAGE] || ['What can you help with?', 'Content ideas for this week'];

  var state = { open: false, max: false, min: false, settings: false, history: [], historyReady: false, clearing: false, prefs: {}, user: null, enabled: false, signedIn: false };

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

  /* Local calendar date as YYYY-MM-DD (toISOString is UTC - CC-02). */
  function localISODate(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  var fab = el('button', 'pm-ai-fab', '<img src="assets/penmuse-mark.svg" alt=""><span class="pm-ai-dot"></span>');
  fab.setAttribute('aria-label', 'Open PenMuse AI assistant');
  fab.setAttribute('aria-expanded', 'false');

  var panel = el('div', 'pm-ai-panel');
  panel.innerHTML =
    '<div class="pm-ai-head">' +
      '<img src="assets/penmuse-mark.svg" alt="">' +
      '<span class="pm-ai-title">PenMuse AI</span>' +
      '<span class="pm-ai-status">AI off</span>' +
      '<button data-act="settings" title="Assistant settings" aria-label="Assistant settings">&#9881;</button>' +
      '<button data-act="new" title="New chat" aria-label="New chat">+</button>' +
      '<button data-act="clear" title="Clear conversation" aria-label="Clear conversation">&#128465;</button>' +
      '<button data-act="min" title="Minimise" aria-label="Minimise">&#8211;</button>' +
      '<button data-act="max" title="Maximise" aria-label="Maximise">&#9634;</button>' +
      '<button data-act="close" title="Close" aria-label="Close">&times;</button>' +
    '</div>' +
    '<div class="pm-ai-sync" role="status" aria-live="polite"></div>' +
    '<div class="pm-ai-settings">' +
      '<label>Preferred tone</label><input data-pref="tone" placeholder="e.g. professional, casual">' +
      '<label>Language</label><input data-pref="language" placeholder="e.g. English, Hindi">' +
      '<label>Content niche</label><input data-pref="niche" placeholder="e.g. tech, fitness, finance">' +
      '<label>Target audience</label><input data-pref="audience" placeholder="e.g. early-stage founders">' +
      '<label>Writing style</label><input data-pref="style" placeholder="e.g. short punchy sentences">' +
      '<button class="pm-ai-save">Save preferences</button>' +
    '</div>' +
    '<div class="pm-ai-body"></div>' +
    '<div class="pm-ai-typing">PenMuse AI is typing <span>.</span><span>.</span><span>.</span></div>' +
    '<div class="pm-ai-sugg"></div>' +
    '<div class="pm-ai-inputbar"><textarea placeholder="Ask PenMuse AI..." rows="1"></textarea><button class="pm-ai-send">Send</button></div>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var body = panel.querySelector('.pm-ai-body');
  var typing = panel.querySelector('.pm-ai-typing');
  var input = panel.querySelector('textarea');
  var statusPill = panel.querySelector('.pm-ai-status');
  var suggBar = panel.querySelector('.pm-ai-sugg');
  var settingsView = panel.querySelector('.pm-ai-settings');
  function fillSettings() {
    ['tone','language','niche','audience','style'].forEach(function (k) { settingsView.querySelector('[data-pref="' + k + '"]').value = state.prefs[k] || ''; });
  }
  var syncStatus = panel.querySelector('.pm-ai-sync');
  if (window.penmuseAuth && penmuseAuth.localMode) statusPill.textContent = 'Local helper';
  var saveChain = Promise.resolve();
  function syncMessage(message, failed) {
    syncStatus.textContent = message;
    syncStatus.classList.toggle('error', !!failed);
  }

  sugg.forEach(function (s) {
    var b = el('button', '', s);
    b.onclick = function () { input.value = s; send(); };
    suggBar.appendChild(b);
  });

  function jwt() {
    var u = window.penmuseAuth && penmuseAuth.currentUser();
    return u ? u.jwt() : Promise.resolve(null);
  }

  function render() {
    body.innerHTML = '';
    if (!state.history.length) {
      body.appendChild(el('div', 'pm-ai-msg assistant pm-ai-notice',
        'Hi! I am PenMuse AI, your creative assistant. AI replies are switched off until the site owner approves billing. Log in to keep private notes. Messages save to your account only while connected; check the save status before leaving.'));
    }
    state.history.forEach(function (m) {
      var d = el('div', 'pm-ai-msg ' + m.role);
      d.textContent = m.text;
      if (m.role === 'assistant' && !m.notice) {
        var acts = el('div', 'pm-ai-actions');
        var cp = el('button', '', 'Copy'); cp.onclick = function () { navigator.clipboard.writeText(m.text); cp.textContent = 'Copied'; setTimeout(function(){ cp.textContent = 'Copy'; }, 1200); };
        var rg = el('button', '', 'Regenerate'); rg.onclick = function () { regenerate(); };
        acts.appendChild(cp); acts.appendChild(rg);
        /* Writing actions: hand AI text to a workspace tool. Always confirm
           before replacing existing content; nothing publishes automatically. */
        [['Send to Studio', 'studio'], ['Save to Planner', 'planner'], ['Use as bio', 'bio']].forEach(function (pair) {
          var b = el('button', '', pair[0]);
          b.onclick = function () { sendTo(pair[1], m.text); };
          acts.appendChild(b);
        });
        d.appendChild(acts);
      }
      body.appendChild(d);
    });
    body.scrollTop = body.scrollHeight;
  }

  function writeChat(payload) {
    syncMessage(window.penmuseAuth && penmuseAuth.localMode ? 'Saving in this browser...' : 'Saving to your account...', false);
    var pending = saveChain.catch(function () {}).then(function () {
      return jwt().then(function (t) {
        if (!t) throw new Error('not-signed-in');
        return request(window.PENMUSE_FN.chatdata, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(payload) });
      }).then(function (r) {
        if (!r.ok) throw new Error('sync-failed');
        syncMessage(payload.history ? (window.penmuseAuth && penmuseAuth.localMode ? 'Conversation saved in this browser.' : 'Conversation saved to your account.') : (window.penmuseAuth && penmuseAuth.localMode ? 'Preferences saved in this browser.' : 'Preferences saved to your account.'), false);
      });
    });
    saveChain = pending.catch(function () { syncMessage('Not saved to your account. Keep this chat open and copy any notes before leaving; reconnect and try again.', true); });
    return pending;
  }

  function save() {
    return writeChat({ history: state.history.slice() }).catch(function () {});
  }

  function push(role, text, notice) {
    state.history.push({ role: role, text: text, notice: !!notice, ts: Date.now() });
    render(); save();
  }

  function regenerate() {
    var lastUser = null;
    for (var i = state.history.length - 1; i >= 0; i--) if (state.history[i].role === 'user') { lastUser = state.history[i].text; break; }
    if (lastUser) answer(lastUser, true);
  }

  function answer(_text, _isRegen) {
    typing.classList.add('on');
    body.scrollTop = body.scrollHeight;
    jwt().then(function (t) {
      if (!t) {
        typing.classList.remove('on');
        push('assistant', 'Log in to chat with me - your history is saved privately to your account.', true);
        return;
      }
      request(window.PENMUSE_FN.chat, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ messages: state.history.slice(-20).map(function (m) { return { role: m.role, text: m.text }; }), prefs: state.prefs, page: PAGE }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          typing.classList.remove('on');
          if (res.ok && res.j.reply) { push('assistant', res.j.reply); return; }
          if (res.j.error === 'ai-disabled-pending-billing-approval' || res.j.error === 'ai-not-configured') {
            push('assistant', 'AI replies are off until the site owner approves billing. Check the save status above before leaving or reloading this chat.', true);
          } else if (res.j.error === 'daily-limit' || res.j.error === 'global-daily-limit') {
            push('assistant', 'You have hit today\'s AI usage limit. It resets at midnight UTC.', true);
          } else {
            push('assistant', 'Something went wrong on my side. Please try again in a moment.', true);
          }
        })
        .catch(function () { typing.classList.remove('on'); push('assistant', 'Network error - check your connection and try again.', true); });
    });
  }


  function sendTo(target, text) {
    if (target === 'studio') {
      /* Studio topic field: only prefill if empty, else confirm replace. */
      var t = document.querySelector('#studio-form textarea, #studio-form input[type="text"]');
      if (!t) { location.href = 'studio.html'; return; }
      if (t.value.trim() && !confirm('Replace the current Studio topic with this text?')) return;
      t.value = text; t.dispatchEvent(new Event('input', { bubbles: true }));
      t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (target === 'planner') {
      if (!confirm('Save this as a new draft post in your Content Planner?')) return;
      jwt().then(function (tok) {
        if (!tok) { alert('Log in to save to your planner.'); return; }
        request(window.PENMUSE_FN.planner, { headers: { Authorization: 'Bearer ' + tok } })
          .then(function (r) { if (!r.ok) throw new Error('read-failed'); return r.json(); })
          .then(function (posts) {
            if (!Array.isArray(posts)) throw new Error('invalid-posts');
            posts.push({ id: 'p' + Date.now(), title: text.split('\n')[0].slice(0, 90) || 'AI draft', platform: 'LinkedIn', date: localISODate(), status: 'Draft', notes: text.slice(0, 900) });
            return request(window.PENMUSE_FN.planner, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(posts) });
          })
          .then(function (r) { alert(r.ok ? 'Saved to your planner as a draft.' : 'Could not save - try again.'); })
          .catch(function () { alert('Could not save to your planner. Nothing was changed; reconnect and try again.'); });
      });
      return;
    }
    if (target === 'bio') {
      /* Page editor bio field: only with explicit confirmation if it has content. */
      var bio = document.querySelector('#f-bio, textarea[name="bio"], #bio');
      if (!bio) { location.href = 'page-editor.html'; return; }
      if (bio.value.trim() && !confirm('Replace your current bio with this text?')) return;
      bio.value = text; bio.dispatchEvent(new Event('input', { bubbles: true }));
      bio.scrollIntoView({ behavior: 'smooth', block: 'center' });
      alert('Bio field updated. Remember to save your page.');
      return;
    }
  }

  function send() {
    var text = input.value.trim();
    if (!text) return;
    if (!window.penmuseAuth || !penmuseAuth.currentUser()) {
      syncMessage('Log in before sending. Your draft has not been sent or saved.', true);
      return;
    }
    if (state.clearing) { syncMessage('Wait for the conversation to finish clearing. Your draft is still here.', false); return; }
    if (!state.historyReady) {
      syncMessage('Saved history is unavailable. Close and reopen chat before sending; your draft is still here.', true);
      return;
    }
    input.value = '';
    push('user', text);
    answer(text);
  }

  panel.querySelector('.pm-ai-send').onclick = send;
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  panel.querySelector('.pm-ai-head').addEventListener('click', function (e) {
    var act = e.target.getAttribute('data-act');
    if (!act) return;
    if (act === 'close') { closePanel(); }
    if (act === 'max') { state.max = !state.max; panel.classList.toggle('max', state.max); }
    if (act === 'min') { state.min = !state.min; panel.classList.toggle('min', state.min); }
    if (act === 'settings') {
      state.settings = !state.settings;
      settingsView.classList.toggle('on', state.settings);
      body.style.display = state.settings ? 'none' : '';
      if (state.settings) fillSettings();
    }
    if (act === 'new' || act === 'clear') {
      if (state.clearing) return;
      var doIt = confirm(act === 'new'
        ? 'Start a new chat? This deletes the current conversation - it cannot be undone.'
        : 'Clear this conversation? This cannot be undone.');
      if (doIt) {
        if (!state.historyReady) { syncMessage('Saved history is unavailable. Nothing was removed; close and reopen chat to retry.', true); return; }
        state.clearing = true;
        syncMessage('Clearing the saved conversation...', false);
        saveChain = saveChain.catch(function () {}).then(function () {
          return jwt().then(function (t) {
            if (!t) throw new Error('not-signed-in');
            return request(window.PENMUSE_FN.chatdata, { method: 'DELETE', headers: { Authorization: 'Bearer ' + t } });
          }).then(function (r) {
            if (!r.ok) throw new Error('clear-failed');
            state.history = []; render(); syncMessage('Conversation cleared from your account.', false);
          });
        }).catch(function () { syncMessage('Could not clear the saved conversation. Nothing was removed; reconnect and try again.', true); })
          .then(function () { state.clearing = false; });
      }
    }
  });

  settingsView.querySelector('.pm-ai-save').onclick = function () {
    var btn = this;
    if (state.clearing) { syncMessage('Wait for the conversation to finish clearing, then save preferences.', false); return; }
    if (state.signedIn && !state.historyReady) { syncMessage('Still loading your saved preferences - try again in a moment.', false); return; }
    var prefs = {};
    ['tone','language','niche','audience','style'].forEach(function (k) { prefs[k] = settingsView.querySelector('[data-pref="' + k + '"]').value.trim(); });
    btn.disabled = true; btn.textContent = 'Saving...';
    writeChat({ prefs: prefs }).then(function () {
      state.prefs = prefs;
      btn.textContent = 'Saved';
    }).catch(function () { btn.textContent = 'Not saved - try again'; })
      .then(function () { btn.disabled = false; });
  };

  function closePanel() {
    panel.classList.remove('open');
    state.open = false;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open) { e.preventDefault(); closePanel(); }
  });
  fab.onclick = function () {
    state.open = !state.open;
    panel.classList.toggle('open', state.open);
    fab.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    if (state.open) input.focus();
    if (state.open && !state.loaded) {
      state.loaded = true;
      jwt().then(function (t) {
        state.signedIn = !!t;
        if (!t) { render(); return; }
        request(window.PENMUSE_FN.chatdata, { headers: { Authorization: 'Bearer ' + t } })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (!j) throw new Error('load-failed');
            state.history = j.history || []; state.prefs = j.prefs || {}; state.historyReady = true; render();
            if (state.settings) fillSettings();
          }).catch(function () {
            state.loaded = false; state.historyReady = false;
            syncMessage('Could not load saved history. Close and reopen this chat when connected to try again.', true);
          });
      });
      request(window.PENMUSE_FN.chat).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.enabled) { statusPill.textContent = 'AI on'; statusPill.style.background = 'rgba(52,211,153,.15)'; statusPill.style.color = '#34D399'; statusPill.style.borderColor = 'rgba(52,211,153,.35)'; }
      }).catch(function () {});
    }
    if (state.open) render();
  };

  render();
})();
