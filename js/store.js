/* Money Tracker — data layer.
 * Everything lives in localStorage under one key. No server, no db, no login.
 * Amounts are stored as integer cents to avoid floating-point drift.
 */
window.MT = window.MT || {};

window.MTStore = (function () {
  'use strict';

  const DB_KEY = 'moneyTracker.v1';

  const ACCOUNT_TYPES = [
    { id: 'bank',       label: 'Bank account' },
    { id: 'credit',     label: 'Credit card' },
    { id: 'cash',       label: 'Cash' },
    { id: 'investment', label: 'Investment' },
  ];

  /* Category colors: dataviz categorical ramp (dark steps, validated against
   * surface #15181e — all 8 checks pass). Assigned to category ids in a FIXED
   * order, never by rank, never cycled. Non-categorical "Other" uses neutral
   * ink, not a generated 9th hue. */
  const EXPENSE_CATEGORIES = [
    { id: 'groceries',     label: 'Groceries',         color: '#3987e5', kw: ['grocery', 'groceries', 'supermarket', 'walmart', 'costco', 'loblaws', 'no frills', 'food basics', 'metro'] },
    { id: 'dining',        label: 'Food & dining',     color: '#d95926', kw: ['restaurant', 'coffee', 'lunch', 'dinner', 'breakfast', 'tim hortons', 'tims', 'mcdonalds', 'starbucks', 'pizza', 'takeout', 'take out', 'uber eats', 'doordash', 'skip the dishes'] },
    { id: 'transport',     label: 'Transport',         color: '#199e70', kw: ['uber', 'lyft', 'gas', 'fuel', 'petrol', 'ttc', 'presto', 'transit', 'parking', 'taxi', 'go train', 'train'] },
    { id: 'housing',       label: 'Rent & housing',    color: '#c98500', kw: ['rent', 'mortgage', 'condo fee', 'maintenance fee', 'hydro'] },
    { id: 'shopping',      label: 'Shopping',          color: '#d55181', kw: ['clothes', 'clothing', 'amazon', 'shoes', 'electronics', 'best buy', 'ikea', 'shopping'] },
    { id: 'entertainment', label: 'Entertainment',     color: '#008300', kw: ['movie', 'movies', 'netflix', 'spotify', 'game', 'games', 'steam', 'concert', 'subscription', 'disney'] },
    { id: 'utilities',     label: 'Bills & utilities', color: '#9085e9', kw: ['internet', 'wifi', 'wi-fi', 'phone bill', 'mobile', 'electricity', 'water bill', 'rogers', 'bell', 'telus', 'insurance', 'fido', 'koodo', 'bill'] },
    { id: 'health',        label: 'Health',            color: '#e66767', kw: ['pharmacy', 'medicine', 'medication', 'doctor', 'dentist', 'gym', 'shoppers', 'clinic'] },
    { id: 'other',         label: 'Other',             color: '#6b7280', kw: ['fee', 'fees', 'charge', 'atm'] },
  ];

  const INCOME_CATEGORIES = [
    { id: 'salary',    label: 'Salary',    color: '#3987e5', kw: ['salary', 'paycheck', 'pay cheque', 'wages', 'payroll', 'payday', 'pay day'] },
    { id: 'freelance', label: 'Freelance', color: '#d95926', kw: ['freelance', 'contract', 'invoice', 'client', 'gig', 'consulting'] },
    { id: 'refund',    label: 'Refund',    color: '#199e70', kw: ['refund', 'cashback', 'cash back', 'rebate', 'reimbursement', 'returned'] },
    { id: 'interest',  label: 'Interest',  color: '#c98500', kw: ['interest', 'dividend', 'dividends'] },
    { id: 'gift',      label: 'Gift',      color: '#d55181', kw: ['gift', 'birthday money'] },
    { id: 'other',     label: 'Other',     color: '#6b7280', kw: [] },
  ];

  const CURRENCIES = [
    { id: 'CAD', label: 'CAD — Canadian dollar' },
    { id: 'USD', label: 'USD — US dollar' },
    { id: 'INR', label: 'INR — Indian rupee' },
    { id: 'EUR', label: 'EUR — Euro' },
    { id: 'GBP', label: 'GBP — British pound' },
  ];

  const VOICE_LANGS = [
    { id: 'en-CA', label: 'English (Canada)' },
    { id: 'en-US', label: 'English (US)' },
    { id: 'en-GB', label: 'English (UK)' },
    { id: 'en-IN', label: 'English (India)' },
  ];

  /* ---------- helpers ---------- */

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  function dateISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayISO() { return dateISO(new Date()); }

  /* ---------- state ---------- */

  function defaultState() {
    const now = new Date().toISOString();
    return {
      accounts: [
        { id: uid(), name: 'CIBC Current', type: 'bank', createdAt: now },
        { id: uid(), name: 'CIBC Savings', type: 'bank', createdAt: now },
      ],
      transactions: [],
      settings: { currency: 'CAD', voiceLang: 'en-CA' },
    };
  }

  let state = null;
  const listeners = new Set();

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }
  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(state)); }
    catch (e) { console.error('Could not persist (storage full or blocked):', e); }
  }
  function commit() { save(); emit(); }

  function load() {
    let fresh = false;
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.accounts)) throw new Error('unexpected shape');
        state = parsed;
      } else {
        state = defaultState();
        fresh = true;
      }
    } catch (e) {
      console.warn('Stored data unreadable, starting fresh.', e);
      state = defaultState();
      fresh = true;
    }
    if (!Array.isArray(state.transactions)) state.transactions = [];
    if (!state.settings || typeof state.settings !== 'object') state.settings = { currency: 'CAD', voiceLang: 'en-CA' };
    if (!state.settings.currency) state.settings.currency = 'CAD';
    if (!state.settings.voiceLang) state.settings.voiceLang = 'en-CA';
    save();
    return fresh;
  }

  /* ---------- accounts ---------- */

  function addAccount({ name, type }) {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, error: 'Account needs a name.' };
    if (!ACCOUNT_TYPES.some((t) => t.id === type)) type = 'bank';
    if (state.accounts.some((a) => a.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: 'An account with that name already exists.' };
    }
    const account = { id: uid(), name: clean, type, createdAt: new Date().toISOString() };
    state.accounts.push(account);
    commit();
    return { ok: true, account };
  }

  function updateAccount(id, patch) {
    const a = state.accounts.find((x) => x.id === id);
    if (!a) return { ok: false, error: 'Account not found.' };
    if (patch.name !== undefined) {
      const clean = String(patch.name).trim();
      if (!clean) return { ok: false, error: 'Account needs a name.' };
      a.name = clean;
    }
    if (patch.type !== undefined && ACCOUNT_TYPES.some((t) => t.id === patch.type)) a.type = patch.type;
    commit();
    return { ok: true, account: a };
  }

  function accountRefCount(id) {
    return state.transactions.reduce((n, t) => n + (t.accountId === id ? 1 : 0), 0);
  }

  function deleteAccount(id) {
    const refs = accountRefCount(id);
    if (refs > 0) return { ok: false, error: 'in-use', count: refs };
    state.accounts = state.accounts.filter((a) => a.id !== id);
    commit();
    return { ok: true };
  }

  /* ---------- transactions (all amounts integer cents) ---------- */

  function addTransaction({ kind, amountCents, accountId, categoryId, date, note, source }) {
    if (kind !== 'expense' && kind !== 'income') return { ok: false, error: 'Kind must be expense or income.' };
    amountCents = Math.round(Number(amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (!state.accounts.some((a) => a.id === accountId)) return { ok: false, error: 'Pick an account first.' };
    const txn = {
      id: uid(),
      kind,
      amountCents,
      accountId,
      categoryId: categoryId || 'other',
      date: date || todayISO(),
      note: String(note || '').trim().slice(0, 120),
      source: source === 'voice' ? 'voice' : 'manual',
      createdAt: new Date().toISOString(),
    };
    state.transactions.push(txn);
    commit();
    return { ok: true, txn };
  }

  function updateTransaction(id, patch) {
    const t = state.transactions.find((x) => x.id === id);
    if (!t) return { ok: false, error: 'Entry not found.' };
    if (patch.kind === 'expense' || patch.kind === 'income') t.kind = patch.kind;
    if (patch.amountCents !== undefined) {
      const cents = Math.round(Number(patch.amountCents));
      if (Number.isFinite(cents) && cents > 0) t.amountCents = cents;
    }
    if (patch.accountId !== undefined && state.accounts.some((a) => a.id === patch.accountId)) t.accountId = patch.accountId;
    if (patch.categoryId !== undefined) t.categoryId = patch.categoryId;
    if (patch.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(patch.date)) t.date = patch.date;
    if (patch.note !== undefined) t.note = String(patch.note).trim().slice(0, 120);
    commit();
    return { ok: true, txn: t };
  }

  function deleteTransaction(id) {
    state.transactions = state.transactions.filter((t) => t.id !== id);
    commit();
  }

  /* ---------- selectors ---------- */

  const accounts = () => state.accounts.slice();
  const accountById = (id) => state.accounts.find((a) => a.id === id) || null;
  const settings = () => Object.assign({}, state.settings);
  const transactions = () => state.transactions.slice();

  function categoriesFor(kind) { return kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES; }
  function categoryById(kind, id) {
    return categoriesFor(kind).find((c) => c.id === id) || { id: 'other', label: 'Other', color: '#6b7280', kw: [] };
  }
  function accountTypeLabel(type) {
    const t = ACCOUNT_TYPES.find((x) => x.id === type);
    return t ? t.label : type;
  }

  function txnsInMonth(month, { kind = null, accountId = null } = {}) {
    return state.transactions
      .filter((t) => t.date.startsWith(month))
      .filter((t) => !kind || t.kind === kind)
      .filter((t) => !accountId || t.accountId === accountId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
  }

  function monthTotals(month, accountId = null) {
    let earned = 0, spent = 0;
    for (const t of state.transactions) {
      if (!t.date.startsWith(month)) continue;
      if (accountId && t.accountId !== accountId) continue;
      if (t.kind === 'income') earned += t.amountCents; else spent += t.amountCents;
    }
    return { earned, spent, net: earned - spent };
  }

  /* Breakdown respecting the dataviz series ladder: top 7 categories + a
   * folded "Everything else" row, so a chart never shows more than 8 series. */
  function breakdown(kind, month, accountId = null) {
    const sums = new Map();
    for (const t of state.transactions) {
      if (t.kind !== kind || !t.date.startsWith(month)) continue;
      if (accountId && t.accountId !== accountId) continue;
      sums.set(t.categoryId, (sums.get(t.categoryId) || 0) + t.amountCents);
    }
    const rows = [...sums.entries()].map(([id, cents]) => {
      const cat = categoryById(kind, id);
      return { id, label: cat.label, color: cat.color, cents };
    }).sort((a, b) => b.cents - a.cents);

    const total = rows.reduce((n, r) => n + r.cents, 0);
    if (rows.length <= 8) return { rows, total };
    const head = rows.slice(0, 7);
    const tail = rows.slice(7);
    head.push({
      id: '__rest',
      label: 'Everything else',
      color: '#6b7280',
      cents: tail.reduce((n, r) => n + r.cents, 0),
    });
    return { rows: head, total };
  }

  function accountBalanceCents(accountId) {
    let bal = 0;
    for (const t of state.transactions) {
      if (t.accountId !== accountId) continue;
      bal += t.kind === 'income' ? t.amountCents : -t.amountCents;
    }
    return bal;
  }

  /* ---------- settings & data ops ---------- */

  function updateSettings(patch) {
    if (patch.currency && CURRENCIES.some((c) => c.id === patch.currency)) state.settings.currency = patch.currency;
    if (patch.voiceLang && VOICE_LANGS.some((l) => l.id === patch.voiceLang)) state.settings.voiceLang = patch.voiceLang;
    const last = state.accounts.find((a) => a.id === patch.lastAccountId);
    if (last) state.settings.lastAccountId = last.id;
    commit();
  }

  function exportJSON() { return JSON.stringify(state, null, 2); }

  function importJSON(text) {
    const data = JSON.parse(text); // throws on bad JSON
    if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
      return { ok: false, error: 'That file does not look like a Money Tracker backup.' };
    }
    for (const a of data.accounts) {
      if (!a.id || !a.name) return { ok: false, error: 'Backup contains an invalid account.' };
    }
    for (const t of data.transactions) {
      if (!t.id || !t.kind || !Number.isFinite(t.amountCents) || !t.accountId || !t.date) {
        return { ok: false, error: 'Backup contains an invalid entry.' };
      }
    }
    state = {
      accounts: data.accounts,
      transactions: data.transactions,
      settings: Object.assign({ currency: 'CAD', voiceLang: 'en-CA' }, data.settings || {}),
    };
    commit();
    return { ok: true };
  }

  function eraseAll() {
    state = defaultState();
    commit();
  }

  return {
    ACCOUNT_TYPES, EXPENSE_CATEGORIES, INCOME_CATEGORIES, CURRENCIES, VOICE_LANGS,
    load, subscribe, emit,
    addAccount, updateAccount, deleteAccount, accountRefCount,
    addTransaction, updateTransaction, deleteTransaction,
    accounts, accountById, settings, transactions,
    categoriesFor, categoryById, accountTypeLabel,
    txnsInMonth, monthTotals, breakdown, accountBalanceCents,
    updateSettings, exportJSON, importJSON, eraseAll,
    todayISO,
  };
})();
