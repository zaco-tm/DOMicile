# Two-Page Explainer Test — Design Spec

**Date:** 2026-07-11
**Status:** Approved (sections 1–3) — user opted into Direction A (DOMicile again, harder) and Option 3 (Two-page explainer) over the prior design prompt.
**Scope:** A single working-doc artifact, `.domi/output/dominice-twopager.html`, produced via the existing skill loop. No library changes. No wire-protocol changes. No token or primitive changes.
**Out of scope (per Direction A):** Any non-DOMicile subject (Directions B/C from the brainstorm were declined). Any rebuild of the skill loop or `domi-audit.js` — the test runs against the shipped wiring.

## Purpose

Re-run the Phase-4 skill loop against a deliberately constrained working-doc brief, with the *specific* failure mode from the prior test (`dominice-site.html`, 2026-07-11) named and forbidden. The prior artifact shipped with the canonical "AI-tells" the user wants less of: hero eyebrow text, three-pillar card grid, monospace-as-personality, generic roadmap timeline, "Get started" CTA pair. This test measures whether the skill loop, given a tight creative brief and three seeded audit comments, produces sharper work or just reshuffled work.

**This is a test, not a deliverable.** The page is a real artifact that will be committed (because `tools/skill-smoke.mjs` writes to `.domi/output/` and that directory is conventionally committed when the user wants the artifact to persist), but the *test result* — a written evaluation of specificity, voice, and restraint — is the actual deliverable.

## Motivation

The user's verbatim feedback after the first test: *"all of it worked good, if anything maybe a little more creativity on the self-description making it less 'ai slop' in text and ui decisions, functionally it seems good."* That feedback is specific enough to act on. It points at two distinct failure surfaces (prose voice + UI decisions) that the first artifact demonstrated clearly. The minimum useful test surfaces those failure modes again under tighter constraints and seeds the audit with comments that target them directly, so the skill has to engage rather than avoid.

A useful side benefit: if the skill produces a genuinely good page, the artifact is small enough (~one screen, two halves) that it's the kind of thing the user might actually keep and link to.

## Design — Section 1: Layout constraints (the hard ones)

The artifact is a single page, single viewport on desktop, stacked on mobile. The split is enforced by `body` styles, not by component choice — the skill cannot satisfy the brief by picking a different component.

### Left half — "what it is"

- **Container:** a single `<section data-feedback="lede">` containing exactly one `<p>`.
- **Word budget:** ≤80 words of prose. The brief is enforced by the skill's own self-monitoring and the audit comment on this section.
- **Forbidden:**
  - `<ul>`, `<ol>`, or `<dl>` lists inside this section.
  - A second `<p>` in the same section (no lede + follow-up).
  - An `<h2>` or any other heading inside this section.
  - Inline icon spans (`<svg>`, emoji) used as semantic stand-ins for words.

### Right half — "how it's actually used"

- **Container:** a single `<section data-feedback="worked-example">` containing one `<pre>` and zero or more `<p>` tags explaining it (≤30 words each).
- **Content:** a *worked example*. Real commands (`npm test`, `node tools/skill-smoke.mjs --name=...`), real file paths (`templates/working-doc/index.html`), a real audit comment object (`{ id, target, body, ts, status }`). The skill picks the most concrete possible example from the actual repo at write-time; no invented API.
- **Forbidden:**
  - Multiple `<pre>` blocks (one example, not a tour).
  - A second example even if there's room.

### Across both halves

- Exactly **one** `<h1>` (in the header).
- No "Get started" / "Learn more" / "Read the docs" CTA pair.
- No "eyebrow" text above the H1 (the `A UI SYSTEM FOR THE LOOP` pattern).
- No three-card "why" / "pillars" / "features" grid.
- No roadmap timeline.
- No status chip row.
- No decorative gradients, glows, or motion that doesn't carry information.
- No marketing adjectives in lieu of facts (forbidden set includes: blazing, elegant, powerful, intuitive, seamless, robust, cutting-edge, scalable, world-class, beautiful, premium, next-gen).
- Emoji used as semantic substitutes for sentences are forbidden. Emoji inside a code snippet as actual content is fine.

## Design — Section 2: Skill-loop wiring (unchanged from v1)

1. Clone `templates/working-doc/index.html` to `.domi/output/dominice-twopager.html`. The cloned file must load `scripts/runtime/domi-audit.js` (already loaded by the template).
2. Override the template's `data-feedback` hooks per §1 above (not the template's defaults).
3. Seed the rail with three comments via a small inline `<script>` in the cloned HTML that pre-populates `localStorage['domicile:dominice-twopager']` before `domi-audit.js` mounts. The script runs once, gates on `localStorage.getItem(...)` being absent (so a real user comment doesn't get clobbered), and writes the canonical state shape `{ version: 1, name: docName, entries: [...] }` matching `domi-audit.js`'s `STORAGE_PREFIX` and entry fields (`id`, `targetId`, `author`, `timestamp`, `body`, `resolved`).

   **Why localStorage and not JSON file:** `domi-audit.js` has no disk-read seed path. It either fetches `/api/events` from the `domi-server` binary or mirrors to `localStorage`. Seeding localStorage is the cheapest way to pre-populate the rail without adding server wiring.
4. Serve via `node tools/skill-smoke.mjs --name=dominice-twopager`. The tool already clones `templates/working-doc/` and serves it on `http://127.0.0.1:8123/` until SIGINT.
5. After mount, the skill's first action is to *read the three seeded comments* and revise accordingly — this is the loop under test. The skill is not allowed to ship the page in one shot and ignore the audit.

## Design — Section 3: Seeded audit comments

Three comments, seeded in `.domi/state/dominice-twopager.json` in chronological order. Targets match §1's `data-feedback` hooks.

| # | target | body | ts (seed at write time) |
|---|---|---|---|
| 1 | `lede` | "Read this aloud. Would you send it to a friend? What's the weakest sentence?" | `now - 30m` |
| 2 | `worked-example` | "Does every command and path actually exist in this repo? Run them if you're not sure." | `now - 25m` |
| 3 | `body` | "What did you cut to make this fit two halves? Was anything important lost?" | `now - 20m` |

Each comment gets a unique 8-char id (e.g. `seed-lede1`, `seed-worked1`, `seed-body1`), `author: "user"`, `targetId` matching the `data-feedback` value, ISO-8601 timestamp, and `resolved: false`. The shape mirrors exactly what `domi-audit.js` writes on user submit — see `scripts/runtime/domi-audit.js` (`STORAGE_PREFIX = 'domicile:'`, entry fields above). The seed script verifies the shape by reading the runtime source if needed.

These comments are written as if from a senior engineer reviewing the page, not from the test author. Tone is calibrated to provoke honest revision, not defensive rewriting.

## Design — Section 4: Success criteria

After the skill loop completes (the user signals "done"), the artifact is graded on three axes. Each axis is scored pass/fail with one quoted excerpt as evidence.

1. **Specificity** — repo facts (phase names, file paths, command names, JSON shapes) are real and current. Failure mode: invented API, generic phase names ("Phase 1", "Phase 2"), fake JSON keys.
2. **Voice** — the ≤80-word left half reads like a person with a position, not a brochure. Failure mode: marketing adjectives, aspirational tone, third-person self-description ("DOMicile helps developers...").
3. **Restraint** — the skill resisted adding a second example, a third section, a footer, or expanding the word budget past 80 even when there's room. Failure mode: any forbidden pattern from §1 appearing in the final artifact.

A pass on all three axes means the skill produced sharper work. A pass on one or two means the loop engaged but the constraint wasn't enough. A pass on zero means the skill either ignored the brief or couldn't tell the difference — and the test result is "no, the skill loop cannot enforce creative constraints via brief alone" — which is itself a useful finding.

## Design — Section 5: What this test does NOT claim

- It does not claim the resulting page is "the best possible" DOMicile explainer. It claims the page is *better than the v1 explainer* on the three axes above.
- It does not measure code quality, build correctness, or wire-protocol compliance — those are gated by `npm test` and `cargo test --workspace` per the repo's existing test policy, not by this test.
- It does not commit any library changes. The `tokens/`, `components/`, `templates/*/`, `scripts/runtime/domi*.js`, and `examples/` directories are all read-only per the root `AGENTS.md` library invariant. The only artifact produced is `.domi/output/dominice-twopager.html` and (optionally) its seeded `.domi/state/dominice-twopager.json`.
- It does not generalize beyond this test. If the skill produces a great two-page explainer, that does not mean it will produce a great landing page, pricing page, or docs page. Each archetype is a separate test.

## Failure modes we explicitly want to see if they happen

| Failure mode | What it tells us |
|---|---|
| Skill adds a "Get started" CTA despite the ban | The audit caught a real failure mode in the design system. |
| Skill fills the left half with bullet points despite "no lists" | The no-list constraint is too easy to bypass and needs enforcement via a comment. |
| Skill invents a fake API or phase name | The skill needs stricter source-of-truth directives (e.g. "do not invent commands; if you don't know, leave a `// TODO: verify` marker"). |
| Skill produces a single perfect page and never reads the seeded comments | The skill loop's audit-engagement behavior is broken, not its creative output. |
| Skill reads the comments but revises defensively (e.g. adds more adjectives) | The seeded comment tone is wrong and needs calibration. |

## File-by-file change list

### New files (1)

- `.domi/output/dominice-twopager.html` — the artifact (committed; the prior `.domi/output/dominice-site.html` is also committed).

### New files (conditional)

- `.domi/state/dominice-twopager.json` — NOT seeded via this path. `domi-audit.js` has no disk-read seed; seeding happens via localStorage at page load. The `.domi/state/` directory may still receive a runtime mirror if the user is running `domi-server` in parallel, but it is not part of the test artifact.

### Existing files (0)

No existing files are modified by this test.

## Test orchestration

Run order:

1. `node tools/skill-smoke.mjs --name=dominice-twopager` (this clones `templates/working-doc/` into `.domi/output/dominice-twopager.html` and serves it on `:8123`).
2. The skill opens the page in a browser via Playwright (already wired in `tools/skill-smoke-test.mjs`).
3. The skill reads the three seeded comments and revises the page.
4. The user reviews the page and the three comments + the skill's revisions together.
5. The user grades pass/fail on the three axes in §4.

If step 3 doesn't happen (the skill ships without reading comments), the test is graded as a loop-engagement failure regardless of output quality.

## Out of scope

- A general "AI slop" benchmark for the design system. This test is one data point, not a suite.
- Changes to `domi-audit.js` or the wire protocol.
- A new archetype or primitive.
- Tests against non-DOMicile subjects (Directions B/C from the brainstorm).