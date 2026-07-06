# Phase 3a CSS Audit — ground truth for wrapper API

**Source:** `components/domi.css` (read 2026-07-05)
**Author:** Phase 3a implementation, Task 2
**Rule:** CSS is the source of truth. Wrapper unions match these suffixes exactly. The spec's `Per-primitive mapping` table (Section F) is **aspirational**; this doc is what the wrappers actually expose.

## Per-component actual class set

| Component    | Base class      | Variant suffixes (CSS)                        | Size suffixes (CSS) | Notes                                                                                  |
|--------------|-----------------|------------------------------------------------|---------------------|----------------------------------------------------------------------------------------|
| DomButton    | `.domi-btn`     | `--primary`, `--ghost`, `--danger`             | `--sm`, `--lg`      | Spec `--secondary` not in CSS — dropped. No `--md` size — dropped.                     |
| DomCard      | `.domi-card`    | —                                              | `--sm`, `--lg`      | Spec `--flat`/`--elevated`/`--outlined` not in CSS — dropped.                           |
| DomForm      | `.domi-form`    | —                                              | —                   | Structural only. BEM parts `__row`/`__col`/`__label`/`__help`/`__error` exposed as props.|
| DomInput     | `.domi-input`   | `--error`                                      | `--sm`, `--lg`      | Spec `--md` not in CSS — dropped. `type` prop comes from native `<input type>`.         |
| DomSelect    | `.domi-select`  | `--error`                                      | `--sm`, `--lg`      | Same as Input. `children` for `<option>` passthrough.                                   |
| DomCheckbox  | `.domi-check`   | —                                              | —                   | Spec sizes not in CSS — dropped. Renders `<input type="checkbox" class="domi-check">`. |
| DomRadio     | `.domi-radio`   | —                                              | —                   | Same as Checkbox. Renders `<input type="radio" class="domi-radio">`.                   |
| DomTable     | `.domi-table`   | —                                              | —                   | Spec `--striped`/`--bordered`/`--hover` not in CSS — dropped. All are baked into CSS.  |
| DomNav       | `.domi-nav`     | —                                              | —                   | Spec `--tabs`/`--pills`/`--underline` not in CSS — dropped. BEM `__brand`/`__links`/`__actions` exposed as slots.|
| DomModal     | `.domi-modal`   | —                                              | —                   | Spec sizes `--sm`/`--md`/`--lg`/`--xl` not in CSS — dropped. Renders `<dialog class="domi-modal">`. |
| DomAlert     | `.domi-alert`   | `--info`, `--success`, `--warning`, `--danger` | —                   | Matches spec.                                                                          |
| DomBadge     | `.domi-badge`   | `--primary`, `--success`, `--warning`, `--danger` | —                  | Spec `--secondary` not in CSS — dropped. No sizes in CSS — dropped.                     |
| DomTabs      | `.domi-tabs`    | —                                              | —                   | Spec variants not in CSS — dropped. Tabs are CSS-only via `[aria-selected]`.           |
| DomToast     | `.domi-toast`   | —                                              | —                   | Spec variants not in CSS — dropped. Position is fixed via CSS.                          |
| DomTooltip   | `.domi-tooltip` | —                                              | —                   | Spec position variants not in CSS — uses `data-tooltip` attr + CSS `::after`. Wrapper exposes `content` prop → renders `data-tooltip={content}`. |

## Spec deviations (recorded for downstream review)

1. DomButton: dropped `--secondary`, `--md`.
2. DomCard: dropped `--flat`, `--elevated`, `--outlined`.
3. DomInput / DomSelect: dropped `--md`; added `--error` (not in spec).
4. DomCheckbox / DomRadio: dropped all sizes.
5. DomTable: dropped `--striped`, `--bordered`, `--hover` (all baked into CSS, always-on).
6. DomNav: dropped `--tabs`, `--pills`, `--underline`.
7. DomModal: dropped `--sm`, `--md`, `--lg`, `--xl`.
8. DomBadge: dropped `--secondary`, all sizes.
9. DomTabs / DomToast / DomTooltip: dropped all spec variants; CSS doesn't expose them.

## Adding a new variant later

To add a variant (e.g., `--secondary` on DomButton):
1. Edit `components/domi.css` to add `.domi-btn--secondary { ... }` — this requires library-invariant sign-off from the user.
2. Update this audit doc.
3. Update the DomButton TS union in `packages/react/src/primitives/button.tsx`.
4. Update the test in `packages/react/tests/primitives.test.tsx`.

The audit doc is the contract. Implementation follows it. CSS edits are out-of-scope for 3a.
