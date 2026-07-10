# crates/domi-egui/AGENTS.md

Owner: Phase 3c Rust widgets (15 leaves + 5 composites).

## Safe zones

- Under `src/<widget>.rs` per the one-widget-per-file rule.
- Adding a new composite under `src/composites/`.

## Ask-first zones

- Changing `Theme` (currently only exposes `default()`; consumer
  overrides are a Phase 4+ item).
- Swapping the `domi_modal` paint stub for the live
  `egui::ModalManager::default()` once the API stabilises.
- Bumping egui version (registry tracks 0.35; not 0.32).

## Per-file ownership

One widget per `<widget>.rs`. Composites live in `src/composites/`.
If a widget grows past 500 lines, extract a sub-module BEFORE
adding more behavior.
