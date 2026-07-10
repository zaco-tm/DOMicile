# DOMiNice Skill — Design Spec

**Date:** 2026-07-05
**Status:** Draft (post self-review)
**Owner:** zaco
**Scope:** Rework of the `SKILL.md` author layer that wraps the DOMiNice design-system library. Does NOT redesign tokens, primitives, templates, or `domi.js`.

## Problem

The previous version of `SKILL.md` framed DOMiNice as "a tool for delivering neo-themed HTML artifacts for human-agent communication." That framing flattens two distinct roles into one:

1. The **authoring role** — the skill must help an agent *create* UI work: new primitives, components, layouts, themes, archetypes. Building, not just consuming.
2. The **audit/iteration role** — the skill must let an agent and the user work *through* UI/UX changes inside the same HTML docs, with the user able to open a tab, scroll, click, annotate, and have the agent read those signals and iterate.

The neo-glass-vintage sunset-pastel aesthetic was treated as the *purpose*, when it is actually the **house style for the skill's own output docs** — status pages, working versions of components being reviewed, audit threads. It is one preset among themes the agent may produce as deliverables, not the totality of the system.

The fix is to reframe the SKILL.md so it teaches an agent to *create* UI work and *audit* it with the user, with the neo aesthetic reserved for the docs the skill itself uses to talk to the user.

## Goals

1. An agent loading this skill can produce new UI work (components, layouts, themes) without bolting on a different design system.
2. When a user wants to *work on* UI/UX (rather than be handed a final artifact), the agent produces a working doc the user opens, annotates, and the agent iterates on.
3. The neo aesthetic is the default skin for working docs and audit surfaces. Deliverables can ship in any theme.
4. The library itself (`tokens/`, `components/`, `templates/`, `scripts/`, `status/`) is untouched by this change.

## Non-goals

- Rewriting tokens, primitive CSS, archetypes, or `domi.js`.
- Adding the Phase 2 Rust live server.
- Multi-target wrappers (`@domi/react`, `@domi/astro`, `domi-dvui`).
- Imposing any particular feedback-transport mechanism (e.g., a real WebSocket server). Phase 1 is file-based persistence.

## Design

### A. Two output modes

The agent must answer two questions *first* before writing any HTML:

1. **Create-new or audit-existing?** (Is the user asking for fresh UI work, or iterating on existing UI?)
2. **Working doc or deliverable?** (Does the user want a clean shippable HTML file, or do they want a doc they can open and annotate together?)

The combination yields three output modes:

| Mode | Trigger signals | HTML contains | Persisted state |
|---|---|---|---|
| **Working doc — create** | "let's build X," "draft a new Y," "I want to start on Z" | Full DOMiNice chrome (feedback rail, status chip, version stamp, `data-feedback` hooks on elements the user is likely to want to comment on — e.g., each section header, each interactive primitive, each layout decision), neo skin by default | `.domi/state/<name>.json` (audit thread) |
| **Working doc — audit/iterate** | "review this," "iterate on Y," "what should change?" | Same chrome as create, but the existing thread is loaded and shown | `.domi/state/<name>.json` (read + append) |
| **Deliverable** | "ship the dashboard," "give me the final X," "hand this off" | Clean HTML using agreed DOMiNice primitives/components. **No feedback rail, no status chip.** Theme is whatever the user chose (neo by default, but only if not specified otherwise). | None (artifact is final unless user reopens) |

Misclassifying is the most common bug. The skill must list the linguistic signals it keys on, with examples.

### B. Neo aesthetic — narrowed role

Neo-glass-vintage sunset-pastel is the **default skin for working docs** because the user explicitly wants the skill's own HTML output to look like that. It is *not* the only skin. Deliverables can be in neo (if the user does not specify) or any other theme the agent and user agree on.

Rules:

- Working docs (both create and audit modes) → neo skin, no choice. This is how the agent's communication with the user looks.
- Deliverables → ask or default to neo. Never assume neo if the user has stated a different theme.
- Library primitives remain neo-tokened (because the library exists to be used), but primitives that hard-code neo colors are acceptable for Phase 1. Theming primitives is a Phase 2 concern, out of scope here.

### C. Authoring responsibilities (creating new UI work)

The skill teaches the agent to use the library to *make* new things, not just assemble existing ones. Concretely:

- **New theme:** drop a CSS override file in `.domi/themes/<name>.css`, declare tokens via CSS custom properties, document in `.domi/themes/<name>/README.md`. The skill describes the pattern, not the values.
- **New primitive:** copy from an existing primitive's README, follow the structure, write a small HTML+CSS block, add to `components/primitives/`. The skill points at a "primitive authoring template."
- **New archetype:** copy `templates/<archetype>/index.html`, change structure, document in `templates/<name>/README.md`.
- **New layout:** a layout is a composition of primitives inside an archetype. Document as a recipe in `docs/LAYOUTS.md` (a new doc).
- **All of the above:** the skill tells the agent where files go, what shape they take, and how to test them.

### D. Audit/iteration loop

When in a working-doc mode, the loop is:

1. Agent writes `.domi/output/<artifact>.html` (working doc) and seeds `.domi/state/<artifact>.json` with an empty thread.
2. User opens the file (`file://` for Phase 1; Phase 2 server hot-reloads if running).
3. User leaves feedback via:
   - Clicks on `data-feedback="<id>"` elements → triggers domi.js capture (handled by existing primitives; needs an audit-specific extension).
   - A visible feedback rail in the doc (sidebar), where comments are scoped to an element id and persisted via domi.js.
4. On reload, comments render next to the elements they reference.
5. Agent reads `.domi/state/<artifact>.json` (or, in this session, the user's prose summary) and iterates by editing the HTML.
6. Repeat until user signals "done" → agent produces a Deliverable-mode HTML (clean, no rail).

Phase 1 specifics: comments persist to the JSON file via domi.js + `localStorage` (or the file's own state, but simpler is localStorage with a server-side mirror later). The skill defines the JSON schema for thread entries: `{ id, targetId, author, timestamp, body, resolved }`.

### E. Output location

All artifacts go in `.domi/output/`. This directory is created on demand. State files go in `.domi/state/`. The skill must not instruct the agent to write into `tokens/`, `components/`, `templates/`, `scripts/`, or `status/` directly *unless* the user is explicitly extending the library (Section C) — in which case the skill walks through the contribution rules for that subsystem.

### F. What `SKILL.md` will say

The new SKILL.md (rewritten) must lead with:

1. One-sentence purpose: "DOMiNice is a skill for authoring and iterating on UI work — components, primitives, layouts, themes — and for working through UI/UX changes with the user through shared HTML docs."
2. The two first questions (create-or-audit × working-doc-or-deliverable) and how to answer them.
3. The three modes that fall out, with signals.
4. File locations (`.domi/output/`, `.domi/state/`, library paths).
5. How to extend the library (Section C, abbreviated).
6. The neo rule (Section B).

It must NOT lead with the aesthetic. Aesthetic is mid-document, scoped to working docs.

## Supporting docs

This rework produces three new/edited docs:

- `SKILL.md` — rewritten (top priority).
- `docs/AUDIT.md` — new. The audit-loop how-to for working docs (signals, JSON schema, domi.js hooks).
- `docs/EXTENDING.md` — new. The library-extension how-to for new themes/primitives/archetypes/layouts.
- `INIT.md` — keep, but verify it points at the new SKILL.md and refers to the two first questions.

No edits to `docs/DESIGN.md`, `docs/USAGE.md`, `docs/STANDARDS.md` — those describe the library itself, which is unchanged.

## File-by-file changes

| File | Action | Notes |
|---|---|---|
| `SKILL.md` | Rewrite | See Section F. |
| `docs/AUDIT.md` | Create | Section D. |
| `docs/EXTENDING.md` | Create | Section C. |
| `INIT.md` | Touch up | Verify links/references after the SKILL.md rewrite. |
| `scripts/runtime/domi.js` | Edit, additive only | Add a `DomiAudit` runtime that mounts the feedback rail and reads/writes `.domi/state/<name>.json` via localStorage mirroring. Bump version chip. |
| `status/STATUS.html` | Touch up | Reflect new skill structure if it claims authority over the library version. |
| `RELEASE-NOTES-v0.1.0.md` | Append section | Note the SKILL reframe at the bottom of the v0.1.0 notes (since SKILL.md changes are still v0.1.0). |

`components/domi.css`, `tokens/tokens.json`, `templates/**`, library CSS — untouched in this rework.

## Risks and open questions

- **Feedback-rail UX.** Is "sidebar with element-scoped comments" really the right shape? Alternatives: annotation pins directly on the DOM, a separate chat-style panel. Phase 1 keeps it simple (sidebar); revisit if users hate it.
- **DOMi.js scope creep.** Adding the audit rail to `domi.js` risks ballooning the runtime. A separate `scripts/runtime/domi-audit.js` would be cleaner; defer that decision until AUDIT.md is drafted and we see how much code it actually takes.
- **Mode-misclassification.** Heuristics on user phrasing ("let's" vs "ship") are brittle. Phase 2 (live server + Linear-style triage) may want an explicit mode picker.
- **Library extension vs. output contamination.** An agent generating a "new theme" might dump its CSS in `.domi/output/` and call it done. The skill must remind it to use the contribution flow when extending the library proper.

## Acceptance

The rework is done when:

- `SKILL.md` rewritten per Section F.
- `docs/AUDIT.md` and `docs/EXTENDING.md` exist and are skim-readable.
- `INIT.md` references the new SKILL.md.
- `scripts/runtime/domi-audit.js` (or the in-place extension to `domi.js`) exists and demonstrates a working feedback rail on at least one example artifact.
- A short README/code-comment trail tells future contributors which subsystems the skill owns vs. the library owns.
- Existing tests still pass (`npm test`).
