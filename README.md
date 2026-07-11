# DOMicile

**A design system and an AI-agent skill for building and reviewing UI work in shared HTML documents.**

Open a doc in your browser. Click anything that looks wrong. Type a note. The agent reads your comments and revises. That's the loop.

<p align="left">
  <a href="https://stoopery.app"><img alt="Sponsored by stoopery" src="branding/sponsor-stoopery.svg" width="160"></a>
</p>

---

## Why HTML, not Markdown

When an AI builds a UI for you, the deliverable is a page you actually open. Markdown specs and screenshots get stale; an interactive doc gets annotated.

DOMicile is built around that loop:

- You say *"let's build a settings page"*.
- The agent writes a real HTML page in your browser, with clickable sections and a feedback rail.
- You click what looks off, leave a note on that exact element, ask the agent to *"iterate"*.
- The agent revises. The notes stay attached to the elements they refer to.

When you're done, the agent hands you a clean deliverable: same design system, no rail, ready to ship.

---

## See it in 60 seconds

```bash
git clone https://github.com/zaco-tm/DOMicile.git
cd domicile
npm install
npm run smoke
```

Then open <http://127.0.0.1:8123/> in your browser. You'll see a working doc with a feedback rail on the right. Click any element with a dashed outline — its border turns terracotta — type a note in the rail, hit submit. Refresh the page. Your note is still there, anchored to that element.

That's the whole loop. When you're ready to ship, the agent produces a stripped-down HTML using the same primitives — no rail, no chrome.

---

## What's in the box

### The skill (load `SKILL.md`)

DOMicile is also an AI-agent skill. Agents that load `SKILL.md` learn three output modes:

| Mode | Trigger | Output |
|---|---|---|
| **Working doc — create** | "let's build X" | HTML in `.domi/output/`, feedback rail on, empty thread |
| **Working doc — audit** | "review this," "iterate" | Same chrome, existing thread loaded |
| **Deliverable** | "ship it," "give me the final" | Clean HTML, no rail, no chrome |

Iteration is piece-by-piece: the agent ships one section, you comment, it revises, repeat. No more "AI wrote me 800 lines and I had to reread it all."

### The design system

- **15 HTML primitives** — buttons, cards, forms, tables, navs, modals, alerts, badges, tabs, toasts, tooltips, inputs, selects, checkboxes, radios. Each has a `domi-*` class and reads tokens from a single CSS variables block.
- **5 archetype templates** — `dashboard`, `webapp-shell`, `mobile-app-shell`, `admin-tool`, `pos-kiosk`. Clone one, fill it in.
- **Neo theme (default)** — plum-to-peach gradient, frosted-glass surfaces, Helvetica Neue Black display + JetBrains Mono body. Drop in your own theme by replacing `tokens/tokens.json`.
- **Cross-platform wrappers** — same primitives for React (`@domi/react`), Astro (`@domi/astro`), and native Rust (`domi-egui`, WASM-capable). Token parity is enforced by a SHA-256 test.

### The server (optional)

`domi-server` (Rust + axum) lets the working doc persist comments to disk and push live updates over WebSocket. Standalone mode (no server) uses `localStorage` and works entirely from `file://`. Use the server when you want comments to survive across machines or collaborators.

---

## If you're not a designer

You don't need to read the design system to use DOMicile. Tell your agent:

- *"Make me a pricing page in the DOMicile style."*
- *"I want a settings screen. Use the dashboard layout."*
- *"Build me a sign-up flow, mobile-first."*

The agent handles primitives, tokens, and the working-doc chrome. You focus on what the page should *do* and what looks right.

---

## See it in action

> Walkthrough videos and the "DOMicile builds itself" demo are coming soon — this section will host the GIFs/MP4s once they're cut.

---

## Repo layout

```
SKILL.md                    ← load this in agents
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
packages/react/             ← @domi/react (15 components)
packages/astro/             ← @domi/astro (15 wrappers)
tools/                      ← smoke, skill-loop, e2e tests
docs/
  USAGE.md, DESIGN.md, STANDARDS.md    ← library reference
  AUDIT.md, EXTENDING.md, LAYOUTS.md   ← workflow + extension guides
  WIRE-PROTOCOL.md, RUST.md            ← technical specs
  superpowers/handoffs/                ← phase-by-phase status
```

---

## Status

The skill loop works end-to-end (local smoke and event-backed server modes both green). The library is stable and the skill is playable.

**Tests:** 250 JS passed (2 skipped) / 84 Rust passed (13 ignored).

---

## Contributing

1. Read `AGENTS.md` for repo conventions and the library invariant (don't edit `tokens/`, `components/`, or `templates/` without explicit sign-off).
2. For new primitives, themes, or archetypes, follow `docs/EXTENDING.md`.
3. For new layout recipes, add to `docs/LAYOUTS.md`.
4. All changes ship with tests — `npm test` and `cargo test --workspace` both stay green.

---

## License

MIT