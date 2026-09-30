# Money Tracker

A local-only personal money tracker. **No login, no server, no database** — everything is stored in your browser's `localStorage` on your device. Plain HTML/CSS/JS, no build step, so it runs anywhere including straight off GitHub Pages.

## Modules

| Module | Status |
|---|---|
| **Expenses** | ✅ Full — log, edit, delete, category breakdown, per-account filtering |
| **Earnings** | ✅ Full — same flow for income |
| **Invest** | 🔜 Placeholder — planned next (holdings per account, voice contributions, growth chart) |
| **Settings** | ✅ Accounts, currency, voice language, export / import / erase |

## Accounts first

Every earning or expense is tied to an **account** — nothing can be logged without one. Accounts are managed in **Settings** (add, rename, delete) and act as the options everywhere. A fresh install seeds two:

- **CIBC Current** (bank account)
- **CIBC Savings** (bank account)

Types: bank account, credit card, cash, investment. Each account card shows its live balance (income − expenses).

## Adding by voice 🎙️

The main way to add anything. Tap the mic button (or press **V**) and say something like:

- *"Spent 24 dollars on groceries from CIBC Current"*
- *"Earned 1500 salary in CIBC Savings"*
- *"Paid 60 for internet on my credit card"*
- *"Bought coffee for five dollars yesterday"*
- *"Got paid two thousand dollars"*

The app listens, parses the utterance — intent (spent/earned/…), amount (digits or number-words like "twenty five"), category keywords, account name, and date words — and opens a **confirmation card** pre-filled with what it understood. You review, fix anything, and save. Nothing is ever written without that confirmation, and the account field is always required.

**Typed quick-add** uses the exact same parser: type `uber 18 from cibc current` into the bar at the top of Expenses/Earnings and hit Enter.

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

## Run it locally

Either just open `index.html` in a browser, or serve the folder (recommended, closest to production):

```bash
npx serve .
# or
python -m http.server 8000
```

## Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Money Tracker: local-only tracker with voice entry"
git branch -M main
git remote add origin https://github.com/<you>/money-tracker.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.** A minute later it's live at `https://<you>.github.io/money-tracker/` — HTTPS included, so the mic works.

## Data & privacy

- Everything lives in `localStorage` under the key `moneyTracker.v1` — one JSON document with `accounts`, `transactions`, `settings`.
- Nothing ever leaves your device through this app. (Chrome's speech-to-text sends the *audio you dictate* to Google's recognition service — that's the browser's speech API, not this app storing anything.)
- **Settings → Export backup** downloads that document as JSON; **Import** restores it. Export before switching browsers/devices, since storage is per-browser.

## Project structure

```
index.html          shell
styles.css          dark minimalist theme
js/store.js         localStorage data layer (accounts, transactions, settings)
js/parser.js        voice/text command parser (pure functions, Node-testable)
js/voice.js         Web Speech API wrapper
js/ui.js            views, modals, toasts, listening overlay
js/app.js           boot + shortcuts
test/parser.test.js parser test suite — node test/parser.test.js
```

## Tests

```bash
node test/parser.test.js     # 37 cases: amounts, intents, categories, accounts, dates
```

## Roadmap

- **Invest module** — holdings per investment account, "invested 500 in TFSA" voice flow, growth chart
- Budgets & monthly targets per category
- Service worker for offline use on GitHub Pages
- Recurring entries (rent, salary)
