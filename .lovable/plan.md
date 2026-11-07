# INDI AI Volume 4 — Phase 1 Build Plan

Your list spans ~30 major systems. Shipping them all in one turn would produce shallow stubs. I'll build **Phase 1** now — the foundation the rest plugs into — then iterate. Tell me to proceed and I'll build it.

## What ships in Phase 1

### 1. Unique INDI AI logo
- Custom SVG mark: a broken/liberated ring with an inner glowing "I" core (represents "independent, self-owned core"). Cyan HUD gradient, animated pulse.
- Used in header, favicon, loading screen, and page metadata (`og:image`).

### 2. Mission Control (the new home view)
Replaces the current grid as the default landing dashboard. Panels:
- **Active Goals** — long-term objectives with progress bars
- **Agent Roster** — status of each specialist agent (idle/thinking/acting)
- **Running Automations** — scheduled + triggered workflows
- **Approvals Queue** — actions awaiting user confirmation
- **Reasoning Log** — live stream of what INDI AI is thinking/doing + confidence
- **Suggested Next Actions** — predictive nudges
- **System Health** — cloud/local/offline model status, memory usage
- **Recent Memory Updates** — what INDI AI just learned about you

### 3. Multi-Agent architecture (core + 5 agents to start)
- **CEO Agent** (router/coordinator) — decides which specialist handles a request
- **Research Agent** — web search + citations
- **Coding Agent** — code gen/debug
- **Finance Agent** — expense/subscription tracking
- **Security Agent** — breach/leak monitoring
- Each agent has: name, system prompt, tools, status, last action, confidence.
- Backend: extend `exile-chat` edge function to route by agent, or add `exile-agents` function with agent registry.
- Rest of the 10+ agents scaffolded as "coming online" cards so the architecture is visible.

### 4. Persistent memory (encrypted)
- New `memories` table in Lovable Cloud (RLS-scoped to user).
- Categories: identity, preferences, projects, people, events, mistakes, achievements.
- Auto-extraction: after each chat turn, a background call distills durable facts and stores them.
- Retrieval: injected into every agent's system prompt as "What you know about the user".
- UI: Memory panel to view/edit/delete — user owns their data.

### 5. Capability Engine scaffold
- `src/lib/capabilities/` registry: each capability declares `id`, `name`, `requires` (permissions/secrets), `status`, `invoke()`.
- Existing features (Home Assistant, Car, WhatsApp, Calls, Camera, Voice) refactored into capability entries.
- Mission Control shows which capabilities are live vs. locked.

### 6. Auth gate (prereq for encrypted memory)
- Simple email/password + Google sign-in (Lovable Cloud default).
- Session-scoped memory and agent state.

## What's deferred to later phases (explicitly not now)

These need native/desktop runtime, deep OS access, or external services I want to scope with you first:

- **Phase 2** — Voice-first with wake word, offline STT/TTS, document understanding (PDF/image ingest with embeddings), research mode with real browsing.
- **Phase 3** — Automation engine + self-improving workflows, goal engine (natural-language goal → roadmap), simulation engine, personalized dashboard tuning.
- **Phase 4** — Digital twin, life timeline, knowledge graph, cross-device sync (needs mobile/desktop clients).
- **Phase 5 (native only)** — Real OS control, desktop automation (Photoshop-style), universal browser agent, computer vision on screen, autonomous meetings, robotics, AR glasses. These require the Python v11 local build, not the web app.
- **Marketplace / Plugin SDK / Personal fine-tuned model** — after the capability engine has real users.

## Technical section

- Logo: `src/components/ExileLogo.tsx` (animated SVG), also written to `public/logo.svg` + `public/favicon.svg`.
- Mission Control: `src/components/MissionControl.tsx` becomes default section; existing grid moved to a "Modules" tab.
- Agents: `src/lib/agents/registry.ts` (definitions), `src/lib/agents/router.ts` (CEO routing logic), server-side execution in `supabase/functions/exile-agents/index.ts`.
- Memory: migration for `memories` table (user_id, category, key, value jsonb, embedding vector optional later, timestamps) with RLS + GRANTs; `supabase/functions/memory-extract` runs after chat turns.
- Capability registry: `src/lib/capabilities/index.ts` + one file per capability.
- Auth: reuse Lovable Cloud email/password + Google; wrap app in `<AuthGate>`.

## Non-goals for this turn

- No fake "OS control" buttons that don't work.
- No stubbed marketplace UI.
- No claim of features that need a native runtime.

---

**Reply "go" and I'll build Phase 1.** Or tell me to reorder — e.g. "logo + Mission Control only", or "skip auth for now, use localStorage memory", or "add voice wake word to Phase 1".
