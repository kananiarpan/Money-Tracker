# Money Tracker

A local-only personal money tracker. **No login, no server, no database** — everything is stored in your browser's `localStorage` on your device. Plain HTML/CSS/JS, no build step.

## Use it on the web

**https://kananiarpan.github.io/Money-Tracker/**

Open it in **Chrome or Edge** for the best voice support. It's a static site hosted on GitHub Pages — there is no backend. Everyone who opens the link gets their **own private, empty copy**: your entries never leave your device, and nobody else can see them.

On your very first visit, add your accounts in **Settings** (e.g. your chequing account, savings account, credit card) — then log everything else against them.

## Modules

| Module | Status |
|---|---|
| **Expenses** | ✅ Full — log, edit, delete, category breakdown, per-account filtering |
| **Earnings** | ✅ Full — same flow for income |
| **Analytics** | ✅ Full — cash-flow chart, category breakdowns with period deltas, balance trend, insights feed |
| **Invest** | 🔜 Placeholder — planned next (holdings per account, voice contributions, growth chart) |
| **Settings** | ✅ Accounts, currency, voice language, spoken prompts on/off, export / import / erase |

## Accounts first

Every earning or expense is tied to an **account** — nothing can be logged without one. Accounts are managed in **Settings** (add, rename, delete) and act as the options everywhere, including voice matching. A fresh install starts empty: add whatever accounts *you* actually have.

Types: bank account, credit card, cash, investment. Each account card shows its live balance (income − expenses).

## Adding by voice 🎙️

The main way to add anything. Tap the mic button (or press **V**) and the app walks you through the entry **one question at a time** — recognition only ever has to answer one narrow thing, which is far more accurate than parsing a whole sentence:

1. **Expense or income?**
2. **How much?** — digits or words, incl. money speech like *"twenty four fifty"* ($24.50) or *"fifty cents"*
3. **Paid via which account?** — (or *"Received in…"* for income); say the name exactly as you saved it, e.g. *"chequing"*, *"my credit card"*. With three or fewer accounts the app reads their names out loud.
4. **What was it for?** — category; say *"skip"* to file under Other
5. **Any note?** — say *"no note"* to skip

Each answer is confirmed aloud before the next question, every step offers **tappable chips** if you'd rather not speak, and *"back"* / *"cancel"* work as voice commands too. Impatient? Answer the first question with the whole entry — *"spent 25 on coffee from chequing"* — and every step it covers is skipped. Either way, the **confirmation card** appears before anything is saved, and the account field is always required. Nothing is ever written without that confirmation.

Spoken questions use your device's speech synthesis and can be turned off in **Settings → Preferences** (the questions still show on screen). The mic is only ever open *after* a question finishes, so the app never transcribes itself.

**Typed quick-add** uses the exact same parser: type `uber 18 from chequing` into the bar at the top of Expenses/Earnings and hit Enter.

## Analytics 📈

The **Analytics** tab turns your entries into the kind of views Monarch/YNAB/PocketGuard users pay for — computed locally, live, from whatever you've recorded:

- **Range presets** — 3 / 6 / 12 months, year-to-date, or all time, plus the same per-account filter chips as the lists.
- **Headline tiles** — earned, spent, and savings rate for the range, each compared against the previous equal-length block.
- **Cash flow** — income vs. spending per month as a grouped bar chart (with a plain-table view folded underneath for accessibility), net per month in the tooltip.
- **Where it went / came from** — category ranking bars for the range with each row's share and its delta versus the previous period (*Dining ▲32%*).
- **Balance trend** — your recorded balance day by day. Balances are pure income − expenses, so the line is always an honest replay of your entries.
- **Insights feed** — rule-based callouts when there's enough data: spending pace vs. last month (projected month-end), biggest category spike and drop, savings-rate movement, largest single expense, average daily spend, and concentration warnings.

Charts are drawn by pinned, SRI-verified [Chart.js](https://www.chartjs.org/) from a CDN — the only network request the app makes. Offline, every number still renders as a table.

### Voice browser support

| Browser | Voice input |
|---|---|
| Chrome / Edge | ✅ (server-based — needs internet; Chrome 139+ can use on-device) |
| Safari 14.1+ | ✅ legacy support |
| Firefox | ❌ (flag-gated) — typed quick-add does the same job |

Voice requires a secure context: HTTPS (GitHub Pages qualifies) or `localhost`/`file://` in practice. Mic permission must be granted when the browser asks.

### Voice troubleshooting

- **No permission prompt appears** → you probably opened `index.html` by double-clicking it (`file://`). Some browsers block the mic there *without asking*. Serve the folder instead: `npx serve .` — then open the `localhost` link. The app asks for mic access via the standard permission prompt before listening.
- **"Microphone is blocked for this page"** → click the lock/tune icon in the address bar → allow Microphone → retry.
- **"No microphone found" or "busy"** → Windows Settings → Privacy & security → Microphone → enable "Microphone access" and "Let desktop apps access your microphone".
- **"Needs an internet connection"** → Chrome/Edge send dictated audio to their speech service; go online or use typed quick-add.
- Unknown errors show their raw error code — handy when reporting issues.

## Data & privacy

- Everything lives in `localStorage` under the key `moneyTracker.v1` — one JSON document with `accounts`, `transactions`, `settings`.
- Nothing ever leaves your device through this app. (Chrome's speech-to-text sends the *audio you dictate* to Google's recognition service — that's the browser's speech API, not this app storing anything.)
- **Settings → Export backup** downloads that document as JSON; **Import** restores it. Export before switching browsers/devices, since storage is per-browser.
- **Erase all data** wipes the copy in the current browser only.

## Run it locally

Either just open `index.html` in a browser, or serve the folder (recommended, closest to production):

```bash
npx serve .
# or
python -m http.server 8000
```

## Deploy your own copy to GitHub Pages

```bash
git init
git add .
git commit -m "Money Tracker: local-only tracker with guided voice entry"
git branch -M main
git remote add origin https://github.com/<you>/money-tracker.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.** A minute later it's live at `https://<you>.github.io/money-tracker/` — HTTPS included, so the mic works. Even then, every visitor still gets their own separate private data — there is no shared storage anywhere.

## Project structure

```
index.html            shell
styles.css            dark minimalist theme
js/store.js           localStorage data layer (accounts, transactions, settings)
js/analytics.js       analytics compute (ranges, cash flow, balance series, insights — pure, Node-testable)
js/parser.js          voice/text parser (pure functions, Node-testable)
js/voice.js           Web Speech API wrapper (mic preflight, spoken prompts)
js/ui.js              views, modals, toasts, guided voice stepper, chart mounting
js/app.js             boot + shortcuts
test/parser.test.js   parser suite    — node test/parser.test.js
test/store.test.js    store suite     — node test/store.test.js
test/analytics.test.js analytics suite — node test/analytics.test.js
```

## Tests

```bash
node test/parser.test.js     # amounts, intent, categories, accounts, dates, guided-step helpers
node test/store.test.js      # accounts, entries, balances, totals, export/import, settings
node test/analytics.test.js  # month ranges, cash flow, category fold, balance series, insight rules
```

## Roadmap

- **Invest module** — holdings per investment account, "invested 500 in TFSA" voice flow, growth chart
- Budgets & monthly targets per category
- Service worker for offline use on GitHub Pages
- Recurring entries (rent, salary)
