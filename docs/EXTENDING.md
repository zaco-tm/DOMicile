# Extending the DOMicile Library

The library (`tokens/`, `components/`, `templates/`) is shared infrastructure. To extend it, follow the patterns here.

## New theme

Path: `tokens/themes/<name>.json`

A theme is a JSON file that overrides any subset of `tokens/tokens.json`. Declared as CSS custom properties inside `domi.css` or as overrides imported after the library's defaults. Document the theme in `tokens/themes/<name>/README.md` with one screenshot or HTML preview.

```json
{ "color.primary": "#..." }
```

Don't rename existing tokens — override them.

**Library themes vs user themes.** The DOMicile library ships with two first-class themes (`neo` and `bundoro`) defined in `tokens/tokens.json` and `tokens/tokens.bundoro.json`, listed in the `tokens/index.json` manifest. The library's themes are integrated as siblings of the default and follow the manifest-driven generator in `tools/tokens-to-css.mjs`.

The `tokens/themes/<name>.json` pattern documented above is the **user-extension path** — a separate mechanism for end users to add their own custom themes that override CSS variables. The library itself does not use this pattern. If you're adding a theme that should ship as a first-class library option (alongside neo and bundoro), use the parallel-file + manifest model instead.

## New primitive

Path: `components/primitives/<name>/`

Layout:

```
components/primitives/<name>/
  README.md         # what it is, when to use it, HTML snippet
  <name>.css        # self-contained; uses domi-* tokens only
  <name>.html       # demo with a realistic example
```

Rules:
- Self-contained CSS — no `@import` of the primitive CSS.
- Always use `domi-*` tokens for color, radius, type. Inline styles allowed for layout primitives only.
- `README.md` MUST show the smallest viable HTML snippet at the top.

## New archetype

Path: `templates/<name>/`

Layout:

```
templates/<name>/
  index.html        # full page using primitives from the library
  README.md         # when to copy this template, what it ships with
```

Use only existing primitives. If you need a primitive that doesn't exist, create it first (see above) and link to it from the archetype README.

## New layout recipe

Path: `docs/LAYOUTS.md`

A layout is a *named composition* of primitives inside an archetype, such as "two-pane workspace with collapsible sidebar" or "kanban board with three swimlanes." Document as:

- A short prose description
- The primitives involved (links)
- An HTML snippet showing the assembly
- A screenshot or HTML preview link

Each recipe gets its own H2 section in `LAYOUTS.md`. A recipe does not become a "thing" unless it gets reused.
