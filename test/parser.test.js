/* Parser test suite — plain Node, no deps. Run: node test/parser.test.js */
'use strict';

const parser = require('../js/parser.js');

const TODAY = '2026-09-30';
const ACCOUNTS = [
  { id: 'a1', name: 'Main Chequing', type: 'bank' },
  { id: 'a2', name: 'Main Savings', type: 'bank' },
  { id: 'a3', name: 'Everyday Visa', type: 'credit' },
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
check('full name', parse('spent 24 on coffee from main chequing').accountId, 'a1');
check('savings', parse('earned 1500 salary in main savings').accountId, 'a2');
check('credit card by name', parse('paid 30 for dinner on everyday visa').accountId, 'a3');
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
check('note keeps trailing words', parse('spent 24 on groceries for weekly supplies main chequing').note, 'Weekly supplies');
check('note strips stopwords', parse('paid 60 for internet').note, '');
check('empty input safe', (() => { const d = parse(''); return d.amountCents === null && d.kind === null; })(), true);

/* Guided-voice helpers — one narrow answer per step (js/ui.js guided flow). */

console.log('— guided: parseKind —');
check('expense word', parser.parseKind('expense'), 'expense');
check('income word', parser.parseKind('income'), 'income');
check('verb cue: spent', parser.parseKind('spent'), 'expense');
check('verb cue: earned', parser.parseKind('earned some money'), 'income');
check('gibberish -> null', parser.parseKind('blah blah'), null);
check('empty -> null', parser.parseKind(''), null);

console.log('— guided: parseAmountCents —');
check('bare digits', parser.parseAmountCents('25'), 2500);
check('decimal', parser.parseAmountCents('12.50'), 1250);
check('words', parser.parseAmountCents('twenty four fifty'), 2450);
check('k suffix', parser.parseAmountCents('2k'), 200000);
check('no number -> null', parser.parseAmountCents('no idea'), null);
check('dollars-and-cents words', parser.parseAmountCents('two dollars fifty cents'), 250);
check('plain tens+ones stays dollars', parser.parseAmountCents('twenty five'), 2500);
check('hundred form stays whole', parser.parseAmountCents('one hundred and twenty'), 12000);
check('cents only', parser.parseAmountCents('fifty cents'), 50);
check('ones-then-tens cents', parser.parseAmountCents('four fifty'), 450);

console.log('— guided: matchCategoryGuided —');
check('keyword', parser.matchCategoryGuided('groceries', EXPENSE_CATEGORIES), 'groceries');
check('keyword in phrase', parser.matchCategoryGuided('it was coffee', EXPENSE_CATEGORIES), 'dining');
check('income keyword', parser.matchCategoryGuided('salary', INCOME_CATEGORIES), 'salary');
check('unknown -> null', parser.matchCategoryGuided('space rockets', EXPENSE_CATEGORIES), null);

console.log('— guided: noteIsSkipped —');
check('no note', parser.noteIsSkipped('no note'), true);
check('nothing', parser.noteIsSkipped('nothing'), true);
check('skip', parser.noteIsSkipped('skip'), true);
check('real note kept', parser.noteIsSkipped('weekly groceries'), false);

console.log('— guided: accountMatch via parse —');
check('name token', parse('in main savings').accountId, 'a2');
check('credit synonym', parse('on credit card').accountId, 'a3');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
