/* Money Tracker — views & interaction. Pure DOM, no framework.
 * Every control re-renders from MTStore state; events are delegated so
 * re-rendering never loses listeners.
 */
window.MT = window.MT || {};

window.MTUI = (function () {
  'use strict';

  const store = () => window.MTStore;

  /* ---------- inline icons (24px grid, stroke) ---------- */

  const I = (paths) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  const ICONS = {
    expense: I('<path d="M7 7l10 10"/><path d="M17 17v-7"/><path d="M17 17h-7"/>'),
    earnings: I('<path d="M7 17L17 7"/><path d="M17 7h-7"/><path d="M17 7v7"/>'),
    invest: I('<path d="M5 20v-6"/><path d="M12 20V8"/><path d="M19 20v-9"/><path d="M3 20h18"/>'),
    settings: I('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="17" r="2"/>'),
    mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M9 21h6"/>'),
    plus: I('<path d="M12 5v14"/><path d="M5 12h14"/>'),
    trash: I('<path d="M4 7h16"/><path d="M10 7V5h4v2"/><path d="M6 7l1 13h10l1-13"/>'),
    pencil: I('<path d="M4 20h4l12-12-4-4L4 16v4z"/><path d="M13 7l4 4"/>'),
    chevronL: I('<path d="M14 6l-6 6 6 6"/>'),
    chevronR: I('<path d="M10 6l6 6-6 6"/>'),
    download: I('<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
    upload: I('<path d="M12 15V4"/><path d="M7 8l5-4 5 4"/><path d="M4 20h16"/>'),
    x: I('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
    bank: I('<path d="M4 9l8-5 8 5"/><path d="M5 9v9"/><path d="M19 9v9"/><path d="M9.5 12v6"/><path d="M14.5 12v6"/><path d="M3 21h18"/>'),
    card: I('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>'),
    cash: I('<rect x="3" y="7" width="18" height="11" rx="2"/><circle cx="12" cy="12.5" r="2.6"/>'),
    investment: I('<path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/>'),
    spark: I('<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M6.5 6.5l2.5 2.5"/><path d="M15 15l2.5 2.5"/><path d="M17.5 6.5L15 9"/><path d="M9 15l-2.5 2.5"/>'),
    voice: I('<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M5 11a7 7 0 0 0 14 0"/>'),
  };

  const NAV = [
    { id: 'expense', label: 'Expenses', icon: 'expense' },
    { id: 'earnings', label: 'Earnings', icon: 'earnings' },
    { id: 'invest', label: 'Invest', icon: 'invest' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  const TYPE_ICON = { bank: 'bank', credit: 'card', cash: 'cash', investment: 'investment' };

  /* ---------- ui state ---------- */

  const ui = {
    view: 'expense',
    month: store().todayISO().slice(0, 7),
    accountFilter: 'all',
    pendingDelete: null,
  };
  let confirmCallback = null;

  /* ---------- formatting ---------- */

  function fmt(cents, { signed = false } = {}) {
    const currency = store().settings().currency || 'CAD';
    const abs = Math.abs(cents) / 100;
    const f = new Intl.NumberFormat('en-CA', {
      style: 'currency', currency,
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
    const out = f.format(abs);
    if (!signed) return cents < 0 ? '−' + out : out;
    return (cents < 0 ? '−' : '+') + out;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  }
  function monthShort(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-CA', { month: 'short' });
  }
  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function dayLabel(iso) {
    const today = store().todayISO();
    if (iso === today) return 'Today';
    const y = new Date(today + 'T12:00:00'); y.setDate(y.getDate() - 1);
    const yISO = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    if (iso === yISO) return 'Yesterday';
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function kindOfView() {
    if (ui.view === 'expense') return 'expense';
    if (ui.view === 'earnings') return 'income';
    return 'expense';
  }

  /* ---------- toasts ---------- */

  function toast(msg, type) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, 3400);
  }

  /* ---------- modal plumbing ---------- */

  function openModal(html, { onOpen } = {}) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="backdrop" data-close></div><div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    root.hidden = false;
    const focusable = root.querySelector('input, select, button.btn-primary');
    if (focusable) setTimeout(() => focusable.focus(), 30);
    if (onOpen) onOpen(root);
  }
  function closeModal() {
    const root = document.getElementById('modal-root');
    root.hidden = true;
    root.innerHTML = '';
    confirmCallback = null;
  }

  function openConfirm({ title, body, confirmLabel = 'Confirm', danger = false, onConfirm }) {
    confirmCallback = onConfirm;
    openModal(`
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${ICONS.x}</button></div>
      <p class="modal-body-text">${esc(body)}</p>
      <div class="modal-foot">
        <button class="btn" data-close>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-yes>${esc(confirmLabel)}</button>
      </div>`);
  }

  /* ---------- transaction modal (add / edit / voice confirm) ---------- */

  function categoryOptions(kind, selected) {
    return store().categoriesFor(kind)
      .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.label)}</option>`)
      .join('');
  }

  function accountOptions(selected) {
    const accounts = store().accounts();
    if (!accounts.length) return '<option value="">No accounts yet — add one in Settings</option>';
    return '<option value="">Select account…</option>' + accounts
      .map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)} · ${esc(store().accountTypeLabel(a.type))}</option>`)
      .join('');
  }

  /* draft: { id?, kind, amountCents, accountId, categoryId, date, note, raw, accountAmbiguous } */
  function openTxnModal(draft, { source = 'manual' } = {}) {
    draft = draft || {};
    const isEdit = !!draft.id;
    const kind = draft.kind === 'income' ? 'income' : 'expense';
    const accounts = store().accounts();

    if (!accounts.length) {
      openConfirm({
        title: 'Create an account first',
        body: 'Every earning and expense needs an account (bank, credit card, cash). Add one in Settings to get started.',
        confirmLabel: 'Open Settings',
        onConfirm: () => setView('settings'),
      });
      return;
    }

    openModal(`
      <div class="modal-head">
        <h2>${isEdit ? 'Edit entry' : 'Add entry'}</h2>
        <button class="icon-btn" data-close aria-label="Close">${ICONS.x}</button>
      </div>
      ${draft.raw ? `<p class="heard">Heard: &ldquo;${esc(draft.raw)}&rdquo;</p>` : ''}
      <div class="segmented" role="tablist" aria-label="Entry type">
        <button class="seg ${kind === 'expense' ? 'seg-on-expense' : ''}" data-kind="expense" role="tab">Expense</button>
        <button class="seg ${kind === 'income' ? 'seg-on-income' : ''}" data-kind="income" role="tab">Income</button>
      </div>
      <label class="field"><span>Amount</span>
        <input id="f-amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"
          value="${draft.amountCents ? (draft.amountCents / 100).toFixed(2) : ''}">
      </label>
      <label class="field ${draft.accountAmbiguous ? 'field-warn' : ''}"><span>Account <em class="req">required</em></span>
        <select id="f-account">${accountOptions(draft.accountId || store().settings().lastAccountId)}</select>
        ${draft.accountAmbiguous ? '<small class="field-hint">Couldn&rsquo;t tell which account you meant — pick one.</small>' : ''}
      </label>
      <div class="field-row">
        <label class="field"><span>Category</span>
          <select id="f-category">${categoryOptions(kind, draft.categoryId || 'other')}</select>
        </label>
        <label class="field"><span>Date</span>
          <input id="f-date" type="date" value="${draft.date || store().todayISO()}">
        </label>
      </div>
      <label class="field"><span>Note <em class="opt">optional</em></span>
        <input id="f-note" type="text" maxlength="120" placeholder="e.g. Weekly groceries" value="${esc(draft.note || '')}">
      </label>
      <div class="modal-foot">
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" data-save-txn ${isEdit ? `data-id="${draft.id}"` : ''} data-source="${source}">${isEdit ? 'Save changes' : 'Add entry'}</button>
      </div>`, {
      onOpen(root) {
        root.querySelectorAll('[data-kind]').forEach((btn) => {
          btn.addEventListener('click', () => {
            root.querySelectorAll('.seg').forEach((b) => b.classList.remove('seg-on-expense', 'seg-on-income'));
            btn.classList.add(btn.dataset.kind === 'income' ? 'seg-on-income' : 'seg-on-expense');
            const sel = root.querySelector('#f-category');
            sel.innerHTML = categoryOptions(btn.dataset.kind, null);
          });
        });
      },
    });
  }

  function saveTxnFromModal(source, editId) {
    const kind = document.querySelector('#modal-root .seg-on-income') ? 'income' : 'expense';
    const amount = parseFloat(document.getElementById('f-amount').value);
    const accountId = document.getElementById('f-account').value;
    const categoryId = document.getElementById('f-category').value;
    const date = document.getElementById('f-date').value;
    const note = document.getElementById('f-note').value;

    if (!Number.isFinite(amount) || amount <= 0) { toast('Enter an amount greater than zero.', 'bad'); return; }
    if (!accountId) { toast('Pick an account — every entry needs one.', 'bad'); return; }

    const payload = { kind, amountCents: Math.round(amount * 100), accountId, categoryId, date, note, source };
    const res = editId ? store().updateTransaction(editId, payload) : store().addTransaction(payload);
    if (!res.ok) { toast(res.error, 'bad'); return; }
    store().updateSettings({ lastAccountId: accountId });
    closeModal();
    toast(`${kind === 'income' ? 'Added' : 'Logged'} ${fmt(Math.round(amount * 100))}${source === 'voice' ? ' by voice' : ''}.`, 'good');
  }

  /* ---------- account modal ---------- */

  function openAccountModal(account) {
    const isEdit = !!account;
    const typeOpts = store().ACCOUNT_TYPES
      .map((t) => `<option value="${t.id}" ${account && account.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`)
      .join('');
    openModal(`
      <div class="modal-head"><h2>${isEdit ? 'Edit account' : 'Add account'}</h2>
        <button class="icon-btn" data-close aria-label="Close">${ICONS.x}</button></div>
      <label class="field"><span>Name</span>
        <input id="f-acct-name" type="text" maxlength="40" placeholder="e.g. CIBC Current" value="${account ? esc(account.name) : ''}">
      </label>
      <label class="field"><span>Type</span><select id="f-acct-type">${typeOpts}</select></label>
      <div class="modal-foot">
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" data-save-account ${isEdit ? `data-id="${account.id}"` : ''}>${isEdit ? 'Save' : 'Add account'}</button>
      </div>`, {
      onOpen: (root) => setTimeout(() => {
        const el = root.querySelector('#f-acct-name');
        if (el) el.focus(); // modal may have closed before the timer fires
      }, 30),
    });
  }

  /* ---------- guided voice capture ----------
   * One question per step — recognition only answers one narrow thing at a
   * time, far more reliable than parsing a whole sentence. Steps, in order:
   * kind → amount → account ("paid via") → category ("on what") → note.
   * The app speaks each question (toggle in Settings) and opens the mic only
   * after speech ends, so it never transcribes itself. Every step also has
   * tappable chips, and if the FIRST answer is a whole sentence ("spent 25 on
   * coffee from cibc current"), all of it is adopted and answered steps are
   * skipped. Everything still funnels through the same confirm card. */

  const VOICE_ERRORS = {
    'not-allowed': 'Microphone is blocked for this page. Click the permissions (lock/tune) icon in the address bar, allow the microphone, then try again.',
    'service-not-allowed': 'This browser’s speech service refused the mic. Chrome or Edge is the most reliable for voice.',
    'no-speech': 'Didn’t catch anything. Try again, or type it instead.',
    'audio-capture': 'No microphone found. If you have one, check Windows Settings → Privacy & security → Microphone.',
    'mic-busy': 'The microphone is busy or blocked by the OS. Close other apps using it and check mic privacy settings.',
    'aborted': 'Listening stopped before anything was heard.',
    'language-not-supported': 'That voice language isn’t available here — it was retried in English (US). Change it under Settings.',
    'network': 'Voice recognition needs an internet connection in this browser.',
    'unsupported': 'Voice input isn’t supported in this browser (Chrome or Edge works). Typed quick-add below does the same thing.',
    'start-failed': 'Couldn’t start the microphone. Try again.',
    'mic-unknown': 'The microphone request failed before listening could start.',
  };

  function voiceErrorText(code) {
    let msg = VOICE_ERRORS[code] || `Something went wrong with the microphone (code: ${code}).`;
    if (location.protocol === 'file:') {
      msg += ' You opened this file directly — browsers often block the mic on file:// pages without even asking. Serve the folder instead: npx serve . — then open the localhost link.';
    }
    return msg;
  }

  const STEP_COUNT = 5;
  const guided = {
    active: false,
    step: 0,
    misses: 0,
    ambiguous: false,
    answers: { kind: null, amountCents: null, accountId: null, categoryId: null, note: '' },
    heard: {}, // raw transcript per step, echoed in the confirm card
  };

  function fullParseOptions() {
    return {
      accounts: store().accounts(),
      expenseCategories: store().EXPENSE_CATEGORIES,
      incomeCategories: store().INCOME_CATEGORIES,
      defaultKind: kindOfView(),
      today: store().todayISO(),
    };
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function amountWords(cents) {
    const d = Math.floor(cents / 100), c = cents % 100;
    let s = d + (d === 1 ? ' dollar' : ' dollars');
    if (c) s += ' ' + c + (c === 1 ? ' cent' : ' cents');
    return s;
  }

  function guidedQuestion(i) {
    const a = guided.answers;
    switch (i) {
      case 0: return 'Expense or income?';
      case 1: return 'How much?';
      case 2: return a.kind === 'income' ? 'Received in which account?' : 'Paid via which account?';
      case 3: return a.kind === 'income' ? 'Where did it come from?' : 'What was it for?';
      default: return 'Any note?';
    }
  }

  function guidedHint(i) {
    switch (i) {
      case 0: return 'Say “expense” or “income” — or just say the whole entry at once';
      case 1: return 'e.g. “25” · “twenty four fifty” · “2k”';
      case 2: return 'Say the account name — or tap it below';
      case 3: return 'e.g. groceries, gas, salary — or say “skip”';
      default: return 'e.g. “weekly groceries” — or “no note” to skip';
    }
  }

  /* Spoken version of the step: confirms the previous answer, then asks. */
  function guidedSpeech(i) {
    const a = guided.answers;
    let said = '';
    if (i === 1 && a.kind) said = (a.kind === 'income' ? 'Income' : 'Expense') + '. ';
    if (i === 2 && a.amountCents) said = amountWords(a.amountCents) + '. ';
    if (i === 3) { const acct = store().accountById(a.accountId); if (acct) said = acct.name + '. '; }
    if (i === 4 && a.categoryId) said = store().categoryById(a.kind === 'income' ? 'income' : 'expense', a.categoryId).label + '. ';
    let q = guidedQuestion(i);
    if (i === 2) {
      const names = store().accounts().map((x) => x.name);
      if (names.length && names.length <= 3) q += ' ' + names.join(', or ') + '?';
    }
    if (i === 4) q += ' Say "no note" to skip.';
    return said + q;
  }

  function guidedChips(i) {
    const chip = (label, value) => `<button class="chip" data-gchip="${esc(value)}">${esc(label)}</button>`;
    if (i === 0) return chip('Expense', 'kind:expense') + chip('Income', 'kind:income');
    if (i === 2) return store().accounts().map((x) => chip(x.name, 'account:' + x.id)).join('');
    if (i === 3) {
      const kind = guided.answers.kind === 'income' ? 'income' : 'expense';
      return store().categoriesFor(kind).map((c) => chip(c.label, 'category:' + c.id)).join('');
    }
    if (i === 4) return chip('No note', 'note:');
    return '';
  }

  function renderGuidedStep() {
    const ov = document.getElementById('overlay');
    ov.querySelector('.ov-mic').classList.remove('live');
    ov.querySelector('.ov-status').hidden = true;
    ov.querySelector('.ov-guide').hidden = false;
    let dots = '';
    for (let d = 0; d < STEP_COUNT; d++) {
      dots += `<span class="ov-dot ${d < guided.step ? 'done' : d === guided.step ? 'now' : ''}"></span>`;
    }
    ov.querySelector('.ov-dots').innerHTML = dots;
    ov.querySelector('.ov-question').textContent = guidedQuestion(guided.step);
    ov.querySelector('.ov-transcript').textContent = '…';
    const chips = ov.querySelector('.ov-chips');
    chips.innerHTML = guidedChips(guided.step);
    chips.hidden = !chips.innerHTML;
    ov.querySelector('.ov-hint').textContent = guidedHint(guided.step);
    ov.querySelector('[data-step-back]').hidden = guided.step === 0;
    ov.querySelector('[data-listen-done]').hidden = false;
  }

  function guidedAsk(nudge) {
    if (!guided.active) return;
    renderGuidedStep();
    const promptsOn = store().settings().voicePrompts !== false;
    const say = (nudge ? 'Sorry, didn’t catch that. ' : '') + guidedSpeech(guided.step);
    if (promptsOn) window.MTVoice.speak(say, guidedListen);
    else guidedListen();
  }

  function guidedListen() {
    if (!guided.active) return;
    const ov = document.getElementById('overlay');
    window.MTVoice.start({
      lang: store().settings().voiceLang || 'en-CA',
      onState: (s) => {
        if (!guided.active) return;
        if (s === 'requesting') ov.querySelector('.ov-transcript').textContent = 'Asking for microphone access…';
        else if (s === 'listening') ov.querySelector('.ov-mic').classList.add('live');
      },
      onInterim: (t) => { if (guided.active) ov.querySelector('.ov-transcript').textContent = t || '…'; },
      onFinal: (text) => {
        ov.querySelector('.ov-mic').classList.remove('live');
        if (guided.active) guidedAnswer(text);
      },
      onError: (code) => {
        if (!guided.active) return;
        ov.querySelector('.ov-mic').classList.remove('live');
        if (code === 'no-speech') { guidedAsk(true); return; } // same step, gentle retry
        guided.active = false;
        document.getElementById('fab').classList.remove('live');
        guidedError(code);
      },
    });
  }

  const VOICE_CANCEL_WORDS = ['cancel', 'never mind', 'nevermind', 'stop', 'quit', 'forget it'];

  function guidedAnswer(text) {
    if (!guided.active) return;
    const i = guided.step;
    const a = guided.answers;
    const norm = window.MTParser.normalize(text);

    if (VOICE_CANCEL_WORDS.indexOf(norm) !== -1) return cancelGuided();
    if (norm === 'back' || norm === 'go back') {
      if (i > 0) guided.step = i - 1;
      return guidedAsk();
    }

    guided.heard[i] = text.trim();
    let ok = true;

    if (i === 0) {
      const kind = window.MTParser.parseKind(text);
      if (kind) {
        a.kind = kind;
      } else {
        // Did they just say the whole entry at once? Adopt everything it gave.
        const full = window.MTParser.parse(text, fullParseOptions());
        if (full.amountCents || full.accountId || full.categoryId) {
          if (full.kind) a.kind = full.kind;
          a.amountCents = full.amountCents;
          if (full.accountId) { a.accountId = full.accountId; guided.ambiguous = false; }
          if (full.categoryId) a.categoryId = full.categoryId;
          if (full.note) a.note = full.note;
          return advance(guidedNextUnanswered());
        }
        ok = false;
      }
    } else if (i === 1) {
      const cents = window.MTParser.parseAmountCents(text);
      if (cents) a.amountCents = cents; else ok = false;
    } else if (i === 2) {
      const r = accountMatch(text);
      if (r.account) { a.accountId = r.account.id; guided.ambiguous = false; }
      else { if (r.ambiguous) guided.ambiguous = true; ok = false; }
    } else if (i === 3) {
      const cats = store().categoriesFor(a.kind === 'income' ? 'income' : 'expense');
      if (['skip', 'other', 'none', 'no category', 'nothing'].indexOf(norm) !== -1) {
        a.categoryId = 'other';
      } else {
        const id = window.MTParser.matchCategoryGuided(text, cats);
        if (id) a.categoryId = id; else ok = false;
      }
    } else {
      a.note = window.MTParser.noteIsSkipped(text) ? '' : capitalize(text.trim()).slice(0, 120);
      return finishGuided();
    }

    if (ok) return advance(i + 1);
    guided.misses += 1;
    if (guided.misses >= 2) {
      // Stop blocking — leave the field empty; the confirm card forces it.
      if (i === 0 && !a.kind) a.kind = kindOfView();
      return advance(i + 1);
    }
    guidedAsk(true);
  }

  /* Account matching for the guided step — full parse has it internally;
   * here we reuse the full parser with a fake sentence so a bare "current"
   * still resolves against account names and type synonyms. */
  function accountMatch(text) {
    const accounts = store().accounts();
    const full = window.MTParser.parse('x ' + text, fullParseOptions());
    const acct = accounts.find((x) => x.id === full.accountId) || null;
    return { account: acct, ambiguous: !acct && full.accountAmbiguous };
  }

  function guidedNextUnanswered() {
    const a = guided.answers;
    if (!a.kind) return 0;
    if (a.amountCents === null) return 1;
    if (!a.accountId) return 2;
    if (!a.categoryId) return 3;
    if (!a.note) return 4;
    return STEP_COUNT;
  }

  function advance(next) {
    guided.misses = 0;
    if (next >= STEP_COUNT) return finishGuided();
    guided.step = next;
    guidedAsk();
  }

  function finishGuided() {
    const a = guided.answers;
    const heardBits = [];
    for (let k = 0; k < STEP_COUNT; k++) if (guided.heard[k]) heardBits.push(guided.heard[k]);
    const draft = {
      kind: a.kind || kindOfView(),
      amountCents: a.amountCents,
      accountId: a.accountId,
      accountAmbiguous: guided.ambiguous && !a.accountId,
      categoryId: a.categoryId || 'other',
      date: store().todayISO(),
      note: a.note || '',
      raw: heardBits.join(' · '),
    };
    guidedTeardown();
    if (store().settings().voicePrompts !== false) window.MTVoice.speak('Review and save.');
    openTxnModal(draft, { source: 'voice' });
  }

  function guidedTeardown() {
    guided.active = false;
    closeOverlay();
  }

  function cancelGuided() {
    window.MTVoice.cancel();
    guidedTeardown();
  }

  function guidedError(code) {
    const ov = document.getElementById('overlay');
    ov.querySelector('.ov-mic').classList.remove('live');
    ov.querySelector('.ov-guide').hidden = true;
    ov.querySelector('.ov-chips').hidden = true;
    ov.querySelector('[data-step-back]').hidden = true;
    const st = ov.querySelector('.ov-status');
    st.hidden = false;
    st.textContent = 'Voice didn’t work';
    ov.querySelector('.ov-transcript').textContent = voiceErrorText(code);
    ov.querySelector('.ov-hint').textContent = '';
    ov.querySelector('.ov-error-actions').hidden = false;
  }

  function startGuided() {
    if (!window.MTVoice.supported || (!window.isSecureContext && location.protocol === 'http:')) {
      toast(voiceErrorText('unsupported'), 'bad');
      openTxnModal({ kind: kindOfView() });
      return;
    }
    if (!store().accounts().length) {
      openConfirm({
        title: 'Create an account first',
        body: 'Every earning and expense needs an account (bank, credit card, cash). Add one in Settings to get started.',
        confirmLabel: 'Open Settings',
        onConfirm: () => setView('settings'),
      });
      return;
    }
    if (window.MTVoice.isActive()) { window.MTVoice.finish(); return; }

    guided.active = true;
    guided.step = 0;
    guided.misses = 0;
    guided.ambiguous = false;
    guided.answers = { kind: null, amountCents: null, accountId: null, categoryId: null, note: '' };
    guided.heard = {};

    const ov = document.getElementById('overlay');
    ov.hidden = false;
    ov.querySelector('.ov-error-actions').hidden = true;
    document.getElementById('fab').classList.add('live');
    guidedAsk();
  }

  function closeOverlay() {
    const ov = document.getElementById('overlay');
    ov.hidden = true;
    ov.querySelector('.ov-mic').classList.remove('live');
    ov.querySelector('[data-step-back]').hidden = true;
    document.getElementById('fab').classList.remove('live');
  }

  function parseQuickAdd(text) {
    if (!text.trim()) return;
    const draft = window.MTParser.parse(text, fullParseOptions());
    openTxnModal(draft, { source: 'voice' /* shared confirm flow */ });
  }

  /* ---------- stat tiles (dataviz: headline numbers -> KPI tiles) ---------- */

  function tile({ label, cents, prev, upIsGood, emphasized }) {
    let delta = '';
    if (prev > 0) {
      const pct = Math.round(((cents - prev) / prev) * 100);
      if (pct !== 0) {
        const up = pct > 0;
        const good = up === upIsGood;
        delta = `<span class="tile-delta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(pct)}% <span class="tile-vs">vs ${monthShort(shiftMonth(ui.month, -1))}</span></span>`;
      }
    }
    return `<div class="tile ${emphasized ? 'tile-on' : ''}">
      <div class="tile-label">${esc(label)}</div>
      <div class="tile-value">${fmt(cents, { signed: label === 'Net' })}</div>
      ${delta}
    </div>`;
  }

  /* ---------- breakdown bars (horizontal, direct-labeled, fixed hues) ---------- */

  function breakdownCard(kind, month) {
    const { rows, total } = store().breakdown(kind, month, ui.accountFilter === 'all' ? null : ui.accountFilter);
    if (!rows.length) return '';
    const max = rows[0].cents;
    const title = kind === 'expense' ? 'Where it went' : 'Where it came from';
    const scope = kind === 'expense' ? 'spending' : 'earnings';
    const bars = rows.map((r) => {
      const w = Math.max((r.cents / max) * 100, 1.5);
      const pct = Math.round((r.cents / total) * 100);
      return `<div class="bd-row" title="${esc(fmt(r.cents))} · ${pct}% of ${scope} this month">
        <div class="bd-label"><span class="dot" style="background:${r.color}"></span>${esc(r.label)}</div>
        <div class="bd-track"><div class="bd-fill" style="width:${w}%; background:${r.color}"></div>
          <span class="bd-value">${fmt(r.cents)}</span></div>
      </div>`;
    }).join('');
    return `<section class="card"><h3 class="card-title">${title}</h3><div class="bd">${bars}</div></section>`;
  }

  /* ---------- transaction list ---------- */

  function txnListCard(kind, month) {
    const txns = store().txnsInMonth(month, {
      kind,
      accountId: ui.accountFilter === 'all' ? null : ui.accountFilter,
    });
    if (!txns.length) {
      const accts = store().accounts();
      const hintAcct = accts.length ? ` ${kind === 'expense' ? 'from' : 'in'} ${accts[0].name}` : '';
      const spoken = kind === 'expense' ? `Spent 24 on groceries${hintAcct}` : `Earned 1500 salary${hintAcct}`;
      const hint = accts.length
        ? `Tap the mic and say: &ldquo;${esc(spoken)}&rdquo;`
        : 'Add your first account in Settings — every entry needs one.';
      return `<section class="card empty-card">
        <div class="empty-icon">${ICONS.mic}</div>
        <p>Nothing here yet.</p>
        <p class="empty-hint">${hint}</p>
      </section>`;
    }

    const groups = new Map();
    for (const t of txns) {
      if (!groups.has(t.date)) groups.set(t.date, []);
      groups.get(t.date).push(t);
    }

    let html = '';
    for (const [date, items] of groups) {
      const dayTotal = items.reduce((n, t) => n + t.amountCents, 0);
      html += `<div class="day-head"><span>${dayLabel(date)}</span><span class="day-total">${fmt(dayTotal, { signed: false })}</span></div>`;
      for (const t of items) {
        const cat = store().categoryById(t.kind, t.categoryId);
        const acct = store().accountById(t.accountId);
        const name = t.note || cat.label;
        const signCls = t.kind === 'income' ? 'amt-in' : 'amt-out';
        const del = ui.pendingDelete === t.id
          ? `<span class="del-confirm">Delete? <button class="btn btn-danger btn-xs" data-del-yes="${t.id}">Yes</button><button class="btn btn-xs" data-del-no>No</button></span>`
          : `<button class="icon-btn del-btn" data-del-txn="${t.id}" aria-label="Delete entry">${ICONS.trash}</button>`;
        html += `<div class="txn-row" data-txn="${t.id}" role="button" tabindex="0" aria-label="Edit ${esc(name)}">
          <span class="dot dot-lg" style="background:${cat.color}"></span>
          <div class="txn-main">
            <div class="txn-name">${esc(name)}${t.source === 'voice' ? '<span class="src-chip" title="Added by voice">mic</span>' : ''}</div>
            <div class="txn-sub">${esc(cat.label)} · ${esc(acct ? acct.name : 'Unknown account')}</div>
          </div>
          <span class="amt ${signCls}">${t.kind === 'income' ? '+' : '−'}${fmt(t.amountCents)}</span>
          ${del}
        </div>`;
      }
    }
    return `<section class="card list-card">${html}</section>`;
  }

  /* ---------- views ---------- */

  function renderTxnView(kind) {
    const t = store().monthTotals(ui.month, ui.accountFilter === 'all' ? null : ui.accountFilter);
    const p = store().monthTotals(shiftMonth(ui.month, -1), ui.accountFilter === 'all' ? null : ui.accountFilter);
    const accounts = store().accounts();

    const chips = [`<button class="chip ${ui.accountFilter === 'all' ? 'chip-on' : ''}" data-chip="all" aria-pressed="${ui.accountFilter === 'all'}">All accounts</button>`]
      .concat(accounts.map((a) =>
        `<button class="chip ${ui.accountFilter === a.id ? 'chip-on' : ''}" data-chip="${a.id}" aria-pressed="${ui.accountFilter === a.id}">${esc(a.name)}</button>`))
      .join('');

    const firstAcct = accounts[0];
    const example = kind === 'expense'
      ? 'Type or say: spent 24 on groceries' + (firstAcct ? ' from ' + firstAcct.name : '')
      : 'Type or say: earned 1500 salary' + (firstAcct ? ' in ' + firstAcct.name : '');

    return `
      <section class="kpi-row">
        ${tile({ label: kind === 'expense' ? 'Spent' : 'Earned', cents: kind === 'expense' ? t.spent : t.earned, prev: kind === 'expense' ? p.spent : p.earned, upIsGood: kind !== 'expense', emphasized: true })}
        ${tile({ label: kind === 'expense' ? 'Earned' : 'Spent', cents: kind === 'expense' ? t.earned : t.spent, prev: kind === 'expense' ? p.earned : p.spent, upIsGood: kind === 'expense' })}
        ${tile({ label: 'Net', cents: t.net, prev: p.net, upIsGood: true })}
      </section>

      <div class="quickadd">
        <input id="quickadd" type="text" autocomplete="off" spellcheck="false" placeholder="${esc(example)}">
        <button class="icon-btn qa-mic" data-action="qa-mic" aria-label="Add by voice" title="Add by voice">${ICONS.mic}</button>
      </div>

      <div class="chip-row">${chips}</div>

      ${breakdownCard(kind, ui.month)}
      ${txnListCard(kind, ui.month)}`;
  }

  function renderInvest() {
    return `
      <section class="card invest-card">
        <div class="empty-icon">${ICONS.spark}</div>
        <h3 class="invest-title">Invest is coming next</h3>
        <p class="invest-sub">The third module. Planned:</p>
        <ul class="invest-list">
          <li>Holdings tied to your accounts (TFSA, RRSP, brokerage)</li>
          <li>Contributions by voice — &ldquo;invested 500 in TFSA&rdquo;</li>
          <li>Value tracking and a growth chart over time</li>
        </ul>
        <button class="btn" disabled>Add holding — soon</button>
      </section>`;
  }

  function renderSettings() {
    const s = store().settings();
    const accounts = store().accounts();
    const cur = s.currency || 'CAD';
    const lang = s.voiceLang || 'en-CA';

    const acctCards = accounts.map((a) => {
      const bal = store().accountBalanceCents(a.id);
      return `<div class="acct-card">
        <span class="acct-icon">${ICONS[TYPE_ICON[a.type] || 'bank']}</span>
        <div class="acct-main">
          <div class="acct-name">${esc(a.name)}</div>
          <div class="acct-type">${esc(store().accountTypeLabel(a.type))} · ${store().accountRefCount(a.id)} entries</div>
        </div>
        <span class="acct-bal ${bal < 0 ? 'amt-out' : ''}">${fmt(bal, { signed: bal < 0 })}</span>
        <button class="icon-btn" data-acct-edit="${a.id}" aria-label="Edit ${esc(a.name)}">${ICONS.pencil}</button>
        <button class="icon-btn del-btn" data-acct-del="${a.id}" aria-label="Delete ${esc(a.name)}">${ICONS.trash}</button>
      </div>`;
    }).join('');

    return `
      <section class="card">
        <h3 class="card-title">Accounts</h3>
        <p class="card-sub">Every earning and expense is tied to one of these. They are the options everywhere, including voice matching.</p>
        <div class="acct-list">${acctCards || '<p class="empty-hint">No accounts yet.</p>'}</div>
        <button class="btn btn-primary" data-acct-add>Add account</button>
      </section>

      <section class="card">
        <h3 class="card-title">Preferences</h3>
        <div class="field-row">
          <label class="field"><span>Currency</span>
            <select data-setting="currency">
              ${store().CURRENCIES.map((c) => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>Voice language</span>
            <select data-setting="voiceLang">
              ${store().VOICE_LANGS.map((l) => `<option value="${l.id}" ${l.id === lang ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="check-field">
          <input type="checkbox" data-setting-bool="voicePrompts" ${s.voicePrompts !== false ? 'checked' : ''}>
          <span>Speak the guided questions out loud before listening</span>
        </label>
      </section>

      <section class="card">
        <h3 class="card-title">Your data</h3>
        <p class="card-sub">Everything is stored on this device only (browser localStorage). Export a backup before switching browsers or devices.</p>
        <div class="btn-row">
          <button class="btn" data-export>${ICONS.download} Export backup</button>
          <button class="btn" data-import>${ICONS.upload} Import backup</button>
          <button class="btn btn-danger" data-erase>${ICONS.trash} Erase all data</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </section>

      <section class="card">
        <h3 class="card-title">About</h3>
        <p class="card-sub">Money Tracker 1.0 — local-only, no login, no server. Voice input uses your browser&rsquo;s speech service (Chrome / Edge recommended).</p>
      </section>`;
  }

  /* ---------- render ---------- */

  function render() {
    document.querySelectorAll('[data-nav]').forEach((b) => {
      b.classList.toggle('nav-on', b.dataset.nav === ui.view);
      b.setAttribute('aria-current', b.dataset.nav === ui.view ? 'page' : 'false');
    });

    const titles = { expense: 'Expenses', earnings: 'Earnings', invest: 'Invest', settings: 'Settings' };
    document.getElementById('view-title').textContent = titles[ui.view];
    const monthNav = document.getElementById('month-nav');
    const isTxn = ui.view === 'expense' || ui.view === 'earnings';
    monthNav.hidden = !isTxn;
    document.getElementById('month-label').textContent = monthLabel(ui.month);
    document.getElementById('add-btn').hidden = !isTxn;

    const main = document.getElementById('view');
    if (ui.view === 'expense') main.innerHTML = renderTxnView('expense');
    else if (ui.view === 'earnings') main.innerHTML = renderTxnView('income');
    else if (ui.view === 'invest') main.innerHTML = renderInvest();
    else main.innerHTML = renderSettings();
  }

  function setView(v) {
    if (!NAV.some((n) => n.id === v)) return;
    ui.view = v;
    ui.pendingDelete = null;
    if (('#' + v) !== location.hash) history.replaceState(null, '', '#' + v);
    render();
  }

  /* ---------- events ---------- */

  function wire() {
    NAV.forEach((n) => { /* nav buttons are static in index.html */ });

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-nav],[data-action],[data-chip],[data-month],[data-txn],[data-del-txn],[data-del-yes],[data-del-no],[data-acct-add],[data-acct-edit],[data-acct-del],[data-export],[data-import],[data-erase],[data-close],[data-confirm-yes],[data-save-txn],[data-save-account],[data-listen-done],[data-listen-cancel],[data-listen-typed],[data-gchip],[data-step-back]');
      if (!el) return;

      if (el.dataset.nav) return setView(el.dataset.nav);
      if (el.dataset.month) { ui.month = shiftMonth(ui.month, Number(el.dataset.month)); ui.pendingDelete = null; return render(); }
      if (el.dataset.chip) { ui.accountFilter = el.dataset.chip; ui.pendingDelete = null; return render(); }

      if (el.dataset.close !== undefined) return closeModal();
      if (el.dataset.confirmYes !== undefined) { const cb = confirmCallback; closeModal(); if (cb) cb(); return; }

      if (el.dataset.saveTxn !== undefined) return saveTxnFromModal(el.dataset.source || 'manual', el.dataset.id || null);
      if (el.dataset.saveAccount !== undefined) {
        const name = document.getElementById('f-acct-name').value;
        const type = document.getElementById('f-acct-type').value;
        const res = el.dataset.id ? store().updateAccount(el.dataset.id, { name, type }) : store().addAccount({ name, type });
        if (!res.ok) return toast(res.error, 'bad');
        closeModal();
        return toast(el.dataset.id ? 'Account updated.' : `Account “${res.account.name}” added.`, 'good');
      }

      if (el.dataset.delTxn) { ui.pendingDelete = el.dataset.delTxn; return render(); }
      if (el.dataset.delNo !== undefined) { ui.pendingDelete = null; return render(); }
      if (el.dataset.delYes) {
        store().deleteTransaction(el.dataset.delYes);
        ui.pendingDelete = null;
        return toast('Entry deleted.');
      }

      if (el.dataset.txn && !e.target.closest('[data-del-txn],[data-del-yes],[data-del-no]')) {
        const t = store().transactions().find((x) => x.id === el.dataset.txn);
        if (t) openTxnModal({ id: t.id, kind: t.kind, amountCents: t.amountCents, accountId: t.accountId, categoryId: t.categoryId, date: t.date, note: t.note });
        return;
      }

      if (el.dataset.acctAdd !== undefined) return openAccountModal(null);
      if (el.dataset.acctEdit) return openAccountModal(store().accountById(el.dataset.acctEdit));
      if (el.dataset.acctDel) {
        const a = store().accountById(el.dataset.acctDel);
        if (!a) return;
        const count = store().accountRefCount(a.id);
        if (count > 0) return toast(`“${a.name}” has ${count} entries — delete those first.`, 'bad');
        return openConfirm({
          title: 'Delete account',
          body: `Remove “${a.name}”? This cannot be undone.`,
          confirmLabel: 'Delete', danger: true,
          onConfirm: () => { store().deleteAccount(a.id); toast('Account deleted.'); },
        });
      }

      if (el.dataset.export !== undefined) {
        const blob = new Blob([store().exportJSON()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'money-tracker-backup-' + store().todayISO() + '.json';
        a.click();
        URL.revokeObjectURL(url);
        return toast('Backup downloaded.', 'good');
      }
      if (el.dataset.import !== undefined) return document.getElementById('import-file').click();
      if (el.dataset.erase !== undefined) {
        return openConfirm({
          title: 'Erase all data',
          body: 'This deletes every account and entry stored on this device. Export a backup first if you need one.',
          confirmLabel: 'Erase everything', danger: true,
          onConfirm: () => { store().eraseAll(); toast('All data erased. Fresh start.'); },
        });
      }

      if (el.dataset.listenDone !== undefined) { window.MTVoice.finish(); return; }
      if (el.dataset.listenCancel !== undefined) { cancelGuided(); return; }
      if (el.dataset.listenTyped !== undefined) {
        cancelGuided();
        const qa = document.getElementById('quickadd');
        if (qa) qa.focus(); else openTxnModal({ kind: kindOfView() });
        return;
      }

      /* guided-flow controls */
      if (el.dataset.stepBack !== undefined) {
        if (guided.active && guided.step > 0) {
          window.MTVoice.cancel();
          guided.step -= 1;
          guided.misses = 0;
          guidedAsk();
        }
        return;
      }
      if (el.dataset.gchip) {
        if (!guided.active) return;
        const idx = el.dataset.gchip.indexOf(':');
        const field = el.dataset.gchip.slice(0, idx);
        const val = el.dataset.gchip.slice(idx + 1);
        window.MTVoice.cancel(); // stop listening/speaking; guided state survives
        guided.heard[guided.step] = el.textContent.trim();
        if (field === 'kind') guided.answers.kind = val === 'income' ? 'income' : 'expense';
        else if (field === 'account') { guided.answers.accountId = val; guided.ambiguous = false; }
        else if (field === 'category') guided.answers.categoryId = val;
        else if (field === 'note') guided.answers.note = '';
        return advance(guided.step + 1);
      }

      if (el.dataset.action === 'fab-mic' || el.dataset.action === 'qa-mic') return startGuided();
      if (el.dataset.action === 'add-open') return openTxnModal({ kind: kindOfView() });
    });

    /* quick-add Enter */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!document.getElementById('modal-root').hidden) closeModal();
        else if (!document.getElementById('overlay').hidden) cancelGuided();
        return;
      }
      if (e.target.id === 'quickadd' && e.key === 'Enter') {
        parseQuickAdd(e.target.value);
        e.target.value = '';
      }
      if (e.target.id === 'quickadd' && e.key === 'Escape') e.target.blur();
      /* keyboard edit on txn rows */
      if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('txn-row')) {
        e.target.click();
      }
    });

    /* import file pick */
    document.addEventListener('change', (e) => {
      if (e.target.id === 'import-file') {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          openConfirm({
            title: 'Import backup',
            body: `Replace all current data with “${file.name}”? This cannot be undone.`,
            confirmLabel: 'Import',
            onConfirm: () => {
              try {
                const res = store().importJSON(String(reader.result));
                toast(res.ok ? 'Backup imported.' : res.error, res.ok ? 'good' : 'bad');
              } catch (err) {
                toast('That file is not valid JSON.', 'bad');
              }
            },
          });
          e.target.value = '';
        };
        reader.readAsText(file);
      }
      if (e.target.dataset && e.target.dataset.setting) {
        store().updateSettings({ [e.target.dataset.setting]: e.target.value });
        toast('Preference saved.', 'good');
      }
      if (e.target.dataset && e.target.dataset.settingBool) {
        store().updateSettings({ [e.target.dataset.settingBool]: e.target.checked });
        toast('Preference saved.', 'good');
      }
    });
  }

  /* ---------- init ---------- */

  function init() {
    wire();
    store().subscribe(render);
    const hash = (location.hash || '').replace('#', '');
    if (NAV.some((n) => n.id === hash)) ui.view = hash;
    render();
  }

  return { init, setView };
})();
