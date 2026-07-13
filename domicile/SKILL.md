---
name: domicile
description: Skill for authoring and iterating on UI work — components, primitives, layouts, themes — and for working through UI/UX changes with the user via shared HTML docs. Triggers on "build a UI library", "design a X", "let's work on Y", "review this UI", or any task where the user will open an HTML file in a browser to read or annotate it.
license: MIT
compatibility: Designed for Agent Skills-compatible clients (OpenCode, Claude Code, Kilo Code, PI, Roo Code, Cursor with system-prompt injection, etc.). Working-doc mode requires a browser; standalone mode uses localStorage and works from file://.
metadata:
  author: zaco-tm
  version: 0.1.0
  category: design-system
  subcategory: ui-authoring
  related: tokens, primitives, archetypes, working-doc, audit-loop
---

# DOMicile

Use this skill when the user wants to *create* UI work (a component, primitive, layout, theme, or archetype) using the DOMicile design system, OR when the user wants to *audit / iterate on* existing UI through a shared HTML document they can open in a tab and annotate.

Do NOT use this skill for: pure markdown reports, server-side code, anything the user won't open in a browser as HTML.

## Answer three questions first

Before writing any HTML, decide:

1. **Create-new or audit-existing?** ("let's build X" vs. "review this thing")
2. **Working doc or deliverable?** ("let's work on it" vs. "ship the final")
3. **Standalone or server runtime?** Asked once, only if question 2 lands on working-doc mode — see §"Runtime mode" below. Deliverables never need a runtime choice (they ship as static files).

The combination yields three output modes:

| Mode | Trigger | What you write |
|---|---|---|
| **Working doc — create** | "let's build," "draft," "I want to start on" | `.domi/output/<name>.html` with feedback rail + `data-feedback` hooks. `.domi/state/<name>.json` seeded empty. Neo skin. |
| **Working doc — audit** | "review," "iterate," "what should change" | Same chrome as create; load existing thread. |
| **Deliverable** | "ship," "give me the final," "hand off" | Clean HTML using agreed DOMicile primitives, no rail, no status chip. Theme is whatever the user picked (default neo). |

If you're not sure which mode, ask one question with the linguistic signal you saw, then proceed.

## Output locations

- Working artifacts: `.domi/output/<name>.html`
- Audit thread state: `.domi/state/<name>.json` (read or seed; mirror to `localStorage` for portability)
- Library paths: `tokens/tokens.json`, `components/primitives/<name>/`, `components/domi.css`, `scripts/runtime/domi.js`, `scripts/runtime/domi-audit.js`, `templates/<archetype>/index.html`
- Reference working doc: `templates/working-doc/index.html` — **clone it as your starting point** for any working-doc-mode artifact (audit rail, status chip, `data-feedback` hooks, neo skin all in place). `tools/skill-smoke.mjs` does the same clone + serves it on `http://127.0.0.1:8123/` for review. The smoke serves until SIGINT — foreground run with Ctrl-C; if you background it (common for non-interactive agents), record the PID and `kill <pid>` when finished.
- Event-backed serving: see §"Runtime mode" below. The high-level mechanics haven't changed — the server still auto-injects the `window.__DOMI_SERVER__` shim and `domi-audit.js` still routes comments to `POST /api/events` — but the user-facing flow is now mediated by `tools/domi-serve.sh`. `tools/skill-smoke-server-test.mjs` is still the right end-to-end verification tool.
- Server process metadata (runtime mode = server only): `.domi/server.url` (full URL, e.g. `http://127.0.0.1:54321/`), `.domi/server.pid` (PID of the running `domi-server`). Both written by `tools/domi-serve.sh start`, both removed by `tools/domi-serve.sh stop`. Gitignored.

Do NOT edit the library to do a one-off artifact. Edit the library only when the user explicitly says "add a primitive," "make a new theme," etc. — see `docs/EXTENDING.md`.

## Runtime mode: standalone or server

Before writing any iteration-eligible artifact (Working doc — create or audit, never Deliverable), the agent must ask the user one question:

**"Standalone (`file://` + `localStorage`) or server (event-backed, comments persist across devices)?"**

Default to standalone if the user doesn't pick — it works in any environment without setup. Recommend server when the user says they'll iterate across machines, share the doc, or want comments to survive a tab close + reopen cycle.

### If standalone (the default)

- Write `.domi/output/<name>.html` and tell the user to open it with `file://` or via `tools/skill-smoke.mjs` (which serves the working-doc template on `http://127.0.0.1:8123/`).
- `domi-audit.js` reads/writes `localStorage` only. No server, no port.
- Skip to "Working-doc chrome (audit mode)" below.

### If server

1. **Verify the binary exists.** The script prefers `./target/release/domi-server` and falls back to `./target/debug/domi-server`. If neither is present, **do not attempt to compile.** Tell the user:

   > The server binary isn't built yet. Run once:
   > `cargo build --release -p domi-server`
   > Then say "ready" and I'll start it.

   Wait for confirmation before proceeding.

2. **Start the server.** Run `tools/domi-serve.sh start`. The script:
   - picks an ephemeral port via `--port 0` (no collisions with other processes);
   - writes the chosen URL to `.domi/server.url`;
   - writes the PID to `.domi/server.pid`;
   - serves `.domi/output/` as root and `.domi/state/` as the audit thread store.

3. **Read `.domi/server.url`** and pass that URL (not a `file://` path) to the user as the link to open.

4. **All working docs written this session use that URL** as their reference point, with paths relative to `.domi/output/`. The server injects the `__DOMI_SERVER__` shim, which makes `domi-audit.js` route comments through `POST /api/events` and listen for live updates on `/ws/events`.

### Lifecycle

The skill **starts** the server but **does not stop it.** The user owns stop: `tools/domi-serve.sh stop` (reads `.domi/server.pid`, sends SIGTERM, cleans up `.domi/server.url` and `.domi/server.pid`). Why: the page may be open in another tab/session; killing on session-end would orphan work in progress. Stop on demand is one shell command.

### If something goes wrong

- `tools/domi-serve.sh start` fails with "binary not found" → user hasn't built. Show the `cargo build` line, wait.
- `tools/domi-serve.sh start` fails with "already running" → a previous server is alive. Tell the user: `tools/domi-serve.sh status` to inspect, `tools/domi-serve.sh stop` to clear.
- Page loads but comments don't persist after reload → the URL the user opened isn't the server's URL (likely `file://`). Tell them to open `.domi/server.url` instead.

## Working-doc chrome (audit mode)

The agent includes on every working-doc page:

- A right-side feedback rail (loaded from `scripts/runtime/domi-audit.js`).
- `data-feedback="<meaningful-id>"` on every element the user is likely to want to comment on (section headers, interactive primitives, layout decisions).
- A status chip showing `vN` of the working doc, visible top-right.
- Thread entries are scoped to a target id and rendered next to the element on reload.

**Per-element targeting is the whole point.** When the user clicks an element with a `data-feedback` hook, the form's "Targeting" hint updates to that id and the next comment submits with that `targetId` instead of `null`. The user's typical loop is: open the doc, click section X, leave a comment, click section Y, leave another comment, hit the agent with "iterate." Thread entries persist in `localStorage` (standalone) or the Rust server.

**Iteration mode is piece-by-piece, not page-at-a-time.** When the user says "build X," "design Y," or hands you a working-doc prompt, do **not** generate the entire artifact in one turn. Instead:

1. Build **one section first** with real primitives and a `data-feedback="<section-name>"` hook. Hand off with the URL ready.
2. Wait for the user to click that section and leave a comment. They will comment on the smallest pieces — headings, card copy, button hierarchy — not the whole page.
3. Revise that section. Bump the status chip to `vN`. Hand off again.
4. Repeat for the next section.

If the user explicitly asks for "the full thing," you may draft the whole doc in one turn, but the section hooks, status chip, and click-to-target wiring must all be in place so iteration can begin immediately.

See `docs/AUDIT.md` for the JSON schema, domi-audit API, and end-to-end loop.

## Authoring new UI work (not consuming existing)

To *consume* the library, point at the path. To *add to it*, follow the contribution rules:

- New theme → `docs/EXTENDING.md#new-theme`
- New primitive → `docs/EXTENDING.md#new-primitive`
- New archetype → `docs/EXTENDING.md#new-archetype`
- New layout recipe → `docs/LAYOUTS.md`

## Aesthetic — Neo-Glass-Vintage Sunset Pastel

Neo is the **default skin for working docs and audit surfaces**. Deliverables can be in any theme; default to neo only if the user does not specify one.

```text
Background:  plum → coral → peach  (#a89cc8 → #f4978e → #ffd6b3) at 135°
Surfaces:    rgba(255,255,255, 0.4–0.8) + backdrop-filter blur(12px)
Display:     Helvetica Neue Black, uppercase, tight tracking
Body/labels: JetBrains Mono / SF Mono
Text:        dark plum #3d2342
Success:     sage #9caf88     Danger: terracotta #c2410c
```

## Reference

- Audit loop how-to: `docs/AUDIT.md`
- Library extension how-to: `docs/EXTENDING.md`
- Layout recipes: `docs/LAYOUTS.md`
- Design tokens: `tokens/tokens.json`
- Library primitives: `components/primitives/<name>/README.md`
- Library archetypes: `templates/<name>/README.md`
- Full library docs: `docs/DESIGN.md`, `docs/USAGE.md`, `docs/STANDARDS.md`
- Status: `status/STATUS.html`
