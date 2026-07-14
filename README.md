<div align="center">

# DOMicile

<img src="branding/domi-mascot.png" alt="DOMi, the DOMicile mascot" width="140">

**Open the page. Click what's wrong. The agent fixes it. Repeat until you ship.**

[![npm version](https://img.shields.io/npm/v/domicile-react?label=npm&color=8B4567)](https://www.npmjs.com/package/domicile-react)
[![crates.io](https://img.shields.io/crates/v/domi-egui?label=crates.io&color=CC6B49)](https://crates.io/crates/domi-egui)
[![License](https://img.shields.io/badge/license-MIT-3d2342)](./LICENSE)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-compatible-9caf88)](https://agentskills.io)
![Tests](https://img.shields.io/badge/tests-250%20JS%20%2F%2084%20Rust-c2410c)

</div>

---

## The problem

AI writes you 800 lines of HTML. You open it. Something's off — the sidebar is too wide, the button is the wrong color. You paste a screenshot back into the chat. It rewrites 800 lines. You open it again. Different thing is wrong.

## DOMicile's answer

The document *is* the conversation. Open the page. Click the thing that's wrong. Type six words. The agent fixes just that part. Repeat until it's right, then hand it off — clean HTML, no chrome, ready to ship.

---

## Who is this for?

**You're an AI agent.** Load `domicile/SKILL.md`. You now know the three output modes and the 15 primitives. Go build.

**You're a developer.** `npm install domicile-react`, copy the CSS, start composing. Same primitives, React / Astro / Rust — pick your stack.

**You're a curious human.** Open `templates/dashboard/index.html` in a browser. No install, no build step. Just a page you can click around.

---

## See it in 60 seconds

```bash
git clone https://github.com/zaco-tm/DOMicile.git
cd DOMicile
npm install
npm run smoke
```

Then open <http://127.0.0.1:8123/> in your browser. You'll see a working doc with a feedback rail on the right. Click any element with a dashed outline — its border turns terracotta — type a note in the rail, hit submit. Refresh the page. Your note is still there, anchored to that element.

That's the whole loop. When you're ready to ship, the agent produces a stripped-down HTML using the same primitives — no rail, no chrome.

```mermaid
graph TD
    A[Agent writes HTML] --> B[You open the page]
    B --> C[Click what's wrong]
    C --> D[Type a note]
    D --> E[Agent revises just that part]
    E --> F{Happy?}
    F -- Not yet --> C
    F -- Ship it --> G[Clean deliverable — no chrome]
```

---

## Why HTML, not Markdown

Here's the thing about markdown specs and screenshots: they go stale the second you open them. An interactive doc gets annotated in place, with comments anchored to the exact element you meant — not to a paragraph that might or might not still be there next revision.

DOMicile is built around that loop:

- You say *"let's build a settings page"*.
- The agent writes a real HTML page in your browser, with clickable sections and a feedback rail.
- You click what looks off, leave a note on that exact element, ask the agent to *"iterate"*.
- The agent revises. The notes stay attached to the elements they refer to.

When you're done, the agent hands you a clean deliverable: same design system, no rail, ready to ship.

---

## Install

Three options depending on what you're after. Full details in [`INSTALL.md`](INSTALL.md).

### For AI agents

DOMicile ships as an [Agent Skills](https://agentskills.io)-compatible `SKILL.md`. Install with one command per agent:

| Agent | Install |
|---|---|
| Universal one-line (vercel-labs/skills, 15+ agents) | `npx skills add zaco-tm/DOMicile -g` |
| Universal one-line (agent-install, 14+ agents) | `npx agent-install skill add zaco-tm/DOMicile -g` |
| Universal (`~/.agents/skills/`) | `cp -R domicile/domicile ~/.agents/skills/domicile` |
| OpenCode | `cp -R domicile/domicile ~/.config/opencode/skills/domicile` |
| Claude Code | `cp -R domicile/domicile ~/.claude/skills/domicile` |
| Kilo Code | `cp -R domicile/domicile .roo/skills/domicile` |
| PI | `cp -R domicile/domicile ~/.pi/skills/domicile` |
| Any other Agent Skills client (Crush, Dirac, …) | `cp -R domicile/domicile <config-dir>/skills/domicile` |

> ⚠️ **Skill scope.** Each install path above copies the full bundle (`SKILL.md` plus runtime JS plus CSS plus one starter template). Full library (other archetypes, primitives, the Rust `domi-server` binary) requires `git clone`. See [`INSTALL.md`](INSTALL.md) for details.

See [`INSTALL.md`](INSTALL.md) for prompt-injection fallback if your agent has no skills discovery.

### For developers using the wrappers

```bash
npm install domicile-react react react-dom     # React
npm install domicile-astro astro                # Astro
```

Copy `components/domi.css` into your project. For Rust:

```toml
[dependencies]
domi-egui = "0.1"
```

---

## What's in the box

### The skill (load `domicile/SKILL.md`)

DOMicile is also an AI-agent skill. Agents that load `domicile/SKILL.md` learn three output modes:

| Mode | Trigger | Output |
|---|---|---|
| **Working doc — create** | "let's build X" | HTML in `.domi/output/`, feedback rail on, empty thread |
| **Working doc — audit** | "review this," "iterate" | Same chrome, existing thread loaded |
| **Deliverable** | "ship it," "give me the final" | Clean HTML, no rail, no chrome |

One section at a time. No more "AI wrote me 800 lines and I had to reread it all."

### The design system

- **15 HTML primitives** — buttons, cards, forms, tables, navs, modals, alerts, badges, tabs, toasts, tooltips, inputs, selects, checkboxes, radios. Each has a `domi-*` class and reads tokens from a single CSS variables block.
- **5 archetype templates** — `dashboard`, `webapp-shell`, `mobile-app-shell`, `admin-tool`, `pos-kiosk`. Clone one, fill it in.
- **Neo theme (default)** — plum-to-peach gradient, frosted-glass surfaces, Helvetica Neue Black display + JetBrains Mono body. Drop in your own theme by replacing `tokens/tokens.json`.
- **Same primitives, three languages** — React (`domicile-react`), Astro (`domicile-astro`), and native Rust (`domi-egui`, WASM-capable). Because why not. Token parity is enforced by a SHA-256 test.

### The server (optional)

`domi-server` (Rust + axum) lets the working doc persist comments to disk and push live updates over WebSocket. Standalone mode (no server) uses `localStorage` and works entirely from `file://`. Use the server when you want comments to survive across machines or collaborators.

---

## Good news: you don't need taste. You need eyes

You don't need to read the design system to use DOMicile. First make sure your agent has the skill installed (see [Install](#install) above) — that loads `domicile/SKILL.md` with the trigger phrases, output modes, and primitives the agent needs. Then tell your agent:

- *"Make me a pricing page in the DOMicile style."*
- *"I want a settings screen. Use the dashboard layout."*
- *"Build me a sign-up flow, mobile-first."*

The agent handles primitives, tokens, and the working-doc chrome. You focus on what the page should *do* and what looks right.

---

## See it in action

GIF/MP4 walkthroughs of the loop in action are coming soon — this section will host them once they're cut.

**Troubleshooting?** See [`INSTALL.md`](INSTALL.md) for per-client install paths, prompt-injection fallback, and common-error fixes.

---

## Repo layout

```text
domicile/SKILL.md           ← load this in agents
AGENTS.md                   ← repo conventions for agents
README.md                   ← you are here
tokens/                     ← design tokens (single source of truth)
components/
  primitives/<name>/        ← 15 HTML primitives
  domi.css                  ← primitive styles
templates/<archetype>/      ← dashboard, webapp-shell, mobile-app-shell, admin-tool, pos-kiosk, working-doc
scripts/runtime/            ← domi.js, domi-audit.js, domi-server.js, domi-wire.js
crates/domi-server/         ← Rust HTTP binary + agent CLI
crates/domi-egui/          ← Rust native widgets + composites
packages/react/             ← domicile-react (15 components)
packages/astro/             ← domicile-astro (15 wrappers)
tools/                      ← smoke, skill-loop, e2e tests
docs/
  USAGE.md, DESIGN.md, STANDARDS.md    ← library reference
  AUDIT.md, EXTENDING.md, LAYOUTS.md   ← workflow + extension guides
  WIRE-PROTOCOL.md, RUST.md            ← technical specs
```

---

## Status

The skill loop works end-to-end (local smoke and event-backed server modes both green). The library is stable and the skill is playable.

**Tests:** 250 JS passed (2 skipped) / 84 Rust passed (13 ignored).

---

## License

MIT — do whatever you want with it.

---

**Sponsored by [stoopery](https://stoopery.app)** — funding development time and in-house testing.

<a href="https://stoopery.app"><img alt="Sponsored by stoopery" src="branding/sponsor-stoopery.svg" width="88"></a>

Built by [@zaco-tm](https://github.com/zaco-tm) at [stoopery](https://stoopery.app).
