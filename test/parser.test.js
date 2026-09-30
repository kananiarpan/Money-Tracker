/* Parser test suite — plain Node, no deps. Run: node test/parser.test.js */
'use strict';

const parser = require('../js/parser.js');

const TODAY = '2026-09-30';
const ACCOUNTS = [
  { id: 'a1', name: 'CIBC Current', type: 'bank' },
  { id: 'a2', name: 'CIBC Savings', type: 'bank' },
  { id: 'a3', name: 'CIBC Visa', type: 'credit' },
];

/* Mirror of the store's category keyword tables (kept tiny fixtures so the
 * parser stays dependency-injected). */
const EXPENSE_CATEGORIES = [
  { id: 'groceries', kw: ['grocery', 'groceries', 'walmart', 'costco'] },
  { id: 'dining', kw: ['coffee', 'lunch', 'dinner', 'restaurant'] },
  { id: 'transport', kw: ['uber', 'gas', 'fuel', 'parking'] },
  { id: 'housing', kw: ['rent', 'mortgage'] },
  { id: 'utilities', kw: ['internet', 'phone bill', 'bill'] },
  { id: 'other', kw: [] },
];
const INCOME_CATEGORIES = [
  { id: 'salary', kw: ['salary', 'paycheck'] },
  { id: 'freelance', kw: ['freelance', 'client', 'invoice'] },
  { id: 'refund', kw: ['refund', 'cashback'] },
  { id: 'other', kw: [] },
];

function parse(text, extra) {
  return parser.parse(text, Object.assign({
    accounts: ACCOUNTS,
    expenseCategories: EXPENSE_CATEGORIES,
    incomeCategories: INCOME_CATEGORIES,
    defaultKind: 'expense',
    today: TODAY,
  }, extra || {}));
}

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + '\n       expected ' + e + '\n       got      ' + a); }
}

console.log('— amount extraction —');
check('digits', parse('spent 24 on coffee').amountCents, 2400);
check('decimals', parse('spent 12.50 on lunch').amountCents, 1250);
check('comma thousands', parse('received 1,500 from freelance client').amountCents, 150000);
check('k suffix', parse('spent 2k on rent').amountCents, 200000);
check('word: five dollars', parse('bought coffee for five dollars').amountCents, 500);
check('word: twenty five', parse('spent twenty five dollars on gas').amountCents, 2500);
check('word: hundred twenty', parse('spent one hundred and twenty dollars at walmart').amountCents, 12000);
check('word: two thousand', parse('got paid two thousand dollars').amountCents, 200000);

console.log('— intent (kind) —');
check('spent -> expense', parse('spent 24 on coffee').kind, 'expense');
check('paid -> expense', parse('paid 60 for internet').kind, 'expense');
check('earned -> income', parse('earned 1500 salary').kind, 'income');
check('got paid -> income (not paid/expense)', parse('got paid 3000 salary').kind, 'income');
check('refund -> income', parse('refund 43 from amazon').kind, 'income');
check('e transfer -> income', parse('e transfer 200 from mom').kind, 'income');
check('payday beats pay', parse('payday 1500 came in').kind, 'income');
check('no cue -> defaultKind', parse('uber 18').kind, 'expense');
check('no cue, income context', parse('interest 12 credit', { defaultKind: 'income' }).kind, 'income');
check('invest maps to expense', parse('invested 500 in tfsa').kind, 'expense');

console.log('— category —');
check('groceries', parse('spent 80 at costco').categoryId, 'groceries');
check('dining', parse('lunch 15').categoryId, 'dining');
check('refund (cue is also category)', parse('refund 43 from amazon').categoryId, 'refund');
check('salary', parse('earned 1500 salary').categoryId, 'salary');
check('transport', parse('paid 45 for gas').categoryId, 'transport');
check('no match -> null', parse('spent 20 on something random').categoryId, null);

console.log('— account matching —');
check('full name', parse('spent 24 on coffee from cibc current').accountId, 'a1');
check('savings', parse('earned 1500 salary in cibc savings').accountId, 'a2');
check('credit card by name', parse('paid 30 for dinner on cibc visa').accountId, 'a3');
check('type synonym: credit card', parse('spent 50 on my credit card').accountId, 'a3');
check('no account mentioned', parse('spent 20 on coffee').accountId, null);
check('distinctive token resolves', parse('moved 100 to savings', { accounts: [ACCOUNTS[0], ACCOUNTS[1]] }).accountId, 'a2');
check('generic phrase tie -> null + flag', (() => {
  const d = parse('moved 100 to my bank account', { accounts: [ACCOUNTS[0], ACCOUNTS[1]] });
  return d.accountId === null && d.accountAmbiguous === true;
})(), true);

console.log('— dates & notes —');
check('yesterday', parse('spent 12.50 on lunch yesterday').date, '2026-09-29');
check('day before yesterday', parse('spent 10 on coffee the day before yesterday').date, '2026-09-28');
check('default today', parse('spent 10 on coffee').date, TODAY);
check('note keeps trailing words', parse('spent 24 on groceries for weekly supplies cibc current').note, 'Weekly supplies');
check('note strips stopwords', parse('paid 60 for internet').note, '');
check('empty input safe', (() => { const d = parse(''); return d.amountCents === null && d.kind === null; })(), true);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
