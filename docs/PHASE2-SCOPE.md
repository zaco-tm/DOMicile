# Phase 2 Scope Map

Phase 2 of DOMiNice was originally scoped as a single chunk: "live server." It's large. The 2026-07-05 rework decomposed it into four sub-projects, each with its own brainstorm→plan→execute cycle.

| Sub | Name | Status | Deliverable |
|---|---|---|---|
| **2a** | Wire protocol & event schema | **In this spec** | `docs/superpowers/specs/2026-07-05-phase2-wire-protocol-design.md`, `docs/WIRE-PROTOCOL.md`, `docs/schemas/event.schema.json` |
| 2b | Server-attached JS mode | Not started | `domi.js` + `domi-audit.js` mode-switch on `__DOMI_SERVER__`, plus a tiny `scripts/domi-server.js` shim |
| 2c | `domi-server` Rust binary | Not started | axum + tokio + notify implementation of the routes in §D of 2a |
| 2d | Agent reader + install/verify | Not started | Tail/replay/push CLI in `tools/`, install.sh + verify.sh exercising 2c |

## Dependency order

2a → 2b and 2c can run in parallel after 2a. 2d requires 2c. So the smallest sequential schedule is:

1. **2a** (this doc) — protocol pin-down.
2. **2b + 2c** in parallel — JS mode upgrade + Rust binary. They share 2a's contract.
3. **2d** — agent tooling.

## What 2a is *not*

- Not a Rust implementation.
- Not a runtime change to existing JS.
- Not a verification harness.

**2a is documentation and a JSON Schema.** Tests for 2a are JSON-schema validation tests (`tests/wire-protocol.test.js` — events validate; malformed rejects; `v: 1` detection works for rotation).

## Why "wire protocol" first

2b and 2c each invent their own event shape if allowed to design independently. The boundary between them is the wire — the cost of getting it wrong is a re-implementation across both. 2a's whole job is to make sure both implementers reach for the same shape and ship a JSON Schema either can validate against.

## Cross-references

- 2a's spec: `docs/superpowers/specs/2026-07-05-phase2-wire-protocol-design.md`
- 2a's reference for clients: `docs/WIRE-PROTOCOL.md`
- 2a's machine-readable schema: `docs/schemas/event.schema.json`
- Phase 1 design spec (source of Phase 2's existence): `docs/superpowers/specs/2026-07-05-dominice-design.md`
- SKILL reframe that establishes working-doc mode (the consumer of these events): `SKILL.md` + `docs/AUDIT.md`
