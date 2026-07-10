# Phase 4 — Skill Loop Wiring Handoff

**Date:** 2026-07-06
**From:** End of the 2d + 3a + 3b + 3c bundle (now on `main`)
**To:** The next session, which makes the skill *playable* end-to-end before anything ships
**Branch / commit:** `main` at `9d3b0e3`
**Supersedes:** `docs/superpowers/handoffs/2026-07-06-phase4-release-handoff.md` (removed in the commit that adds this doc). The previous handoff prioritized *publishing* (crates.io, npm); this one prioritizes *playing* the skill locally with an agent and a human reviewer.

---

## Why this handoff exists

The previous Phase 4 handoff lined up the bundled merge for distribution: cut `crates.io` releases for `domi-egui`, publish `@domi/react` and `@domi/astro` to npm, then cut v1.0. That order made the wrappers reachable in package registries — and it assumed reaching-the-registry was the same as working.

It's not. DOMiNice is a **skill**, not a library product. The skill's contract is "an agent reads `SKILL.md`, authors a `.domi/output/<name>.html`, the human reviewer opens it, comments flow back, the agent iterates." Until that loop runs end-to-end on a real working doc, no amount of `npm publish` or `crates.io` release tells you whether the skill works. So the correct ordering is the one in §"Concrete next steps" below: **wire the local loop first**, *then* publish, *then* cut v1.0.

> The Rust and npm wrappers from 2d / 3a / 3b / 3c still landed on `main` and stay there. This handoff doesn't undo that work; it just deprioritizes the distribution step and inserts the skill loop ahead of it.

---

## What's on `main` right now

### Verified state

```bash
$ git log -1 --format='%h %s'
1326ee2  # this handoff's commit eventually; pre-existing HEAD is 9d3b0e3 (the bundle merge)
$ git branch -l
* main
$ cargo test --workspace       # 77 passed, 13 ignored
$ npm test                     # 240 passed, 2 skipped, 0 failed
$ cargo check --target wasm32-unknown-unknown -p domi-egui   # 0 errors
```

### What 2d+3a+3b+3c shipped (unchanged from prior handoff; restated for context)

| Phase | Surface |
|---|---|
| 2d | `crates/domi-server` (`domi-server` HTTP binary + `domi` agent CLI), `scripts/shell/install.sh`, `scripts/shell/verify.sh` |
| 3a | `packages/react/` — 15 React components + `cn()` + types + tests + CSS-AUDIT |
| 3b | `packages/astro/` — 15 `.astro` wrappers + tests (parser-first, because Astro's `experimental_AstroContainer` doesn't initialize in the current toolchain) |
| 3c | `crates/domi-egui/` — 15 leaves + 5 composites + `build.rs` tokens codegen + smoke binary |

### What's already wired for the local skill loop (and what isn't)

| Ready | Need wiring |
|---|---|
| `templates/working-doc/index.html` — the reference working doc archetype. Loads `scripts/runtime/domi-audit.js`, carries the status chip + `data-feedback` hooks + neo skin out of the box. | `.domi/output/` and `.domi/state/` — the directories `SKILL.md` tells the agent to write to. **They don't exist on disk yet.** |
| `scripts/runtime/domi-audit.js` — localStorage-backed audit rail; mirrors to `.domi/state/<docName>.json` when wired up. | A `tools/skill-smoke.mjs` (or equivalent) that emits a working doc from the archetype, serves it locally, and prints a URL the reviewer can open. **Doesn't exist yet.** |
| `tools/tokens-to-css.mjs` — emits the CSS variables block from `tokens/tokens.json`. | `components/domi.css` is pre-existing-dirty ("modified on disk but not committed since v0.1.0" per `AGENTS.md`); the test pipeline (`npm test`) shows 240 passed / 2 skipped / 0 failed, but the dirty state remains a known long-standing item. Out of scope for Phase 4 skill wiring. |
| `crates/domi-server` — HTTP binary that can serve arbitrary files. Optional for the local loop (a Python `http.server` works fine), relevant if you want real event-collection under the loop. | A working `domi serve`-from-`.domi/` command path. Not on the critical path. |
| 6 archetype templates, including `working-doc/`. | A canonical sample working doc in `.domi/output/` so a new agent has something concrete to read after `SKILL.md`. |

---

## Concrete next steps (priority-ordered)

### 1. Wire the local skill loop (~half a day) — **the only critical-path item**

Goal: an agent loads `SKILL.md`, names a doc, and a working file lands in `.domi/output/<name>.html` that a human can open in a browser, click comments on, and see them persist (localStorage, mirrored to `.domi/state/<name>.json`).

Concrete steps:

1. **Provision output dirs + gitignore**:
   - Create `.domi/output/.gitkeep`, `.domi/state/.gitkeep`.
   - Add `.domi/output/*.html` and `.domi/state/*.json` to `.gitignore` (or, more conservatively, add `.domi/` wholesale to `.gitignore` and rely on artifacts living outside source control).
2. **Strengthen `SKILL.md`** with a one-paragraph reference to `templates/working-doc/index.html`. Right now `SKILL.md` says "Working artifacts: `.domi/output/<name>.html`" but doesn't point at the archetype; an agent driving the skill cold would have to find `templates/working-doc/` itself. Adding a "Reference working doc: `templates/working-doc/index.html` — clone it as your starting point" line in §"Output locations" or §"Working-doc chrome (audit mode)" closes the loop.
3. **Write `tools/skill-smoke.mjs`** (~50 lines):
   - Clone `templates/working-doc/index.html` to `.domi/output/smoke.html` (or accept `--doc <name>`).
   - Print a "open this URL" line.
   - `import('node:http')` and serve `.domi/` on a chosen port (default `8123`). Print `http://127.0.0.1:8123/output/smoke.html`.
   - Run until `SIGINT`.
   - Optional: a one-liner `curl -fsS http://127.0.0.1:8123/output/smoke.html | grep -q 'data-feedback'` to assert the artifact is well-formed before the reviewer opens it.
4. **Run the smoke**:
   - `node tools/skill-smoke.mjs smoke`
   - Open the URL in a browser, click on a `data-feedback` element, write a comment, reload, see the comment persisted.
   - Confirm `localStorage` shows the comment (and `.domi/state/smoke.json` if mirror-to-disk is wired).

Owner: anyone. Risk: zero — no library files touched.

### 2. Drive another agent through the skill (~hour)

Send another agent (or a fresh instance) the prompt: **"Build a working doc for a 'tracker dashboard' using the DOMiNice skill."** Verify the agent:
- Reads `SKILL.md`, picks **working doc / create** mode (the two-question check).
- Clones `templates/working-doc/index.html`.
- Names the doc + creates `.domi/output/<name>.html` (not `.domi/output/tracker-dashboard/index.html`, not `tracker.html`).
- Adds at least 3 `data-feedback="..."` hooks on user-likely-to-comment elements.
- Loads `scripts/runtime/domi-audit.js` and mounts the rail via `DomiAudit.mount({...})`.
- Sets a `vN` status chip.

If the agent does all of that, the skill is **authorable**. If not, the gap is in `SKILL.md` or the reference archetype, not in the wrappers.

Risk: low — this is verification, not a code change.

### 3. (Optional) Headless test of the audit loop (~hour)

Playwright loads the smoke doc, simulates a click, asserts the comment lands in storage. Adds CI-grade coverage so future `SKILL.md` or `templates/working-doc/` edits can't silently break the loop.

Risk: zero — Playwright only sees the artifact; nothing in the project depends on it.

**Status: done** as of the `playwright` dev-dep + `tools/skill-smoke-test.mjs` commit. Run via `npm run test:e2e` or `./scripts/shell/verify-skill-loop.sh`. The shell wrapper mirrors `scripts/shell/verify.sh`'s role for the Rust HTTP lane. Confirms 5 invariants: page loads without errors, status chip rendered, data-feedback hooks present, comment persists to localStorage, comment survives a reload. Verified that corrupting `scripts/runtime/domi-audit.js` to throw on load flips 1 check to FAIL with exit 1.

### 4. (Optional) Wire `domi serve` for events

`crates/domi-server` binary already serves files; pointing it at `.domi/` and verifying events are written is the wiring `INIT.md` calls out for under "live server or human-led feedback loop." Optional because a Python static server satisfies the file-serving need; events are the value-add.

Risk: low — Rust binary is stable. Configuration-only work.

**Status: done** as of the `wire domi-server` commit. Three pieces of the existing server turned out to be mis-wired for the working-doc flow:

  1. **Shim injection gate** (`crates/domi-server/src/serve/file.rs`): the previous `html && references_domi_js(&body)` predicate missed pages like the working-doc archetype that load `domi-audit.js` without `domi.js`. New gate: any HTML with a `<script>` tag. Tests: 2 new unit tests (`html_with_domi_audit_only_still_gets_shim`, `html_with_external_script_only_no_inline_still_gets_shim`).
  2. **Path-escape contained symlinks** (`crates/domi-server/src/serve/file.rs`): the prior `canonicalize(target).starts_with(root)` check rejected directory symlinks authored *under* `--root` that resolve outside the root via symlink-traversal. The working-doc authoring flow symlinks the library tree (components/, scripts/) under `.domi/output/`, which is exactly that case. New check: reject any `..` component outright, then read the file directly via `metadata(target)`/`read(target)` which follow symlinks transparently. Tests: `symlink_under_root_to_outside_directory_serves_leaf` covers the fix.
  3. **EventData untagged ordering** (`crates/domi-server/src/events/event.rs`): `serde(untagged)` on `EventData` was committing `{body, targetId}` payloads to `Click {value: None}` (the first variant that accepts an "all-optional" struct) instead of `RailAdd`. Reordered so `RailAdd` precedes `Click`. Tests: `all_six_kinds_serialize` still passes (round-trip doesn't depend on order, but I'm flagging that this is structurally relevant).
  4. **Null rect for rail-add** (`crates/domi-server/src/http/handlers.rs`): `domi-audit.js` sends `rect: null` because the rail has no bounding-rect concept, but the server's typed `Rect` was non-nullable. Added normalization for `target.rect == null` → default zeros, plus a `post_event_accepts_null_rect_for_rail_audit` regression test.

End-to-end coverage: `tools/skill-smoke-server-test.mjs` spawns `target/release/domi-server` on a temp root, stages the working doc via `tools/skill-smoke.mjs`-style clone + symlink, drives Playwright, asserts:

  - server returns the HTML at 200;
  - `window.__DOMI_SERVER__` is injected (shim landed);
  - audit rail mounts and accepts a comment submission;
  - comment appears in the rail via the server's WS bridge;
  - `GET /api/events?doc=<doc>` returns the entry with `src: domi-audit.js`.

Wired into npm as `npm run test:e2e:server` and as `scripts/shell/verify-skill-loop-server.sh` (parallels `scripts/shell/verify-skill-loop.sh` and `scripts/shell/verify.sh`).

Updated `SKILL.md` §Output locations with a one-liner pointing at the server-mode path.

### 5. THEN publish — only after 1, 2, 3 land

Once a human can author + comment + reload + iterate with the skill:

- `crates.io` publish for `domi-egui`. (`Cargo.toml`'s `publish = false` flips to `true` for the publish call.)
- `npm` publish for `@domi/react` and `@domi/astro`. (`packages/react/dist/` is gitignored; either commit it or add a `prepublishOnly` hook.)
- Cut v1.0 across the three wrappers, sync README versions, update `README.md`'s "What's coming" section (which currently still says `domi-dvui` — stale since 3c).

Risk: medium — establishes a public API contract. Don't ship it before the playability loop is green.

### 6. THEN whole-branch review of the bundle

The 2d / 3a / 3b / 3c precedents each ended with "0-Critical / 0-Important" review passes. Same exercise on the merged bundle, with these handoffs as context.

### 7. THEN per-phase open questions from the prior handoff

These remain valid and re-prioritize after publishing:

- **`egui_kittest` flow tests** (3c) — registry ships 0.35 (tracks egui 0.35), not 0.32. Phase 4 picks this up alongside an egui 0.32 → 0.35 bump.
- **`domi_modal` focus trap** (3c) — paint-only stub today; swap to `egui::ModalManager::default()` once the API stabilises.
- **Consumer-supplied theme overrides** (3c) — `Theme` currently only exposes `default()`.
- **`trunk` CI lane / wasm-distribution** (3c) — `examples/index.html` is in place; landing a `Trunk.toml` and a CI job is a one-day add.
- **React 19 ref deprecation** (3a) — peer dep is `^18`; refactor to plain function components if the target moves to React 19.
- **Astro vitest story** (3b) — static-analysis tests ship today; if Astro 6 ships a working `astro test` subcommand, the `tests/parser.ts` swap is mechanical.
- **Two `it.skip(...)` calls in `tests/wire-protocol.test.js`** — confirm they're cruft or encode deferred work; flip to `it.todo` or delete.

---

## File map

| Concern | Path |
|---|---|
| Phase 3a spec / plan / handoff | `docs/superpowers/specs/2026-07-05-phase3a-react-design.md` · `.../plans/2026-07-05-phase3a-react-plan.md` · `docs/superpowers/handoffs/2026-07-06-phase3a-react-handoff.md` |
| Phase 3b spec / plan / handoff | `docs/superpowers/specs/2026-07-06-phase3b-astro-design.md` · `.../plans/2026-07-06-phase3b-astro-plan.md` · `docs/superpowers/handoffs/2026-07-06-phase3b-astro-handoff.md` |
| Phase 3c spec / plan / handoff | `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md` · `.../plans/2026-07-06-phase3c-dvui-plan.md` · `docs/superpowers/handoffs/2026-07-06-phase3c-dvui-handoff.md` |
| Phase 3c kickoff (pre-spec) | `docs/superpowers/handoffs/2026-07-06-phase3c-dvui-kickoff-handoff.md` |
| **This doc** | `docs/superpowers/handoffs/2026-07-06-phase4-skill-loop-handoff.md` |
| Library invariant rules | `AGENTS.md` |
| Skill entry point | `SKILL.md` |
| Skill brief | `INIT.md` |
| Reference working doc archetype | `templates/working-doc/index.html` |
| 5 other archetypes | `templates/{dashboard,webapp-shell,mobile-app-shell,admin-tool,pos-kiosk}/index.html` |
| Tokens source | `tokens/tokens.json` |
| Tokens → CSS emitter | `tools/tokens-to-css.mjs` |
| Standalone runtime | `scripts/runtime/domi.js` |
| Audit rail runtime | `scripts/runtime/domi-audit.js` |
| 15 leaf primitives (HTML) | `components/primitives/<name>/<name>.html` (+ `.css`) |
| Top-level styles | `components/domi.css` |
| Rust server (Phase 2d) | `crates/domi-server/` |
| Rust widgets (Phase 3c) | `crates/domi-egui/` |
| React wrappers (Phase 3a) | `packages/react/` |
| Astro wrappers (Phase 3b) | `packages/astro/` |
| CSS-audit (shared by 3a + 3b + 3c) | `packages/react/CSS-AUDIT.md` |
| Phase 4 release handoff (superseded by this doc) | ~~`docs/superpowers/handoffs/2026-07-06-phase4-release-handoff.md`~~ *removed* |

---

## Two adjacent cleanups worth doing while the area is open

(Not blocking the skill-loop work; trivial; do them when convenient.)

- **README.md** is stale. The "Phase 3" line says `@domi/react, @domi/astro, domi-dvui`. The crate shipped as `domi-egui` (3c decided the rename). Fix the line to `domi-egui`. Also, "Phase 4: v1.0 — distribution, examples, CI" can drop the "distribution" framing per the (b)-flavored priority above; "Phase 4: skill loop wiring + v1.0 cut when loop is green" is more accurate.
- **`.diracrules`** is a project-level agent config (file-read limits, parallel-read guidance). The file pre-existed on disk untracked; it landed in the `4971bdf` commit as a first-time-add. Worth either renaming to `AGENT-SESSION-RULES.md` or moving to `tools/agent-rules.md` so its purpose is discoverable by a human reader. Not a blocker — but if a future contributor sees `.diracrules` in the project root and doesn't know what it is, that's friction.

---

## Sign-off

Phase 2d + 3a + 3b + 3c are on `main`. Items 1, 2, 3, and 4 of the priority list are landed (skill-smoke wiring, fresh-agent drive-through, Playwright e2e standalone, and server-mode wiring with four server-side fixes surfaced). Distribution (item 5) is now safe to start. This doc replaces the previous distribution-flavored handoff; the previous commit (`1326ee2`) is reverted as part of the same change so the file map is clean.
