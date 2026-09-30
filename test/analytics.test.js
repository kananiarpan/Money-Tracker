/* Analytics compute test suite — plain Node, no deps. Run: node test/analytics.test.js */
'use strict';

const A = require('../js/analytics.js');

const TODAY = '2026-09-20';
const CATS = [
  { id: 'groceries', label: 'Groceries', color: '#3987e5', kw: [] },
  { id: 'dining', label: 'Dining', color: '#d95926', kw: [] },
  { id: 'housing', label: 'Housing', color: '#199e70', kw: [] },
  { id: 'utilities', label: 'Utilities', color: '#c98500', kw: [] },
  { id: 'other', label: 'Other', color: '#6b7280', kw: [] },
];
const INC = [
  { id: 'salary', label: 'Salary', color: '#3987e5', kw: [] },
  { id: 'other', label: 'Other', color: '#6b7280', kw: [] },
];

/* txn factory — only the fields analytics reads */
let _id = 0;
const t = (kind, cents, date, categoryId, note) =>
  ({ id: 't' + (++_id), kind, amountCents: cents, date, categoryId, note: note || '', accountId: 'a1' });

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + '\n       expected ' + e + '\n       got      ' + a); }
}

console.log('— month arithmetic —');
check('shiftMonthKey across years', A.shiftMonthKey('2026-01', -1), '2025-12');
check('shiftMonthKey forward', A.shiftMonthKey('2026-11', 3), '2027-02');
check('daysInMonth Feb', A.daysInMonth('2026-02'), 28);
check('addDays across DST spring-forward (Mar 8 2026)', A.addDays('2026-03-08', 1), '2026-03-09');
check('addDays backwards across month', A.addDays('2026-10-01', -1), '2026-09-30');

console.log('— monthKeys / prevMonthKeys —');
check('3M', A.monthKeys('3M', TODAY), ['2026-07', '2026-08', '2026-09']);
check('6M default', A.monthKeys('6M', TODAY)[0], '2026-04');
check('12M length', A.monthKeys('12M', TODAY).length, 12);
check('YTD starts in January', A.monthKeys('YTD', TODAY)[0], '2026-01');
check('YTD length', A.monthKeys('YTD', TODAY).length, 9);
check('ALL from first txn', A.monthKeys('ALL', TODAY, '2025-03-20')[0], '2025-03');
check('ALL capped at 36', (() => {
  const ks = A.monthKeys('ALL', TODAY, '2020-01-05');
  return [ks.length, ks[0], ks[35]];
})(), [36, '2023-10', '2026-09']);
check('ALL with no txns = current month only', A.monthKeys('ALL', TODAY, null), ['2026-09']);
check('prev of 6M is the prior 6 months', A.prevMonthKeys('6M', TODAY), ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
check('prev of YTD is 9 months before January', A.prevMonthKeys('YTD', TODAY)[0], '2025-04');
check('prev of YTD length', A.prevMonthKeys('YTD', TODAY).length, 9);

console.log('— cashFlow —');
const CF_TXNS = [
  t('income', 150000, '2026-08-05', 'salary'),
  t('expense', 2400, '2026-09-02', 'groceries'),
  t('expense', 1600, '2026-09-09', 'dining'),
];
check('sums + net per bucket', A.cashFlow(CF_TXNS, ['2026-08', '2026-09']), [
  { month: '2026-08', label: 'Aug ’26', earned: 150000, spent: 0, net: 150000 },
  { month: '2026-09', label: 'Sep', earned: 0, spent: 4000, net: -4000 },
]);
check('January anchors the year', A.cashFlow([], ['2025-12', '2026-01']).map(r => r.label), ['Dec ’25', 'Jan ’26']);
check('empty month still emits a zero row', A.cashFlow([], ['2026-05'])[0].net, 0);

console.log('— categoryTotals —');
const CT = A.categoryTotals([
  t('expense', 8000, '2026-09-01', 'groceries'),
  t('expense', 4000, '2026-09-03', 'groceries'),
  t('expense', 3000, '2026-09-04', 'dining'),
  t('income', 99999, '2026-09-04', 'salary'), /* wrong kind — ignored */
], 'expense', CATS);
check('groups + sorts desc', CT.rows.map(r => r.id), ['groceries', 'dining']);
check('total', CT.total, 15000);
check('share', Math.round(CT.rows[0].share * 100), 80);
check('color carried from categories', CT.rows[0].color, '#3987e5');
check('unknown category falls back', A.categoryTotals([t('expense', 500, '2026-09-01', 'mystery')], 'expense', CATS).rows[0].label, 'Other');
check('>8 categories folds into Everything else', (() => {
  const nine = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ id: 'c' + i, label: 'C' + i, color: '#111', kw: [] }));
  const txns = nine.map((c, i) => t('expense', (i + 1) * 100, '2026-09-01', c.id));
  const r = A.categoryTotals(txns, 'expense', nine);
  return [r.rows.length, r.rows[7].id, r.rows[7].cents];
})(), [8, '__rest', 300]);
check('empty input', A.categoryTotals([], 'expense', CATS).total, 0);

console.log('— categoryDeltas —');
const CUR = [{ id: 'groceries', cents: 3000 }, { id: 'dining', cents: 1000 }];
const PREV = [{ id: 'groceries', cents: 2000 }, { id: 'dining', cents: 0 }];
const D = A.categoryDeltas(CUR, PREV);
check('normal rel', D.groceries.rel, 0.5);
check('prev zero -> rel null', D.dining.rel, null);
check('abs always present', D.dining.abs, 1000);

console.log('— balanceSeries —');
const B_TXNS = [
  t('income', 5000, '2026-08-15', 'salary'),   /* before range: baseline */
  t('income', 10000, '2026-09-01', 'salary'),
  t('expense', 2500, '2026-09-03', 'groceries'),
];
check('baseline + daily cumulative', A.balanceSeries(B_TXNS, '2026-09-01', '2026-09-04'), [
  { date: '2026-09-01', cents: 15000 },
  { date: '2026-09-02', cents: 15000 },
  { date: '2026-09-03', cents: 12500 },
  { date: '2026-09-04', cents: 12500 },
]);
check('long range samples weekly, endpoint pinned to end', (() => {
  const start = '2025-01-01', end = '2026-09-20';
  const midTxn = t('income', 700, A.addDays(start, 350), 'salary');
  const s = A.balanceSeries([midTxn], start, end);
  let n = 1, d = start; while (d < end) { d = A.addDays(d, 1); n++; }
  return [s.length, s[s.length - 1].date, s[s.length - 1].cents];
})(), [90, '2026-09-20', 700]); /* 628 days span -> ceil(628/7) = 90 weekly points */
check('no txns -> flat zeros', A.balanceSeries([], '2026-09-01', '2026-09-03'),
  [{ date: '2026-09-01', cents: 0 }, { date: '2026-09-02', cents: 0 }, { date: '2026-09-03', cents: 0 }]);

console.log('— insights —');
const fmt = c => '$' + (c / 100).toFixed(2);
const dLabel = iso => iso;
function insightsFor(txns) {
  return A.insights({
    txns, today: TODAY,
    months: A.monthKeys('6M', TODAY),
    prevMonths: A.prevMonthKeys('6M', TODAY),
    expenseCategories: CATS, incomeCategories: INC,
    fmt, dLabel,
  });
}
const RICH = [
  /* current month pace: 20000 spent by day 20, last month only 10000 */
  t('expense', 20000, '2026-09-10', 'utilities'),
  t('expense', 10000, '2026-08-12', 'utilities'),
  /* spike: groceries 4000 now vs 2000 before */
  t('expense', 4000, '2026-09-04', 'groceries'),
  t('expense', 2000, '2026-02-04', 'groceries'),
  /* drop: dining 1000 now vs 3000 before */
  t('expense', 1000, '2026-09-06', 'dining'),
  t('expense', 3000, '2026-03-06', 'dining'),
  /* savings rate: current 6M earns 100000; previous earns 100000 spends more */
  t('income', 100000, '2026-09-02', 'salary'),
  t('income', 100000, '2026-01-02', 'salary'),
  t('expense', 70000, '2026-02-02', 'housing'),
  /* biggest single expense */
  t('expense', 80000, '2026-09-12', 'housing', 'September rent'),
];
const INS = insightsFor(RICH);
check('pace fires with tone + last-month reference', (() => {
  const p = INS.find(x => x.title === 'Spending pace');
  return p && p.tone === 'bad' && p.body.includes('last month was $100.00');
})(), true);
check('pace null in a first-month user’s data', insightsFor([t('expense', 500, '2026-09-10', 'utilities')]).some(x => x.title === 'Spending pace'), false);
check('pace null early in month (day 3)', A.insights({
  txns: RICH, today: '2026-09-03',
  months: A.monthKeys('6M', '2026-09-03'), prevMonths: A.prevMonthKeys('6M', '2026-09-03'),
  expenseCategories: CATS, incomeCategories: INC, fmt, dLabel,
}).some(x => x.title === 'Spending pace'), false);
check('spike fires', (() => {
  const s = INS.find(x => x.title === 'Groceries is climbing');
  return s && s.tone === 'bad' && s.body.includes('100%') && s.body.includes('$20.00 more');
})(), true);
check('drop fires', (() => {
  const s = INS.find(x => x.title === 'Dining is cooling off');
  return s && s.tone === 'good' && s.body.includes('67%');
})(), true);
check('savings rate with period delta', (() => {
  /* current 6M (Apr–Sep): 100000 in − 115000 out = −15%; previous (Oct–Mar): 100000 − 75000 = 25% */
  const s = INS.find(x => x.title === 'Savings rate');
  return s && s.tone === 'bad' && s.body.includes('-15%') && s.body.includes('40 points worse');
})(), true);
check('savings rate null when nothing earned', insightsFor([t('expense', 900, '2026-09-01', 'groceries')]).some(x => x.title === 'Savings rate'), false);
check('biggest expense', (() => {
  const s = INS.find(x => x.title === 'Biggest single expense');
  return s && s.tone === 'info' && s.body.includes('$800.00') && s.body.includes('September rent') && s.body.includes('2026-09-12');
})(), true);
check('avg daily spend fires', INS.some(x => x.title === 'Average daily spend'), true);
check('concentration flag', (() => {
  const s = insightsFor([
    t('expense', 8000, '2026-09-01', 'groceries'),
    t('expense', 2000, '2026-09-02', 'dining'),
  ]).find(x => x.title === 'Groceries dominates');
  return s && s.tone === 'info' && s.body.includes('80%');
})(), true);
check('no data -> no insights', insightsFor([]).length, 0);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
