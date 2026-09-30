/* Money Tracker — voice/text command parser.
 * Pure functions, no DOM: attaches to window in the browser and globalThis in
 * Node so test/parser.test.js can exercise it directly.
 *
 * Pipeline: normalize → date words → intent (kind) cues → amount (digits or
 * number-words) → account match (ties stay unresolved) → category keywords →
 * whatever is left becomes the note. Voice is unreliable by nature, so the
 * parser only *prefills* a confirmation card — it never saves on its own.
 */
(function (root) {
  'use strict';

  var WORD_NUM = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40,
    fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };

  /* Longest cues first within the same start index, earliest index wins.
   * 'got paid' must beat 'paid'; 'payday' must beat 'pay'. */
  var INCOME_CUES = ['got paid', 'e transfer from', 'e transfer', 'paycheck', 'pay cheque', 'payday', 'pay day',
    'received', 'receive', 'recieved', 'earned', 'deposit', 'deposited', 'refund', 'cashback', 'cash back',
    'reimburse', 'reimbursement', 'sent me', 'gave me', 'salary', 'income', 'came in', 'interest paid', 'earn'];
  var EXPENSE_CUES = ['invested', 'invest', 'bought', 'purchase', 'purchased', 'spent', 'spend', 'paid', 'paying',
    'pay', 'cost', 'charged', 'charge', 'withdrew', 'withdraw', 'took out', 'expense', 'buy'];

  /* Words that never carry meaning for the note. */
  var STOP = ['please', 'hey', 'ok', 'okay', 'so', 'um', 'uh', 'hmm', 'like', 'on', 'for', 'at', 'from', 'to',
    'in', 'into', 'my', 'the', 'a', 'an', 'with', 'using', 'via', 'of', 'this', 'that', 'it', 'and', 'me',
    'worth', 'account', 'dollar', 'dollars', 'bucks', 'cad', 'usd', 'cents', 'cent'];

  var TYPE_SYNONYMS = {
    bank: ['bank account', 'debit card', 'chequing', 'checking', 'debit', 'bank'],
    credit: ['credit card', 'mastercard', 'master card', 'credit', 'visa', 'amex'],
    cash: ['wallet', 'cash'],
    investment: ['investment account', 'brokerage', 'tfsa', 'rrsp', 'fhsa', 'stocks', 'investment'],
  };

  function normalize(s) {
    return String(s).toLowerCase()
      .replace(/’/g, "'")
      .replace(/(\d),(\d{3}\b)/g, '$1$2')   // 1,500 -> 1500
      .replace(/\$/g, ' ')
      .replace(/-/g, ' ')                    // twenty-five -> twenty five
      .replace(/[^a-z0-9.\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function hasPhrase(text, phrase) { return new RegExp('\\b' + escRe(phrase) + '\\b').test(text); }
  function stripPhrase(text, phrase) { return text.replace(new RegExp('\\b' + escRe(phrase) + '\\b'), ' ').replace(/\s+/g, ' '); }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function shiftDays(iso, n) {
    var d = new Date(iso + 'T12:00:00'); // noon avoids DST edges
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* Accumulate a run of number words starting at tokens[start].
   * "twenty five" -> 25, "one hundred and twenty" -> 120, "two thousand" -> 2000. */
  function wordsToNumber(tokens, start) {
    var total = 0, current = 0, used = 0, seen = false, i = start;
    while (i < tokens.length) {
      var t = tokens[i];
      if (t === 'and' && seen) { used++; i++; continue; }
      if (t === 'a' || t === 'an') { if (seen) break; current += 1; seen = true; used++; i++; continue; }
      if (Object.prototype.hasOwnProperty.call(WORD_NUM, t)) { current += WORD_NUM[t]; seen = true; used++; i++; continue; }
      if (t === 'hundred') { if (current === 0) current = 1; current *= 100; seen = true; used++; i++; continue; }
      if (t === 'thousand' || t === 'million') {
        var m = t === 'thousand' ? 1000 : 1000000;
        if (current === 0) current = 1;
        total += current * m; current = 0; seen = true; used++; i++; continue;
      }
      break;
    }
    return seen ? { value: total + current, consumed: used } : null;
  }

  /* Earliest cue wins; at the same index the longest cue wins.
   * "invested" maps onto expense for now and keeps its wording in the note. */
  function findKind(text) {
    var best = null;
    function scan(cues, kind) {
      for (var k = 0; k < cues.length; k++) {
        var m = new RegExp('\\b' + escRe(cues[k]) + '\\b').exec(text);
        if (m) {
          var cand = { kind: kind, phrase: cues[k], index: m.index, len: cues[k].length };
          if (!best || cand.index < best.index || (cand.index === best.index && cand.len > best.len)) best = cand;
        }
      }
    }
    scan(INCOME_CUES, 'income');
    scan(EXPENSE_CUES, 'expense');
    return best;
  }

  function findAmount(text) {
    /* Digits first — Chrome's recognizer usually emits digits for spoken numbers. */
    var m = /(\d+(?:\.\d{1,2})?)\s*(k|grand|dollars?|bucks|cad|usd|cents?)?\b/.exec(text);
    if (m) {
      var v = parseFloat(m[1]);
      var unit = m[2] || '';
      if (unit === 'k' || unit === 'grand') v *= 1000;
      if (unit === 'cent' || unit === 'cents') v /= 100;
      if (v > 0) return { amountCents: Math.round(v * 100), phrase: m[0].trim() };
    }
    /* Fall back to number words: "five dollars", "one hundred and twenty". */
    var tokens = text.split(/\s+/).filter(Boolean);
    for (var i = 0; i < tokens.length; i++) {
      var r = wordsToNumber(tokens, i);
      if (r && r.value > 0) {
        return { amountCents: Math.round(r.value * 100), phrase: tokens.slice(i, i + r.consumed).join(' ') };
      }
    }
    return null;
  }

  /* Score every account against the text. A tie between two accounts stays
   * unresolved — better to ask in the confirm card than to guess wrong. */
  function matchAccount(text, accounts) {
    var scored = [];
    for (var a = 0; a < accounts.length; a++) {
      var acct = accounts[a];
      var best = 0;
      var phrases = [];
      var nameNorm = normalize(acct.name);
      if (nameNorm && hasPhrase(text, nameNorm)) {
        best = 100 + nameNorm.length;
        phrases.push(nameNorm);
      }
      var toks = nameNorm.split(' ').filter(function (w) { return w.length > 2; });
      if (toks.length) {
        var hits = toks.filter(function (w) { return hasPhrase(text, w); });
        if (hits.length === toks.length && 60 + toks.join(' ').length > best) {
          best = 60 + toks.join(' ').length;
          phrases = hits.slice();
        } else if (hits.length && best === 0) {
          best = hits.length * 10;
          phrases = hits.slice();
        }
      }
      var syns = TYPE_SYNONYMS[acct.type] || [];
      for (var s = 0; s < syns.length; s++) {
        if (hasPhrase(text, syns[s]) && 30 + syns[s].length > best) {
          best = 30 + syns[s].length;
          phrases = [syns[s]];
        }
      }
      if (best > 0) scored.push({ account: acct, score: best, phrases: phrases });
    }
    if (!scored.length) return { account: null, ambiguous: false, phrases: [] };
    scored.sort(function (x, y) { return y.score - x.score; });
    if (scored.length > 1 && scored[1].score === scored[0].score) {
      return { account: null, ambiguous: true, phrases: [] };
    }
    return { account: scored[0].account, ambiguous: false, phrases: scored[0].phrases };
  }

  function matchCategory(text, categories) {
    for (var c = 0; c < categories.length; c++) {
      var kws = categories[c].kw || [];
      for (var k = 0; k < kws.length; k++) {
        if (hasPhrase(text, kws[k])) return { id: categories[c].id, phrase: kws[k] };
      }
    }
    return null;
  }

  /**
   * parse(text, options) -> draft
   * options: { accounts, expenseCategories, incomeCategories, defaultKind, today }
   * draft:   { raw, kind, amountCents, categoryId, accountId, date, note,
   *            accountAmbiguous, parsed: {kind, amount, account, category} }
   */
  function parse(input, options) {
    options = options || {};
    var accounts = options.accounts || [];
    var today = options.today || new Date().toISOString().slice(0, 10);
    var raw = String(input || '').trim();
    var text = normalize(raw);
    var removed = [];

    var draft = {
      raw: raw,
      kind: null,
      amountCents: null,
      categoryId: null,
      accountId: null,
      date: today,
      note: '',
      accountAmbiguous: false,
    };

    if (!text) return draft;

    /* date words */
    if (hasPhrase(text, 'the day before yesterday')) {
      draft.date = shiftDays(today, -2);
      removed.push('the day before yesterday');
      text = stripPhrase(text, 'the day before yesterday');
    } else if (hasPhrase(text, 'yesterday')) {
      draft.date = shiftDays(today, -1);
      removed.push('yesterday');
      text = stripPhrase(text, 'yesterday');
    }
    var fillerDate = /(today|tonight|this morning|this afternoon|this evening)/.exec(text);
    if (fillerDate) { removed.push(fillerDate[1]); text = stripPhrase(text, fillerDate[1]); }

    /* kind (scan for category against the text *with* the cue still present,
     * so "refund 30" still lands in the Refund category). No explicit cue ->
     * prefill with the caller's context (the view the user is looking at). */
    var kindHit = findKind(text);
    draft.kind = kindHit ? kindHit.kind : (options.defaultKind || null);
    var effectiveKind = draft.kind || 'expense';

    /* amount */
    var amt = findAmount(text);
    if (amt) {
      draft.amountCents = amt.amountCents;
      removed.push(amt.phrase);
      text = stripPhrase(text, amt.phrase);
    }

    /* account */
    var acct = matchAccount(text, accounts);
    if (acct.account) draft.accountId = acct.account.id;
    draft.accountAmbiguous = acct.ambiguous;

    /* category — table belongs to the effective kind */
    var catTable = effectiveKind === 'income'
      ? (options.incomeCategories || [])
      : (options.expenseCategories || []);
    var cat = matchCategory(text, catTable);
    if (!cat && draft.kind && draft.kind !== effectiveKind) {
      cat = matchCategory(text, effectiveKind === 'income' ? (options.expenseCategories || []) : (options.incomeCategories || []));
    }
    if (cat) draft.categoryId = cat.id;

    /* note: everything left, minus cue words and stopwords */
    var noteText = text;
    if (kindHit) { noteText = stripPhrase(noteText, kindHit.phrase); removed.push(kindHit.phrase); }
    for (var p = 0; p < acct.phrases.length; p++) noteText = stripPhrase(noteText, acct.phrases[p]);
    if (cat) noteText = stripPhrase(noteText, cat.phrase);
    var words = noteText.split(/\s+/).filter(function (w) {
      return w && w.length > 1 && STOP.indexOf(w) === -1 && !/^\d/.test(w);
    });
    var note = words.join(' ').slice(0, 80);
    draft.note = note ? note.charAt(0).toUpperCase() + note.slice(1) : '';

    draft.parsed = {
      kind: !!kindHit,
      amount: !!amt,
      account: !!acct.account,
      category: !!cat,
    };
    return draft;
  }

  /* --- Guided-voice helpers (one question at a time) --- */

  /* "Expense or income?" -> 'expense' | 'income' | null */
  function parseKind(input) {
    var text = ' ' + normalize(input) + ' ';
    if (!text.trim()) return null;
    var hit = findKind(text);
    return hit ? hit.kind : null;
  }

  /* "How much?" -> integer cents | null. Beyond the freeform amount logic
   * this understands spoken-cents forms common in money talk, which a plain
   * number accumulator gets wrong: "twenty four fifty" -> $24.50 (not $74),
   * "two dollars fifty" -> $2.50, "fifty cents" -> $0.50. */
  var TENS_WORD = { twenty: 1, thirty: 1, forty: 1, fourty: 1, fifty: 1, sixty: 1, seventy: 1, eighty: 1, ninety: 1 };
  var ONES_WORD = { one: 1, two: 1, three: 1, four: 1, five: 1, six: 1, seven: 1, eight: 1, nine: 1 };

  function wordsAll(tokens) {
    var r = tokens.length ? wordsToNumber(tokens, 0) : null;
    return (r && r.consumed === tokens.length) ? r.value : null;
  }

  function parseAmountCents(input) {
    var norm = normalize(input);
    if (!norm) return null;
    /* digits, with k / grand / cents units */
    var m = /(\d+(?:\.\d{1,2})?)\s*(k|grand|dollars?|bucks|cad|usd|cents?)?\b/.exec(norm);
    if (m) {
      var v = parseFloat(m[1]);
      var unit = m[2] || '';
      if (unit === 'k' || unit === 'grand') v *= 1000;
      if (unit === 'cent' || unit === 'cents') v /= 100;
      if (v > 0) return Math.round(v * 100);
    }
    var hadCents = /\bcents?\b/.test(norm);
    var tokens = norm.split(' ').filter(function (w) {
      return ['dollar', 'dollars', 'buck', 'bucks', 'cad', 'usd', 'cent', 'cents', 'and'].indexOf(w) === -1;
    });
    /* An ONES word followed by a TENS word is invalid in normal number
     * grammar — in money speech it means dollars-then-cents. */
    for (var j = 0; j + 1 < tokens.length; j++) {
      if (ONES_WORD[tokens[j]] && TENS_WORD[tokens[j + 1]]) {
        var d = wordsAll(tokens.slice(0, j + 1));
        var c = wordsAll(tokens.slice(j + 1));
        if (d !== null && c !== null && c <= 99) return d * 100 + c;
      }
    }
    var all = wordsAll(tokens);
    if (all !== null && all > 0) return hadCents && all < 100 ? all : all * 100;
    return null;
  }

  /* "What was it for?" -> category id | null.
   * Matches keyword lists first, then the category's own label words. */
  function matchCategoryGuided(input, categories) {
    var text = ' ' + normalize(input) + ' ';
    if (!text.trim()) return null;
    var byKw = matchCategory(text, categories);
    if (byKw) return byKw.id;
    for (var c = 0; c < categories.length; c++) {
      var cat = categories[c];
      if (hasPhrase(text, normalize(cat.id))) return cat.id;
      var words = normalize(cat.label || cat.id).split(' ').filter(function (w) { return w.length > 3; });
      for (var w = 0; w < words.length; w++) {
        if (hasPhrase(text, words[w])) return cat.id;
      }
    }
    return null;
  }

  /* note skip words — including common ASR mishearings of "no note"
   * ("no not", "no no", "know note"…), which landed as literal notes before. */
  var NOTE_SKIP = ['no', 'nope', 'no note', 'nothing', 'skip', "that's all", 'thats all', 'none', 'nah',
    'no not', 'no no', 'nono', 'know note', 'no notes', 'nada', 'nothing else', 'no thanks', 'no thank you'];
  function noteIsSkipped(input) {
    var t = normalize(input);
    return NOTE_SKIP.indexOf(t) !== -1;
  }

  var api = {
    parse: parse,
    parseKind: parseKind,
    parseAmountCents: parseAmountCents,
    matchCategoryGuided: matchCategoryGuided,
    noteIsSkipped: noteIsSkipped,
    normalize: normalize,
    wordsToNumber: wordsToNumber,
    TYPE_SYNONYMS: TYPE_SYNONYMS,
  };
  root.MTParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
