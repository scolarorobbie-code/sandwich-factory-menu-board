# COMMANDS — Sandwich Factory app cheat sheet

Your plain-English guide to running the app. You don't need to understand the
code — you just need these few commands. Copy/paste them exactly. When in doubt,
send me the screen and I'll tell you what to do.

---

## 🧭 First, the 30-second vocabulary

- **Terminal** — the black text window where you type commands. (It's an app on
  your Mac, in Applications → Utilities, or search "Terminal" with ⌘+Space.)
- **Command** — a line you paste and press **Return** to run.
- **Tab** — Terminal can have multiple tabs, like a browser. New tab = menu bar
  **Shell → New Tab** (or **⌘ T**). We keep **two** open.
- **Backend** — the "engine" that talks to Square. Runs in Tab 1.
- **The app** — what you see in the iPhone simulator. Runs in Tab 2.
- **Simulator** — a fake iPhone on your screen for testing, no real phone needed.
- **Ctrl + C** — stops whatever is running in that tab. (Hold Control, press C.)
- **`~`** — shortcut for your home folder. `~/sandwich-factory-menu-board` is the
  project folder.
- **`.md` file** (like this one) — just a plain-text notes file. Open one with
  `open -e <path>`. Nothing to be scared of.

> 💡 Golden rule: the **backend** command runs from the project root
> (`~/sandwich-factory-menu-board`). The **app** command runs from the
> `apps/mobile` folder. Most "Missing script" or "no package.json" errors are
> just being in the wrong folder — the `cd ...` part of each command fixes that.

---

## ▶️ Run the app (the everyday two steps)

**Tab 1 — backend (start first, leave it running):**
```
cd ~/sandwich-factory-menu-board && npm run backend:dev
```
Wait for `Ready on http://localhost:8787`. **Don't close this tab.**

**Tab 2 — the app** (open a new tab with **⌘ T**):
```
cd ~/sandwich-factory-menu-board/apps/mobile && npm start
```
When the QR code appears, press the letter **i** → the iPhone simulator opens.

**Reload the app after any change:** click the simulator, press **⌘ R**.

**To stop for the day:** click each tab, press **Ctrl + C**. (Nothing is lost —
your code is safe on GitHub.)

---

## ⬇️ Get my latest changes

Whenever I tell you I pushed an update, run this to pull it onto your Mac:
```
cd ~/sandwich-factory-menu-board && git fetch origin && git reset --hard origin/claude/new-session-u4xoyc
```
⚠️ This **overwrites local files** with my version. That's what we want when
syncing to my changes — but if *you* (or Cowork) made edits you want to keep,
tell me first.

If I mention I changed dependencies, also run: `npm install`
Then restart the backend (Ctrl + C → `npm run backend:dev`) and **⌘ R** the app.

---

## 🟦 Square commands

**Edit your secret settings (tokens) — opens in TextEdit:**
```
open -e ~/sandwich-factory-menu-board/services/backend/.dev.vars
```
🔒 This file holds your Square keys. **Never paste its contents into a chat.**

**Connect the sandbox (first time, or after pasting a new token):**
```
cd ~/sandwich-factory-menu-board && npm run connect-square
```

**Copy your real menu from production → sandbox** (needs a valid
`SQUARE_PRODUCTION_ACCESS_TOKEN` in `.dev.vars`):
```
cd ~/sandwich-factory-menu-board && npm run mirror-catalog
```

**Add the "Choose Your Drink" picker to every combo item:**
```
cd ~/sandwich-factory-menu-board && npm run add-drink-set
```
Safe to run more than once — it never makes duplicates, only fills in what's
missing. Run this if a combo item shows no drink chooser.

---

## 🧪 Run a test order (the Phase 1 milestone)

1. In the app, build any item → pick options → **Add to cart**.
2. Tap the cart bar → **Go to checkout**.
3. Create an account — any email + password (it's a sandbox, not real).
4. Checkout shows the total, with **tax calculated by Square**.
5. Tap the gold **Pay** button — uses Square's test card, **no real money**.
6. You land on the **order status** screen.
7. **The proof:** open **squareupsandbox.com → Orders** — your order should be
   there as a Pickup order, just like it would on your real POS.
8. Tap **"Simulate staff updating the order"** to watch it go Making → Ready.

---

## 🆘 If something breaks

- **"command not found: npm"** → open a fresh Terminal tab and try again.
- **"Missing script" / "no such file / package.json"** → you're in the wrong
  folder. Use the full `cd ~/sandwich-factory-menu-board && ...` version.
- **App says "Couldn't load the menu"** → the backend (Tab 1) isn't running;
  start it.
- **Square 401 "could not be authorized"** → the token in `.dev.vars` is
  wrong/expired; paste a fresh one and re-run `npm run connect-square`.
- **Simulator won't open / "No iOS device"** → open Xcode → Settings → Platforms
  → download the iOS simulator (one-time, ~7GB).
- **Anything else** → copy the red error text and send it to me. Screenshots are
  great too. There's no dumb question — that's literally what I'm here for.
