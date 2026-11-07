# INDI AI — Local Build

**Your AI. Your PC. Your rules.**
_Your AI. Your PC. Your rules._

A JARVIS-style cognitive HUD that runs entirely on your machine: arc-reactor
core, voice in/out with cloning profiles, app registry, house & vehicle
control, research, image render, cinema storyboards, document intelligence.

---

## 1. Requirements

- **Node.js 18+** — https://nodejs.org

## 2. Setup (2 minutes)

```bash
# inside the folder:
python main.py            # Windows:  py main.py
```

`main.py` checks Node, installs dependencies, starts the local API server and
the UI, then opens your browser. No keys needed to boot.

Then, inside INDI AI: **Settings (gear) → API → paste your keys → CONNECT & RUN**.
You can name keys anything (`GROQ_API_KEY`, `MY_API_KEY`, …), add up to 200, and
optionally set a preferred provider. Keys are written to your local `.env` and
applied instantly — no restart.

Shell launchers still work as an alternative:

```bash
./run.sh                  # macOS / Linux
run.bat                   # Windows
```

The launcher installs dependencies, starts the **local API server** on
`http://localhost:8787` and the **INDI AI UI** on `http://localhost:8080`.

Default unlock passcode: **0000** (change it in `src/components/LockScreen.tsx`).

## 3. API keys

| Requirement | Value |
| --- | --- |
| Minimum keys | **2** |
| Maximum keys | **200** (any `*_API_KEY` in `.env` is auto-detected) |
| Zero-key mode | Works via the built-in offline rules engine |

INDI AI tries providers in order and automatically falls through on failure:
`EXILE_PRIMARY_PROVIDER` → other configured keys → offline rules.

Supported out of the box: OpenAI, Groq, Google Gemini, OpenRouter, Together,
DeepSeek, Mistral, xAI, Perplexity, Lovable AI Gateway.

Check what loaded: `curl http://localhost:8787/health`

## 4. Features

- **Arc reactor HUD** — centres when idle, shrinks to the **top-left** during
  conversation, docks **bottom-right** when images/video/documents are on
  screen. Spikes react to your microphone; the core pulses with INDI AI's speech.
- **Voice Lab** — record samples, tune pitch/rate/timbre, save multiple voice
  profiles, and set the active cloned voice INDI AI speaks with.
- **App Registry** — add any app or deep link (`https:`, `spotify:`, `mailto:`,
  `tel:`) and launch it from the HUD.
- **Modules** — Mission Control, Console, Research, Render, Cinema, Docs,
  Vision, Systems, Access, House, Vehicle, WhatsApp, Calls, Optics, Vault, Share.

## 5. Commands

```bash
npm install        # install dependencies
npm run dev        # UI only
npm run server     # local API only
npm run local      # both (what run.sh does)
npm run build      # production bundle in dist/
```

## 6. Troubleshooting

| Problem | Fix |
| --- | --- |
| "No provider could answer" | Check keys in `.env`, then `curl localhost:8787/health` |
| Mic/camera blocked | Browsers require `localhost` or HTTPS — use `localhost:8080` |

| Port in use | Change `EXILE_PORT` in `.env` |

## 7. Push to your own GitHub

```bash
git init
git add .
git commit -m "INDI AI local build"
git branch -M main
git remote add origin https://github.com/<you>/exile.git
git push -u origin main
```
