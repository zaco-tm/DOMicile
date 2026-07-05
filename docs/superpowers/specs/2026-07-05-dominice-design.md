# DOMiNice — Design Spec

**Status:** Draft v1 — pending user review
**Date:** 2026-07-05
**Target version:** 1.0 (shipped over 4 implementation phases)

## 1. Vision

DOMiNice is a cross-platform UI design system with an AI-agent authoring layer on top. **The driving documents in any agent↔human loop are interactive HTML, not markdown.** The skill teaches an AI agent to produce and iterate on rich HTML artifacts; the design system underneath (tokens, primitives, archetypes) is portable to React/Astro webapps and Rust desktop/mobile apps via DVUI-inspired patterns.

## 2. Scope (v1.0)

In scope:

- Skill (`SKILL.md`) for AI agents to author DOMiNice artifacts
- Design token schema (JSON) — single source of truth across all targets
- HTML canonical component library + React wrappers + Astro wrappers + Rust/DVUI-style crate
- Live server (`domi-server`) — Rust binary, folder-watch, hot-reload, feedback loop
- Inlined `domi.js` runtime (~10KB) for standalone interactivity with optional server-attached upgrades
- Five docs: `DESIGN.md`, `USAGE.md`, `STANDARDS.md` (Markdown) + `STATUS.html`, `UX-MEMORY.html` (HTML)
- 5 archetype templates: `dashboard`, `webapp-shell`, `mobile-app-shell`, `admin-tool`, `pos-kiosk`
- Open-sourceable from day one — single Rust binary, no Node/npm required to run; MIT or Apache-2.0 license

Deferred to v2:

- Chat-back-to-agent from within the HTML artifact
- Multi-device sync
- Version history UI

Out of scope (explicit non-goals):

- Mobile UI libs other than the Rust/DVUI-style crate (no SwiftUI, Kotlin, React Native ports)
- Hosted/SaaS version of the live server — local-only by design
- Multi-user collaboration or real-time co-editing (CRDT/OT) — feedback is one-way: human → events → agent → rewrite → human re-views
- CMS / content management features
- Authentication on the live server (it runs on localhost)
- Blog/web publishing features
- Browser extensions, IDE plugins
- Built-in AI image generation — **but** artifacts render any images the agent generates via standard `<img>` / CSS, provided the agent's model, plugin, or skill supports image gen

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  AI Agent loads SKILL.md                                │
│  → writes HTML+CSS+JS to <project>/.domi/output/        │
└─────────────────────────────────────────────────────────┘
                        ↓ file writes
┌─────────────────────────────────────────────────────────┐
│  domi-server (Rust binary)                              │
│  • watches .domi/output/                                │
│  • serves at localhost:PORT                             │
│  • inlines domi.js + server flag into served HTML       │
│  • captures feedback events → .domi/state/events.jsonl  │
│  • WebSocket push to agent (optional)                   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Browser → user views / clicks / fills → feedback →      │
│  .domi/state/events.jsonl + WebSocket to agent          │
└─────────────────────────────────────────────────────────┘

Component layer (multi-target, shares JSON tokens):
  tokens.json ─┬─→ HTML+CSS+JS primitives (canonical)
               ├─→ @domi/react (thin wrappers)
               ├─→ @domi/astro (thin wrappers)
               └─→ domi-dvui crate (Rust widgets, DVUI-inspired patterns)
```

## 4. Aesthetic System — Neo-Glass-Vintage "Sunset Pastel"

The visual identity for all DOMiNice artifacts. Locked during brainstorming on 2026-07-05.

### 4.1 Tokens (`tokens.json`)

```jsonc
{
  "color": {
    "primary": {
      "gradient": ["#a89cc8", "#f4978e", "#ffd6b3"],  // plum → coral → peach
      "angle": "135deg"
    },
    "secondary": { "sage": "#9caf88", "sage_light": "#c8d6b8" },
    "accent":    { "plum": "#a89cc8", "plum_light": "#d8d0e8" },
    "text":      { "default": "#3d2342", "muted": "#3d2342aa", "inverse": "#fff1e6" },
    "surface":   { "glass": "#ffffff60", "glass_strong": "#ffffff80", "tint": "#3d234208" }
  },
  "type": {
    "display": { "family": "'Helvetica Neue', 'Arial Black', sans-serif", "weight": 900, "transform": "uppercase", "letterSpacing": "-0.02em" },
    "body":    { "family": "'SF Mono', 'JetBrains Mono', monospace", "weight": 400 },
    "label":   { "family": "'SF Mono', 'JetBrains Mono', monospace", "weight": 700 }
  },
  "radius":   { "sm": "4px", "md": "8px", "lg": "16px", "pill": "9999px" },
  "glass":    { "blur": "12px", "bgOpacity": 0.4, "borderOpacity": 0.4 },
  "border":   { "thin": "1px solid rgba(61,35,66,0.4)", "thick": "2px solid #3d2342" },
  "space":    { "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "40px" },
  "shadow":   { "soft": "0 2px 12px rgba(61,35,66,0.12)", "offset": "0 3px 0 #3d2342" },
  "breakpoint": { "sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px" }
}
```

This JSON is the contract. Every target (HTML, React, Astro, Rust/DVUI) consumes it. Changing a token updates all four.

### 4.2 Type system

- **Display headlines** — Helvetica Neue Black (or Arial Black fallback), uppercase, tight letter-spacing, used for hero/page titles
- **Body & UI text** — JetBrains Mono / SF Mono, used for everything from paragraphs to labels to buttons
- **Code blocks** — same mono family

The mono-as-body choice is the quirky backbone of the "neo-glass-vintage" feel — it gives the interface a slightly terminal/technical vibe while staying readable.

### 4.3 Glass surfaces

All cards, buttons, and elevated surfaces use `backdrop-filter: blur(12px)` with `rgba(255,255,255,0.4–0.8)` backgrounds and `1px solid rgba(61,35,66,0.4)` borders. Creates the "vintage frosted glass" feel that ties the palette together.

### 4.4 Component radius

Default `8px` for buttons and inputs. `4px` for tags/badges. `16px` for cards. `9999px` (pill) only when explicitly chosen.

## 5. File / Repo Structure

```
DOMiNice/
├── README.md                       # quickstart + install + 30s demo
├── LICENSE                         # MIT or Apache-2.0
├── SKILL.md                        # agent entrypoint
│
├── docs/                           # human-editable markdown
│   ├── DESIGN.md                   # principles, token reference, aesthetic guide
│   ├── USAGE.md                    # how to use the skill, recipes, examples
│   └── STANDARDS.md                # HTML/CSS/JS conventions, a11y baseline
│
├── status/                         # agent-maintained HTML docs
│   ├── STATUS.html                 # current status, roadmap, known issues
│   └── UX-MEMORY.html              # feedback themes, user pain points, decisions
│
├── tokens/
│   └── tokens.json                 # single source of truth
│
├── templates/                      # 5 archetype scaffolds
│   ├── dashboard/
│   ├── webapp-shell/
│   ├── mobile-app-shell/
│   ├── admin-tool/
│   └── pos-kiosk/
│
├── components/                     # canonical HTML primitives
│   ├── primitives/                 # button, card, form, table, modal, nav, etc.
│   │   └── <name>/<name>.html, <name>.css, README.md
│   ├── layouts/                    # shared layout patterns
│   └── scripts/
│       ├── domi.js                 # ~10KB inlined runtime
│       └── README.md
│
├── packages/                       # multi-target wrappers
│   ├── react/                      # @domi/react (npm)
│   └── astro/                      # @domi/astro (npm)
│
├── crates/                         # Rust workspace
│   ├── domi-tokens/                # parses tokens.json → typed structs
│   ├── domi-server/                # CLI binary (axum + notify + tokio)
│   └── domi-dvui/                  # Rust widgets (DVUI-inspired immediate-mode)
│
├── scripts/
│   ├── install.sh                  # installs domi-server binary
│   └── verify.sh                   # smoke-tests the install
│
├── .gitignore                      # .domi/, .superpowers/, target/, node_modules/
└── .domi/                          # gitignored runtime dir
    ├── output/                     # agent writes HTML here → server serves it
    └── state/                      # feedback events, server logs
```

## 6. Live Server Behavior

### 6.1 CLI

```
domi serve [DIR] [--port N] [--open] [--host H]
```

- `DIR` defaults to `./.domi/output/`
- Port defaults to a random ephemeral port (avoids collisions across projects)
- `--open` launches the user's default browser on start
- On start: writes `.domi/state/server-info.json` with `{pid, url, port, dir, ws_endpoint}`
- On file change: parses the HTML, injects `<script>window.__DOMI_SERVER__=true</script>` and the live-reload client, pushes update to browser via WebSocket (no full page reload — preserves scroll/focus)
- On browser feedback event: appends JSONL line to `.domi/state/events.jsonl` AND broadcasts to WebSocket subscribers (the agent session)
- Graceful shutdown on SIGINT/SIGTERM, releases port

### 6.2 Feedback event schema

One JSON object per line in `.domi/state/events.jsonl`:

```json
{"type":"click","selector":"button[data-choice='apply']","ts":"2026-07-05T16:43:22Z","session":"abc","page":"dashboard.html"}
{"type":"input","selector":"input[name='name']","value":"Acme Co","ts":"2026-07-05T16:43:25Z","session":"abc"}
{"type":"navigate","from":"dashboard.html","to":"settings.html","ts":"2026-07-05T16:43:30Z"}
```

`session` is a per-browser-tab UUID set in `localStorage` so feedback can be grouped per user-session.

### 6.3 Inlined `domi.js` runtime

Single ~10KB script. Two modes, mode-detected at runtime.

**Standalone mode** (default — Phase 1, no server):

- Click handlers on `[data-feedback]` elements log structured events to `localStorage` under key `domi:events:<page>`
- Form inputs debounce-save their values to `localStorage` under key `domi:inputs:<page>`
- Hover annotations reveal element metadata
- Version chips show last-modified timestamp
- A built-in "Export feedback" button (rendered when `[data-export-feedback]` is present on the page) lets the user download `events.jsonl` and paste it back to the agent

**Server-attached mode** (Phase 2, when `window.__DOMI_SERVER__ === true`):

- WebSocket sync to the agent session (replaces the manual export step)
- Live file change push without reload
- Version history panel
- v2: chat-back-to-agent input box

### 6.4 Discovery for the agent

`SKILL.md` instructs the agent:

1. Check `.domi/state/server-info.json` — if present, the server is running; connect via WebSocket for real-time feedback
2. Otherwise, optionally run `domi serve` to enable live mode (Phase 2+); in Phase 1 the agent can skip this and rely on the user manually exporting feedback
3. Write HTML to `<project>/.domi/output/<page>.html`
4. In live mode: read `events.jsonl` periodically (or subscribe to WebSocket) for feedback
5. In standalone mode: ask the user to click "Export feedback" and paste the JSONL back when they want feedback processed

## 7. Multi-target Components

### 7.1 Canonical source

`components/primitives/<name>/<name>.html` + `<name>.css` + `README.md` is what the agent generates. This is the source of truth.

Core primitives planned for Phase 1 (~15): `button`, `card`, `form`, `input`, `select`, `checkbox`, `radio`, `table`, `nav`, `modal`, `alert`, `badge`, `tabs`, `toast`, `drawer`, `breadcrumb`, `chart`. Exact list finalized in implementation plan.

### 7.2 Wrapper targets

| Target | Path | Form | Reads tokens via |
|---|---|---|---|
| React | `packages/react/src/<Name>.tsx` | Thin wrapper — renders the same HTML markup, props drive class/children/handlers | `@domi/tokens` (npm) |
| Astro | `packages/astro/src/components/<Name>.astro` | Same wrapper idea, idiomatic Astro syntax | `@domi/tokens` (npm) |
| Rust/DVUI | `crates/domi-dvui/src/<name>.rs` | DVUI-inspired immediate-mode widget API | `domi-tokens` crate |

**DVUI clarification:** gridbugs/DVUI is a Zig library. The `domi-dvui` crate is a **Rust UI library inspired by DVUI's patterns** (immediate-mode, declarative, stateful), not a binding to actual DVUI. This avoids the Zig toolchain dependency and keeps DOMiNice purely Rust on the desktop/mobile side.

### 7.3 Distribution

- `@domi/react` + `@domi/astro` + `@domi/tokens` — npm
- `domi-server` + `domi-dvui` + `domi-tokens` — crates.io + GitHub release binaries for `domi-server`
- All targets read the same `tokens.json` schema

## 8. Documentation Plan

| Doc | Format | Audience | Maintained by | Edit pattern |
|---|---|---|---|---|
| `docs/DESIGN.md` | Markdown | Humans (read+edit) + Agents (read) | Human | Open in editor, commit |
| `docs/USAGE.md` | Markdown | Humans + Agents | Human | Open in editor, commit |
| `docs/STANDARDS.md` | Markdown | Humans + Agents | Human | Open in editor, commit |
| `status/STATUS.html` | HTML | Humans (read) | Agent | Agent rewrites the file as DOMiNice HTML |
| `status/UX-MEMORY.html` | HTML | Humans (read) | Agent | Agent rewrites the file as DOMiNice HTML |

**Doc format principle:** *human-edits-frequently → Markdown; agent-maintained-display → HTML*. STATUS and UX-MEMORY are agent outputs (structured HTML with tables/checklists) that humans read but rarely edit directly.

## 9. Phasing

All parts ship by v1.0, in 4 implementation phases.

### Phase 1 — Skill foundation (smallest shippable)

- `tokens.json`
- HTML primitive library (~15 core primitives)
- `domi.js` runtime (standalone mode only)
- `SKILL.md`
- 5 archetype templates
- `docs/DESIGN.md`, `USAGE.md`, `STANDARDS.md`
- `status/STATUS.html`, `UX-MEMORY.html`
- README, LICENSE, basic install script
- `.gitignore`

**Works after Phase 1:** Agent produces DOMiNice HTML files. Humans open in any browser. No live server — files are static. **Shippable + opensourceable as a static design system.**

### Phase 2 — Live server

- `domi-server` Rust binary (axum + notify + tokio)
- `domi-tokens` Rust crate
- Folder-watch mode
- WebSocket push to agent
- `events.jsonl` writing
- Inlined `domi.js` server-attached mode

**Works after Phase 2:** Full agent↔human authoring loop. User clicks feedback widgets, agent receives events live. **Live loop promise lands.**

### Phase 3 — Multi-target packages

- `@domi/react` (npm)
- `@domi/astro` (npm)
- `@domi/tokens` (npm)
- `domi-dvui` Rust crate

**Works after Phase 3:** Webapp/React/Astro/Rust developers can `npm install @domi/react` and get DOMiNice components in their app. **"Design once, deploy anywhere" story lands.**

### Phase 4 — v1.0 polish

- v1.0 tag
- README/landing page
- 3 example projects (sample webapp, POS, dashboard)
- `cargo install` + GitHub release binaries + optional Homebrew tap
- crates.io + npm publish
- CI (GitHub Actions)

**Works after Phase 4:** Public v1.0 release. Announceable.

## 10. Out of Scope (v1)

- Mobile UI libs other than the Rust/DVUI-style crate (no SwiftUI, Kotlin, React Native ports)
- Hosted/SaaS version of the live server — local-only by design
- Multi-user collaboration or real-time co-editing (CRDT/OT) — feedback is one-way: human → events → agent → rewrite → human re-views
- CMS / content management features
- Authentication on the live server (it runs on localhost)
- Blog/web publishing features (explicitly excluded by user)
- Browser extensions, IDE plugins
- Built-in AI image generation — but artifacts render any images the agent generates via standard `<img>` / CSS, provided the agent's model, plugin, or skill supports image gen

## 11. Open Questions (carry into implementation planning)

- Exact list of 15 primitives for Phase 1 — finalized in plan
- Which 3 example projects to ship in Phase 4 — to be decided
- License choice (MIT vs Apache-2.0) — to be decided
- Whether to ship a Homebrew tap in Phase 4 (vs GitHub releases only)

## 12. Branding & Sponsorship

- DOMiNice is **sponsored by [stoopery](https://stoopery.app)**.
- The stoopery sponsor icon is stored at `branding/sponsor-stoopery.svg` and should appear in the project README and GitHub release notes (typically as a small badge in the footer or "Sponsored by" section).
- Final placement and sizing decisions are made during the README polish work in Phase 4.
