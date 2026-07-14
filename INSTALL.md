# Install DOMicile

DOMicile ships as a skill (an `SKILL.md` + design system library + cross-platform wrappers) that any [Agent Skills](https://agentskills.io/)-compatible client can load. This page covers three audiences:

1. **AI agents** installing the skill for themselves
2. **Developers** using the design system or wrappers in their own code
3. **Humans** opening the templates in a browser with no install

If you only want to see what DOMicile looks like, jump to [§ Open a working doc](#open-a-working-doc-no-install).

---

## 1. Install the skill into an AI agent

DOMicile's `SKILL.md` follows the [Agent Skills open standard](https://agentskills.io/specification). Any client that supports that standard can load it directly.

### Quick reference

All of these agents consume the [Agent Skills open standard](https://agentskills.io/specification); install is `mkdir + cp` regardless of which one.

| Agent | Install command |
|---|---|
| Universal installer ([openskills](https://www.npmjs.com/package/openskills) — `npx`-driven; works for any Agent Skills client) | `npx openskills install zaco-tm/DOMicile` (add `--global` for `~/.claude/skills/`, `--universal` for `.agent/skills/`) — **today this installs only `SKILL.md`; for the full skill bundle see [§ Full bundle](#full-bundle) below** |
| Universal (`~/.agents/skills/` — picked up by Agent Skills clients as a fallback) | `mkdir -p ~/.agents/skills/domicile && cp domicile/SKILL.md ~/.agents/skills/domicile/SKILL.md` — **see [§ Full bundle](#full-bundle) for what this doesn't yet include** |
| [OpenCode](https://opencode.ai/docs/skills/) | `mkdir -p ~/.config/opencode/skills/domicile && cp domicile/SKILL.md ~/.config/opencode/skills/domicile/SKILL.md` — see [§ Full bundle](#full-bundle) |
| [Claude Code](https://code.claude.com/docs/en/skills) | `mkdir -p ~/.claude/skills/domicile && cp domicile/SKILL.md ~/.claude/skills/domicile/SKILL.md` — see [§ Full bundle](#full-bundle) |
| [Kilo Code](https://docs.roocode.com/features/skills) (Roo Code fork) | `mkdir -p .roo/skills/domicile && cp domicile/SKILL.md .roo/skills/domicile/SKILL.md` — see [§ Full bundle](#full-bundle) |
| [PI](https://github.com/badlogic/pi-mono) | `mkdir -p ~/.pi/skills/domicile && cp domicile/SKILL.md ~/.pi/skills/domicile/SKILL.md` — see [§ Full bundle](#full-bundle) |
| [Crush](https://github.com/charmbracelet/crush) | `mkdir -p ~/.config/crush/skills/domicile && cp domicile/SKILL.md ~/.config/crush/skills/domicile/SKILL.md` — see [§ Full bundle](#full-bundle) |
| Dirac | `mkdir -p ~/.config/dirac/skills/domicile && cp domicile/SKILL.md ~/.config/dirac/skills/domicile/SKILL.md` — see [§ Full bundle](#full-bundle) |
| Any other Agent Skills–compatible client | Replace `<config-dir>` with the agent's skill discovery root: `mkdir -p <config-dir>/skills/domicile && cp domicile/SKILL.md <config-dir>/skills/domicile/SKILL.md` — see [§ Full bundle](#full-bundle) |

Once the skill is installed, the agent asks you "standalone or server?" on the first iteration-eligible task. Standalone needs nothing extra. For server-backed iteration, run `cargo build --release -p domi-server` once; the skill's wrapper (`tools/domi-serve.sh`) starts and stops the server for you from then on. The server serves the DOMicile design system from a `--library-root` it discovers automatically (the repo root), so working docs can use absolute asset paths like `/components/domi.css` directly — no path-rewriting required from your agent beyond the one rule the skill prompt already specifies.

> **Project-local vs. global.** Every command above uses the global path (`~/...`). For a project-scoped install (only available inside this repo), replace the path with the project-local equivalent — e.g. `.opencode/skills/`, `.claude/skills/`, or `.agents/skills/`.

### Why the install is just `mkdir + cp` (today)

DOMicile's prompt-to-the-agent is **a single file** — `domicile/SKILL.md` at the repo root, with valid Agent Skills frontmatter (`name: domicile`, `description: ...`). The file's parent directory matches its `name` field, which is what the [Agent Skills spec](https://agentskills.io/specification) requires.

**However:** the prompt is half the story. The other half is the **runtime** the prompt references — the audit rail, the click-to-target hooks, the wire-protocol handler, and the `domi-audit.js` / `domi-server.js` / `domi-wire.js` JavaScript that gets loaded by working docs. Today those live under `scripts/runtime/` in the repo. A user who installs only `SKILL.md` will get a working prompt but a broken page (the audit rail won't load). This is a known gap and is on the queue to fix ([§ Full bundle](#full-bundle) below).

If you'd rather **symlink** (so edits to the repo immediately reflect in your agent config):

```bash
ln -s "$(pwd)/domicile/SKILL.md" ~/.claude/skills/domicile/SKILL.md
```

### <a id="full-bundle"></a>Full bundle (planned — not yet shipped)

When the bundle restructure lands, the install paths above will need to copy a directory instead of a single file. The intended final shape:

```
<config-dir>/skills/domicile/
├── SKILL.md                  (the prompt the agent reads)
├── scripts/
│   └── runtime/              (audit rail, server-detect shim, wire helpers)
│       ├── domi.js
│       ├── domi-audit.js
│       ├── domi-server.js
│       └── domi-wire.js
└── assets/                   (CSS, primitive sources, tokens)
```

Until then, a user who copies only `SKILL.md` gets a prompt that mentions resources the agent will then fail to load at runtime — the resulting working doc renders HTML but with a broken audit rail. If you need a working page right now, **clone the whole repo** (instructions below) instead of using the single-file install.

Tracking: spec lives at `docs/superpowers/specs/YYYY-MM-DD-skill-bundle-design.md` once written. Until then, the single-file instructions remain the documented install path — but readers should know the half-truth.

### Agents with prompt-based config (no skills discovery)

Some agents don't follow the Agent Skills directory convention at all. For those, point the system prompt at the skill manually. Options:

1. **Reference the file** — add a line like `Before any UI task, read the file at <repo>/domicile/SKILL.md.` to the agent's config (`.cursorrules`, system prompt, project rules, etc.).
2. **Inline the contents** — copy `domicile/SKILL.md`'s body into the system prompt. Useful when the agent can't read external files.
3. **Per-project rule file** — drop a project-local `AGENTS.md` or `.cursorrules` that summarizes the trigger phrases and key rules.

### Verifying the install

After installing for any client above:

1. Start a new session.
2. Ask something like *"Make me a pricing page in the DOMicile style."* or *"Build a settings screen using the DOMicile skill."*
3. The agent should produce an HTML page in `.domi/output/<name>.html` — but, until the bundle restructure lands (see [§ Full bundle](#full-bundle)), **the audit rail and `data-feedback` hooks will not be functional in a third-party install**. The page renders; the iteration loop does not.

   For a fully-functional loop today, **clone the repo** and run from a checkout — see [§ Full bundle](#full-bundle) for the temporary workaround.

If nothing happens, check [§ Troubleshooting](#troubleshooting).

---

## 2. Use the design system in your own project

The wrappers are separately installable npm packages and a Rust crate. You don't need the skill — you can use the components directly.

### React (`domicile-react`)

```bash
npm install domicile-react react react-dom
```

```tsx
import { DomButton, DomCard, DomAlert } from 'domicile-react';

export function Pricing() {
  return (
    <DomCard size="lg">
      <h2>Pro</h2>
      <p>$20 / month</p>
      <DomButton variant="primary" size="lg">Start free trial</DomButton>
    </DomCard>
  );
}
```

You also need the CSS. Copy `components/domi.css` from this repo into your project (a standalone `@domi/css` package is on the roadmap).

### Astro (`domicile-astro`)

```bash
npm install domicile-astro astro
```

```astro
---
import { Button, Card, Alert } from 'domicile-astro';
---
<Button variant="primary" size="lg">Save</Button>
<Card size="lg">
  <h2>Hello</h2>
  <p>Content</p>
</Card>
<Alert variant="danger">Something went wrong.</Alert>
```

Same CSS requirement.

### Rust / egui (`domi-egui`)

```toml
# Cargo.toml
[dependencies]
domi-egui = "0.1"
egui = "0.32"
eframe = "0.32"
```

```rust
use domi_egui::button::{domi_button, ButtonProps};

fn main() -> eframe::Result<()> {
    eframe::run_simple_window("app", |ctx, _frame| {
        egui::CentralPanel::default().show(ctx, |ui| {
            let _ = domi_button(ui, ButtonProps::new("Click me"));
        });
    })
}
```

WASM-capable — see `crates/domi-egui/README.md` for the `trunk build` path.

---

## 3. Use the design system without any wrapper

If you're not on React/Astro/egui and just want the CSS + tokens:

1. Copy `components/domi.css` into your project.
2. Use the `.domi-*` classes from the [primitives README](components/primitives/) or the [archetype templates](templates/).
3. Optional: regenerate the CSS variables from `tokens/tokens.json` via `node tools/tokens-to-css.mjs` after editing tokens.

Example:

```html
<link rel="stylesheet" href="path/to/domi.css">
<button class="domi-btn domi-btn--primary domi-btn--lg">Save</button>
<article class="domi-card domi-card--lg">
  <h3>Revenue</h3>
  <p>$48.2K</p>
</article>
```

---

## 4. Optional: run the live working-doc loop

For the full working-doc experience (click any element, leave a note, see comments persist):

```bash
git clone https://github.com/zaco-tm/DOMicile.git
cd DOMicile
npm install
npm run smoke
```

Then open `http://127.0.0.1:8123/` in a browser. Click an element with a dashed outline, type a note in the rail, submit. Reload — your note is still there.

For event-backed serving (comments persist across machines):

```bash
cargo build --release -p domi-server
./target/release/domi-server --root .domi/output --state .domi/state
```

---

## Open a working doc (no install)

The fastest "is this real" check — no agent, no build, no install:

```bash
git clone https://github.com/zaco-tm/DOMicile.git
cd DOMicile
```

Then open `templates/dashboard/index.html` directly in a browser (double-click, or `open templates/dashboard/index.html` on macOS). You'll see the dashboard archetype rendered with the design system primitives.

For the audit rail (the feedback loop), you need a local server because `domi-audit.js` requires `file://` + JS to mount. The `npm run smoke` command above does that for you.

---

## Troubleshooting

**Skill installed but agent doesn't pick it up.**

1. Confirm the file is at the exact path the agent expects. OpenCode looks at `.opencode/skills/domicile/SKILL.md`, `.claude/skills/domicile/SKILL.md`, `.agents/skills/domicile/SKILL.md`. Verify `domicile` (lowercase, no hyphens) is the directory name.
2. Verify the file is named exactly `SKILL.md` (uppercase, with the dot).
3. Check the frontmatter: must have `name:` and `description:` as the first two YAML keys.
4. Restart the agent — most clients cache skill discovery at startup.

**`npm install` complains about peer dependencies.**

`domicile-react` requires React 18+ (`peerDependencies: react: "^18.0.0"`). `npm install --legacy-peer-deps` works around mismatches but you should upgrade your React version instead.

**`cargo build -p domi-server` fails on Apple Silicon.**

Make sure `rust-toolchain.toml` resolves — DOMicile pins a specific toolchain. Run `rustup show` to confirm. If the toolchain isn't installed, `rustup toolchain install stable` (or the version pinned in `rust-toolchain.toml`) fixes it.

**Working doc rail doesn't appear.**

Open the browser console. If you see `DomiAudit is not defined`, the script tag path is wrong relative to where you opened the HTML. The smoke server (`npm run smoke`) sets up the correct relative paths automatically.
