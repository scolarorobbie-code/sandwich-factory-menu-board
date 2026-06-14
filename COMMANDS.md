# COMMANDS — Sandwich Factory app cheat sheet

Quick reference so you can run things yourself without asking. All commands run
in the **Terminal** app on the Mac. The project folder is
`~/sandwich-factory-menu-board`.

> Tip: keep **two Terminal tabs** open — one for the backend (engine), one for
> the app. New tab = menu bar **Shell → New Tab**. Stop a running command =
> **Ctrl + C**.

---

## ▶️ Run the app (the everyday two steps)

**Tab 1 — backend (leave it running):**
```
cd ~/sandwich-factory-menu-board && npm run backend:dev
```
Wait for `Ready on http://localhost:8787`. Don't close this tab.

**Tab 2 — the app:**
```
cd ~/sandwich-factory-menu-board/apps/mobile && npm start
```
When the QR code appears, press the letter **i** → the iPhone simulator opens.

**Reload the app after changes:** click the simulator, press **⌘ R**.

---

## ⬇️ Get my latest changes

```
cd ~/sandwich-factory-menu-board && git fetch origin && git reset --hard origin/claude/new-session-u4xoyc
```
If I changed dependencies, also run: `npm install`
Then restart the backend (Ctrl+C → `npm run backend:dev`) and ⌘R the app.

---

## 🟦 Square

**Edit your secret settings (tokens):**
```
open -e ~/sandwich-factory-menu-board/services/backend/.dev.vars
```

**Connect the sandbox (first time / after a new token):**
```
cd ~/sandwich-factory-menu-board && npm run connect-square
```

**Copy your real menu from production → sandbox** (needs a valid
`SQUARE_PRODUCTION_ACCESS_TOKEN` in `.dev.vars`):
```
cd ~/sandwich-factory-menu-board && npm run mirror-catalog
```

---

## 🆘 If something breaks

- **"command not found: npm"** → Node isn't loaded; open a new Terminal tab.
- **"no such file / package.json"** → you're in the wrong folder; run the `cd ~/sandwich-factory-menu-board && ...` version.
- **App says "Couldn't load the menu"** → the backend tab isn't running; start Tab 1.
- **Square 401 "could not be authorized"** → the token in `.dev.vars` is wrong/expired; paste a fresh one.
- **Anything else** → copy the red error text and send it to Claude.
