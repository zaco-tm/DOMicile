# templates/working-doc/ — AGENTS

Owner: The body half of the studio-frame archetype (2026-08-17 design).

## Safe zones

- Adding `data-feedback="..."` hooks on user-likely-to-comment elements.
- Loading `domi.js` (click feedback, form capture) in the body if the shipped artifact needs it. This is a per-artifact decision; the template itself does not include it.
- Adding `data-theme="bundoro"` to the root `<html>` if the user picked bundoro.

## Ask-first zones

- Adding the rail, status chip, or `domi-audit.js` back into the body. The whole point of the new design is that the body is a clean shippable artifact — putting audit chrome back in defeats it.
- Renaming the template. `working-doc` is the canonical name; the role changed but the name didn't.
- Adding a second body theme. `neo` and `bundoro` are the only body themes for v1.

## Notes

- This template is what the agent (or the skill at clone time) writes the body of an artifact into. The chrome loads the body via the iframe's `src`.
- The body's `data-feedback` attribute is the contract with the chrome's bridge. Renaming the attribute is a breaking change for the chrome.
