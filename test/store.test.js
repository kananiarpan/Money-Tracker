/* Store smoke tests under Node with a localStorage shim.
 * Run: node test/store.test.js */
'use strict';

globalThis.window = globalThis;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

require('../js/store.js');
const S = globalThis.MTStore;
const assert = require('assert');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + e.message); }
}

console.log('— store —');
S.load();

check('seeds CIBC Current + CIBC Savings', () => {
  const names = S.accounts().map((a) => a.name);
  assert.deepStrictEqual(names, ['CIBC Current', 'CIBC Savings']);
  assert.strictEqual(S.accounts()[0].type, 'bank');
});

const current = () => S.accounts().find((a) => a.name === 'CIBC Current');
const savings = () => S.accounts().find((a) => a.name === 'CIBC Savings');
const ym = S.todayISO().slice(0, 7);

check('rejects entry without account', () => {
  const res = S.addTransaction({ kind: 'expense', amountCents: 2400, accountId: 'nope', date: S.todayISO() });
  assert.strictEqual(res.ok, false);
});

check('rejects zero/negative amount', () => {
  const res = S.addTransaction({ kind: 'expense', amountCents: 0, accountId: current().id, date: S.todayISO() });
  assert.strictEqual(res.ok, false);
});

check('expense lowers account balance', () => {
  S.addTransaction({ kind: 'expense', amountCents: 2400, accountId: current().id, categoryId: 'groceries', date: S.todayISO(), note: 'test' });
  assert.strictEqual(S.accountBalanceCents(current().id), -2400);
});

check('income raises account balance', () => {
  S.addTransaction({ kind: 'income', amountCents: 150000, accountId: savings().id, categoryId: 'salary', date: S.todayISO() });
  assert.strictEqual(S.accountBalanceCents(savings().id), 150000);
});

check('monthTotals aggregates', () => {
  const t = S.monthTotals(ym);
  assert.strictEqual(t.spent, 2400);
  assert.strictEqual(t.earned, 150000);
  assert.strictEqual(t.net, 147600);
});

check('breakdown groups by category', () => {
  const { rows, total } = S.breakdown('expense', ym);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, 'groceries');
  assert.strictEqual(total, 2400);
});

check('updateTransaction edits amount', () => {
  const t = S.txnsInMonth(ym, { kind: 'expense' })[0];
  S.updateTransaction(t.id, { amountCents: 3000 });
  assert.strictEqual(S.accountBalanceCents(current().id), -3000);
});

check('account in use cannot be deleted', () => {
  const res = S.deleteAccount(current().id);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'in-use');
});

check('duplicate account name rejected', () => {
  assert.strictEqual(S.addAccount({ name: 'cibc current', type: 'bank' }).ok, false);
});

check('export/import round-trips', () => {
  const dump = S.exportJSON();
  const before = S.transactions().length;
  assert.strictEqual(S.importJSON(dump).ok, true);
  assert.strictEqual(S.transactions().length, before);
  assert.strictEqual(S.accounts().length, 2);
});

check('import rejects garbage', () => {
  assert.strictEqual(S.importJSON('{"hello":1}').ok, false);
});

check('eraseAll reseeds defaults', () => {
  S.eraseAll();
  assert.strictEqual(S.transactions().length, 0);
  assert.strictEqual(S.accounts().length, 2);
});

check('settings update validates input', () => {
  S.updateSettings({ currency: 'USD' });
  assert.strictEqual(S.settings().currency, 'USD');
  S.updateSettings({ currency: 'XXX' });
  assert.strictEqual(S.settings().currency, 'USD');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
