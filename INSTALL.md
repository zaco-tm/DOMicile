# Install DOMicile

DOMicile ships as an [Agent Skills](https://agentskills.io/)-compatible **skill** — a single directory (`domicile/`) containing the prompt (`SKILL.md`), the audit-rail runtime (`scripts/runtime/domi*.js`), the design system CSS, and one starter template. The cross-platform wrappers (`@domi/react`, `@domi/astro`, `domi-egui`) are installed separately. This page covers three audiences:

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
| Universal one-line (vercel-labs/skills, 15+ agents) | `npx skills add zaco-tm/DOMicile -g` |
| Universal one-line (agent-install, 14+ agents) | `npx agent-install skill add zaco-tm/DOMicile -g` |
| Universal (`~/.agents/skills/` — fallback for clients without their own discovery) | `cp -R domicile ~/.agents/skills/domicile` |
| [OpenCode](https://opencode.ai/docs/skills/) | `cp -R domicile ~/.config/opencode/skills/domicile` |
| [Claude Code](https://code.claude.com/docs/en/skills) | `cp -R domicile ~/.claude/skills/domicile` |
| [Kilo Code](https://docs.roocode.com/features/skills) (Roo Code fork) | `cp -R domicile .roo/skills/domicile` |
| [PI](https://github.com/badlogic/pi-mono) | `cp -R domicile ~/.pi/skills/domicile` |
| [Crush](https://github.com/charmbracelet/crush) | `cp -R domicile ~/.config/crush/skills/domicile` |
| Dirac | `cp -R domicile ~/.config/dirac/skills/domicile` |
| Any other Agent Skills–compatible client | `cp -R domicile <config-dir>/skills/domicile` |

Each command copies the full skill (`SKILL.md` plus runtime and assets) into the agent's discovery dir. The two `npx` rows install for any agent on a one-liner and support 15+ agents each (Claude Code, OpenCode, Cursor, Cline, Amp, etc.). The skill dir is built from canonical sources via `tools/build-skill-bundle.sh`; CI asserts it is in sync via `npm run test:bundle`.

Once the skill is installed, the agent asks you "standalone or server?" on the first iteration-eligible task. Standalone needs nothing extra. For server-backed iteration, the skill's wrapper (`tools/domi-serve.sh start`) auto-installs `domi-server` from GitHub Releases into `~/.local/bin/` on first run (~3–10 sec, no Rust toolchain required). The server serves the DOMicile design system from a `--library-root` it discovers automatically (the repo root), so working docs can use absolute asset paths like `/components/domi.css` directly — no path-rewriting required from your agent beyond the one rule the skill prompt already specifies. For maintainers who want the source build instead, `cargo build --release -p domi-server` still works and is preferred. See [Server mode (auto-install)](#server-mode-auto-install) below.

> **Project-local vs. global.** Every command above uses the global path (`~/...`). For a project-scoped install (only available inside this repo), replace the path with the project-local equivalent — e.g. `.opencode/skills/`, `.claude/skills/`, or `.agents/skills/`.

### Install shape

The skill ships as a single directory (`domicile/`) whose contents match the Agent Skills open-standard bundle shape. Installation is one recursive copy.

If you'd rather **symlink** (so edits to the repo immediately reflect in your agent config):

```bash
ln -s "$(pwd)/domicile" ~/.claude/skills/domicile
```

### <a id="full-bundle"></a>Full bundle

The install path above copies the full skill, generated from canonical sources by `tools/build-skill-bundle.sh`. The skill ships:

- `SKILL.md` — the prompt the agent reads.
- `scripts/runtime/{domi.js, domi-audit.js, domi-audit-render.js, domi-server.js, domi-wire.js, domi-verify.js}` — the audit-rail runtime JS plus the first-run install verifier.
- `components/domi.css` — the design-system stylesheet.
- `templates/working-doc/index.html` — the canonical starter template for any working-doc-mode artifact.

To rebuild from canonical sources: `tools/build-skill-bundle.sh`. CI asserts the skill is in sync via `npm run test:bundle`.

What the bundle does **not** ship (and requires a full repo checkout via `git clone`):

- The other 5 archetypes (`templates/dashboard/`, `webapp-shell/`, `mobile-app-shell/`, `admin-tool/`, `pos-kiosk/`).
- The component primitives (`components/primitives/`).
- The `domi-server` Rust binary. **Skill users get this automatically** — `tools/domi-serve.sh start` downloads it from GitHub Releases on first run. Maintainers / contributors building from source: `cargo build --release -p domi-server`. The binary enables server-mode persistence (comments survive across machines), which the standalone install (file + `localStorage`) does not.

### Agents with prompt-based config (no skills discovery)

Some agents don't follow the Agent Skills directory convention at all. For those, point the system prompt at the skill manually. Options:

1. **Reference the file** — add a line like `Before any UI task, read the file at <repo>/domicile/SKILL.md.` to the agent's config (`.cursorrules`, system prompt, project rules, etc.).
2. **Inline the contents** — copy `domicile/SKILL.md`'s body into the system prompt. Useful when the agent can't read external files.
3. **Per-project rule file** — drop a project-local `AGENTS.md` or `.cursorrules` that summarizes the trigger phrases and key rules.

### Verifying the install

After installing for any client above:

1. Start a new session.
2. Ask something like *"Make me a pricing page in the DOMicile style."* or *"Build a settings screen using the DOMicile skill."*
3. The agent should produce an HTML page in `.domi/output/<name>.html` with the working-doc chrome (feedback rail, status chip, `data-feedback` hooks) — comments are stored in the browser's `localStorage` for standalone installs, or in the Rust `domi-server` process if you also choose server-backed iteration (the binary auto-installs on first `tools/domi-serve.sh start`).

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

### <a id="server-mode-auto-install"></a>Server mode (auto-install)

When a skill user asks their agent for server mode and `domi-server` is not
present, the skill auto-installs it from
[GitHub Releases](https://github.com/zaco-tm/DOMicile/releases) into
`~/.local/bin/`. ~3–10 sec on broadband, no toolchain required.

If you cloned the repo or installed manually and the script's version pin
doesn't match your local build, `resolve_binary()` still prefers the local
`target/{release,debug}/domi-server` first.

**Override the install location:**

```sh
DOMICILE_BIN_DIR=/opt/domi tools/domi-serve.sh start
```

**Disable auto-install** (e.g., on air-gapped or corporate machines):

```sh
DOMICILE_SKIP_AUTO_INSTALL=1 tools/domi-serve.sh start
# Then run install manually:
bash tools/domi-fetch.sh install
```

**Pin a specific version** (e.g., you installed v0.3.0 manually):

```sh
DOMI_SERVER_VERSION_OVERRIDE=0.3.0 tools/domi-serve.sh start
```

**Windows users:** download the `.zip` artifact from
[Releases](https://github.com/zaco-tm/DOMicile/releases), extract, and add
`bin/` to PATH. Auto-install is POSIX-only.

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
