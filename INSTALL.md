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
| [OpenCode](https://opencode.ai/docs/skills/) | `mkdir -p ~/.config/opencode/skills/domicile && cp SKILL.md ~/.config/opencode/skills/domicile/SKILL.md` |
| [Claude Code](https://code.claude.com/docs/en/skills) | `mkdir -p ~/.claude/skills/domicile && cp SKILL.md ~/.claude/skills/domicile/SKILL.md` |
| [Kilo Code](https://docs.roocode.com/features/skills) (Roo Code fork) | `mkdir -p .roo/skills/domicile && cp SKILL.md .roo/skills/domicile/SKILL.md` |
| [PI](https://github.com/badlogic/pi-mono) | `mkdir -p ~/.pi/skills/domicile && cp SKILL.md ~/.pi/skills/domicile/SKILL.md` |
| [Crush](https://github.com/charmbracelet/crush) | `mkdir -p ~/.config/crush/skills/domicile && cp SKILL.md ~/.config/crush/skills/domicile/SKILL.md` |
| Dirac | `mkdir -p ~/.config/dirac/skills/domicile && cp SKILL.md ~/.config/dirac/skills/domicile/SKILL.md` |
| Any other Agent Skills–compatible client | Replace `<config-dir>` with the agent's skill discovery root: `mkdir -p <config-dir>/skills/domicile && cp SKILL.md <config-dir>/skills/domicile/SKILL.md` |

> **Project-local vs. global.** Every command above uses the global path (`~/...`). For a project-scoped install (only available inside this repo), replace the path with the project-local equivalent — e.g. `.opencode/skills/`, `.claude/skills/`, or `.agents/skills/`.

### Why the install is just `mkdir + cp`

DOMicile's skill is **a single file** — `SKILL.md` at the repo root, with valid Agent Skills frontmatter (`name: domicile`, `description: ...`). There are no scripts, no dependencies, no env vars. The agents above discover it via directory layout; copy the file in and they pick it up.

If you'd rather **symlink** (so edits to the repo immediately reflect in your agent config):

```bash
ln -s "$(pwd)/SKILL.md" ~/.claude/skills/domicile/SKILL.md
```

### Agents with prompt-based config (no skills discovery)

Some agents don't follow the Agent Skills directory convention at all. For those, point the system prompt at `SKILL.md` manually. Options:

1. **Reference the file** — add a line like `Before any UI task, read the file at <repo>/SKILL.md.` to the agent's config (`.cursorrules`, system prompt, project rules, etc.).
2. **Inline the contents** — copy `SKILL.md`'s body into the system prompt. Useful when the agent can't read external files.
3. **Per-project rule file** — drop a project-local `AGENTS.md` or `.cursorrules` that summarizes the trigger phrases and key rules.

### Verifying the install

After installing for any client above:

1. Start a new session.
2. Ask something like *"Make me a pricing page in the DOMicile style."* or *"Build a settings screen using the DOMicile skill."*
3. The agent should produce an HTML page in `.domi/output/<name>.html` with the working-doc chrome (feedback rail, status chip, `data-feedback` hooks).

If nothing happens, check [§ Troubleshooting](#troubleshooting).

---

## 2. Use the design system in your own project

The wrappers are separately installable npm packages and a Rust crate. You don't need the skill — you can use the components directly.

### React (`@domi/react`)

```bash
npm install @domi/react react react-dom
```

```tsx
import { DomButton, DomCard, DomAlert } from '@domi/react';

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

### Astro (`@domi/astro`)

```bash
npm install @domi/astro astro
```

```astro
---
import { Button, Card, Alert } from '@domi/astro';
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

`@domi/react` requires React 18+ (`peerDependencies: react: "^18.0.0"`). `npm install --legacy-peer-deps` works around mismatches but you should upgrade your React version instead.

**`cargo build -p domi-server` fails on Apple Silicon.**

Make sure `rust-toolchain.toml` resolves — DOMicile pins a specific toolchain. Run `rustup show` to confirm. If the toolchain isn't installed, `rustup toolchain install stable` (or the version pinned in `rust-toolchain.toml`) fixes it.

**Working doc rail doesn't appear.**

Open the browser console. If you see `DomiAudit is not defined`, the script tag path is wrong relative to where you opened the HTML. The smoke server (`npm run smoke`) sets up the correct relative paths automatically.

---

## Repository conventions (for contributors)

- `AGENTS.md` — repo conventions for agents
- `docs/EXTENDING.md` — adding primitives, themes, archetypes
- `docs/LAYOUTS.md` — adding layout recipes
- Don't edit `tokens/`, `components/`, or `templates/` without explicit sign-off (library invariant)
