/* Money Tracker — analytics compute layer.
 * Pure functions over plain transaction data, no DOM/localStorage: attaches to
 * window in the browser and globalThis in Node so test/analytics.test.js can
 * exercise it directly. Mirrors the store's hard invariant: amounts are
 * integer cents, dates are zero-padded ISO strings (string compare is safe).
 */
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var NEUTRAL = '#6b7280';

  function pad2(n) { return String(n).padStart(2, '0'); }

  /* 'YYYY-MM' shifted by whole months via component arithmetic (never ms math). */
  function shiftMonthKey(ym, delta) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + delta;
    var yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
    return yy + '-' + pad2(mm + 1);
  }

  function daysInMonth(ym) {
    return new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
  }

  /* ISO + n days. setDate() steps over DST correctly; string built from
   * components so no timezone shift leaks in through toISOString(). */
  function addDays(iso, n) {
    var d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function monthShort(ym) { return MONTHS[+ym.slice(5, 7) - 1]; }

  /* Range presets -> ordered ['YYYY-MM', …] bucket list, today last.
   * firstISO (earliest txn date) is only needed for 'ALL'. Cap 36 buckets. */
  function monthKeys(range, todayISO, firstISO) {
    var tm = todayISO.slice(0, 7);
    var start;
    if (range === '3M') start = shiftMonthKey(tm, -2);
    else if (range === '12M') start = shiftMonthKey(tm, -11);
    else if (range === 'YTD') start = tm.slice(0, 4) + '-01';
    else if (range === 'ALL') start = firstISO ? firstISO.slice(0, 7) : tm;
    else start = shiftMonthKey(tm, -5); /* 6M default */
    if (shiftMonthKey(start, 36) < tm) start = shiftMonthKey(tm, -35);
    var out = [];
    for (var k = start; k <= tm; k = shiftMonthKey(k, 1)) out.push(k);
    return out;
  }

  /* The equal-length block immediately before the current one (for deltas). */
  function prevMonthKeys(range, todayISO, firstISO) {
    var cur = monthKeys(range, todayISO, firstISO);
    var n = cur.length, out = [];
    for (var k = shiftMonthKey(cur[0], -n); out.length < n; k = shiftMonthKey(k, 1)) out.push(k);
    return out;
  }

  function rangeStartISO(months) { return months[0] + '-01'; }
  function rangeEndISO(months) {
    var m = months[months.length - 1];
    return addDays(m + '-01', daysInMonth(m) - 1);
  }

  function sumIn(txns, monthSet, kind) {
    var total = 0;
    for (var i = 0; i < txns.length; i++) {
      var t = txns[i];
      if (t.kind === kind && monthSet.indexOf(t.date.slice(0, 7)) !== -1) total += t.amountCents;
    }
    return total;
  }

  /* Totals for a block of months — drives the KPI tiles. */
  function rangeTotals(txns, months) {
    var earned = sumIn(txns, months, 'income');
    var spent = sumIn(txns, months, 'expense');
    return { earned: earned, spent: spent, net: earned - spent };
  }

  /* One row per month bucket. Label anchors the year on the first bucket and
   * every January so the axis reads across a year boundary. */
  function cashFlow(txns, months) {
    return months.map(function (m, i) {
      var label = monthShort(m) + (i === 0 || m.slice(5, 7) === '01' ? ' ’' + m.slice(2, 4) : '');
      var earned = sumIn(txns, [m], 'income');
      var spent = sumIn(txns, [m], 'expense');
      return { month: m, label: label, earned: earned, spent: spent, net: earned - spent };
    });
  }

  /* Same row shape as store.breakdown() plus a share field, but over any txn
   * set. ≤8 series: top 7 + an "Everything else" fold (dataviz rule). */
  function categoryTotals(txns, kind, categories) {
    var byId = {}, total = 0, i, t;
    for (i = 0; i < txns.length; i++) {
      t = txns[i];
      if (t.kind !== kind) continue;
      byId[t.categoryId] = (byId[t.categoryId] || 0) + t.amountCents;
      total += t.amountCents;
    }
    var rows = Object.keys(byId).map(function (id) {
      var cat = null;
      for (var c = 0; c < categories.length; c++) if (categories[c].id === id) cat = categories[c];
      return {
        id: id,
        label: cat ? cat.label : 'Other',
        color: cat ? cat.color : NEUTRAL,
        cents: byId[id],
        share: total ? byId[id] / total : 0,
      };
    });
    rows.sort(function (a, b) { return b.cents - a.cents; });
    if (rows.length > 8) {
      var rest = rows.splice(7);
      var restCents = rest.reduce(function (s, r) { return s + r.cents; }, 0);
      rows.push({ id: '__rest', label: 'Everything else', color: NEUTRAL, cents: restCents, share: total ? restCents / total : 0 });
    }
    return { rows: rows, total: total };
  }

  /* Per-category movement current vs previous block. rel is null when the
   * previous period had zero — never show ∞% or a spike out of nothing. */
  function categoryDeltas(curRows, prevRows) {
    var prev = {};
    prevRows.forEach(function (r) { prev[r.id] = r.cents; });
    var out = {};
    curRows.forEach(function (r) {
      var p = prev[r.id] || 0;
      out[r.id] = { abs: r.cents - p, rel: p > 0 ? (r.cents - p) / p : null };
    });
    return out;
  }

  /* Daily cumulative balance (income − expense) for txns in [startISO, endISO],
   * seeded from everything before startISO — exact because balances are derived
   * from transactions only. Long ranges sample weekly and always pin the final
   * point to endISO so the endpoint equals the true balance. */
  function balanceSeries(txns, startISO, endISO) {
    var perDay = {}, i, t, cents = 0;
    for (i = 0; i < txns.length; i++) {
      t = txns[i];
      var signed = t.kind === 'income' ? t.amountCents : -t.amountCents;
      if (t.date < startISO) cents += signed;
      else if (t.date <= endISO) perDay[t.date] = (perDay[t.date] || 0) + signed;
    }
    var days = [];
    for (var d = startISO; d <= endISO; d = addDays(d, 1)) days.push(d);
    var step = days.length > 400 ? 7 : 1;
    var out = [], run = cents;
    for (i = 0; i < days.length; i += step) {
      for (var j = i; j < Math.min(i + step, days.length); j++) run += perDay[days[j]] || 0;
      out.push({ date: days[Math.min(i + step - 1, days.length - 1)], cents: run });
    }
    if (days.length && out[out.length - 1].date !== endISO) {
      /* can only happen when the loop steps past the end — defensive */
      out.push({ date: endISO, cents: run });
    }
    return out;
  }

  function sumSpentInRange(txns, startISO, endISO) {
    var total = 0;
    for (var i = 0; i < txns.length; i++) {
      var t = txns[i];
      if (t.kind === 'expense' && t.date >= startISO && t.date <= endISO) total += t.amountCents;
    }
    return total;
  }

  function totalDays(startISO, endISO) {
    var n = 0;
    for (var d = startISO; d <= endISO; d = addDays(d, 1)) n++;
    return n;
  }

  /**
   * Rule-based insights — each rule returns null on insufficient data rather
   * than a junk card. fmt(cents) -> money string and dLabel(iso) -> short date
   * are injected so this module stays UI-free.
   * opts: { txns (account-filtered), months, prevMonths, today,
   *         expenseCategories, incomeCategories, fmt, dLabel }
   */
  function insights(opts) {
    var txns = opts.txns, months = opts.months, prevMonths = opts.prevMonths;
    var today = opts.today, fmt = opts.fmt, dLabel = opts.dLabel;
    var out = [];
    var cur = rangeTotals(txns, months);
    var prev = rangeTotals(txns, prevMonths);
    var rangeLabel = months.length + (months.length > 1 ? ' months' : ' month');
    var pct = function (r) { return Math.round(Math.abs(r) * 100); };

    /* — 1. spending pace (current month only) — */
    var tm = today.slice(0, 7);
    var day = +today.slice(8, 10);
    var prevM = shiftMonthKey(tm, -1);
    var spentToDate = sumSpentInRange(txns, tm + '-01', today);
    var prevSpent = sumIn(txns, [prevM], 'expense');
    if (day >= 5 && prevSpent > 0 && months.indexOf(tm) !== -1) {
      var projected = Math.round(spentToDate / day * daysInMonth(tm));
      var tone = projected > prevSpent * 1.1 ? 'bad' : (projected < prevSpent * 0.9 ? 'good' : 'info');
      out.push({
        tone: tone,
        title: 'Spending pace',
        body: 'On pace for about ' + fmt(projected) + ' this month — last month was ' + fmt(prevSpent) + '.',
      });
    }

    /* — 2/3. category spike + drop (current block vs previous block) — */
    var curCats = categoryTotals(txns.filter(function (t) { return months.indexOf(t.date.slice(0, 7)) !== -1; }), 'expense', opts.expenseCategories);
    var prevCats = categoryTotals(txns.filter(function (t) { return prevMonths.indexOf(t.date.slice(0, 7)) !== -1; }), 'expense', opts.expenseCategories);
    var deltas = categoryDeltas(curCats.rows, prevCats.rows);
    var spike = null, drop = null;
    curCats.rows.forEach(function (r) {
      var d = deltas[r.id];
      if (!d || d.rel === null) return;
      if (d.abs >= 1500 && d.rel >= 0.2 && (prevCats.rows.some(function (p) { return p.id === r.id && p.cents >= 500; }))) {
        if (!spike || d.abs > spike.abs) spike = { row: r, abs: d.abs, rel: d.rel };
      } else if (d.abs <= -1500 && d.rel <= -0.2) {
        if (!drop || -d.abs > -drop.abs) drop = { row: r, abs: d.abs, rel: d.rel };
      }
    });
    if (spike) out.push({
      tone: 'bad',
      title: spike.row.label + ' is climbing',
      body: 'Up ' + pct(spike.rel) + '% (' + fmt(spike.abs) + ' more) vs the previous ' + rangeLabel + '.',
    });
    if (drop) out.push({
      tone: 'good',
      title: drop.row.label + ' is cooling off',
      body: 'Down ' + pct(drop.rel) + '% (' + fmt(-drop.abs) + ' less) vs the previous ' + rangeLabel + '.',
    });

    /* — 4. savings rate — */
    if (cur.earned > 0) {
      var rate = cur.net / cur.earned;
      var body = 'You kept ' + Math.round(rate * 100) + '% of what came in over the last ' + rangeLabel + '.';
      var tone = 'info';
      if (prev.earned > 0) {
        var prevRate = prev.net / prev.earned;
        var diff = rate - prevRate;
        tone = diff > 0.02 ? 'good' : (diff < -0.02 ? 'bad' : 'info');
        body += ' That is ' + Math.round(Math.abs(diff) * 100) + ' points ' + (diff >= 0 ? 'better' : 'worse') + ' than the previous period.';
      }
      out.push({ tone: tone, title: 'Savings rate', body: body });
    }

    /* — 5. largest single expense in range — */
    var biggest = null;
    for (var i = 0; i < txns.length; i++) {
      var t = txns[i];
      if (t.kind !== 'expense') continue;
      if (months.indexOf(t.date.slice(0, 7)) === -1) continue;
      if (!biggest || t.amountCents > biggest.amountCents) biggest = t;
    }
    if (biggest) {
      var cat = categoryTotals([biggest], 'expense', opts.expenseCategories).rows[0];
      out.push({
        tone: 'info',
        title: 'Biggest single expense',
        body: fmt(biggest.amountCents) + ' on ' + cat.label.toLowerCase() + (biggest.note ? ' (“' + biggest.note + '”)' : '') + ' — ' + dLabel(biggest.date) + '.',
      });
    }

    /* — 6. average daily spend — */
    var startISO = rangeStartISO(months);
    var endISO = today < rangeEndISO(months) ? today : rangeEndISO(months);
    var days = totalDays(startISO, endISO);
    var pStart = rangeStartISO(prevMonths), pEnd = rangeEndISO(prevMonths);
    var pDays = totalDays(pStart, pEnd);
    if (days > 0 && cur.spent > 0 && pDays > 0 && prev.spent > 0) {
      var a = Math.round(cur.spent / days), b = Math.round(prev.spent / pDays);
      var rel = b > 0 ? (a - b) / b : 0;
      out.push({
        tone: rel >= 0.2 ? 'bad' : (rel <= -0.15 ? 'good' : 'info'),
        title: 'Average daily spend',
        body: fmt(a) + ' per day over the last ' + rangeLabel + ' (was ' + fmt(b) + ').',
      });
    }

    /* — 7. concentration warning — */
    if (curCats.rows.length && curCats.total > 0 && curCats.rows[0].share >= 0.4) {
      out.push({
        tone: 'info',
        title: curCats.rows[0].label + ' dominates',
        body: 'It is ' + pct(curCats.rows[0].share) + '% of all spending in this range.',
      });
    }

    return out;
  }

  var api = {
    RANGES: ['3M', '6M', '12M', 'YTD', 'ALL'],
    shiftMonthKey: shiftMonthKey,
    addDays: addDays,
    daysInMonth: daysInMonth,
    monthKeys: monthKeys,
    prevMonthKeys: prevMonthKeys,
    rangeStartISO: rangeStartISO,
    rangeEndISO: rangeEndISO,
    rangeTotals: rangeTotals,
    cashFlow: cashFlow,
    categoryTotals: categoryTotals,
    categoryDeltas: categoryDeltas,
    balanceSeries: balanceSeries,
    insights: insights,
  };
  root.MTAnalytics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
