# templates/working-doc-chrome/ — AGENTS

Owner: The studio-frame archetype (2026-08-17 design).

## Safe zones

- Tweaking the snap button labels (375/768/1024/1280) — only with a design rationale (e.g., adding a new standard breakpoint).
- Tweaking the resizer width (currently 6px) — only with a design rationale.
- Adding a new style to the chrome's `<style>` block that does not touch the rail, the bridge, or the iframe contract.
- Updating the README to reflect new behavior.

## Ask-first zones

- Changing the rail, status chip, or audit-thread storage paths — that's a `domi-audit.js` change (library-invariant).
- Changing the postMessage bridge contract (which events are dispatched, what payloads they carry).
- Changing the iframe's `src` resolution logic (e.g., to support `?raw=1` mode) — the body file is currently passive.
- Adding a second chrome theme. `studio` is the only chrome theme for v1.
- Removing the iframe entirely. The whole point of this template is to wrap a body in a resizable frame.

## Notes

- This template is what `tools/skill-smoke.mjs` and `tools/skill-smoke-server-test.mjs` should clone. Update those scripts if you change the entry template.
- The chrome is meta-tooling. It is NOT shipped to end users. The body file is the deliverable.
