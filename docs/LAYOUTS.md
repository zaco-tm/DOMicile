# Layout Recipes

A *layout recipe* is a named composition of DOMicile primitives inside an archetype. Use these as starting points for both deliverables and working docs.

## Two-pane workspace (sidebar + main)

Primitives: `nav`, `card`, `table`.

```html
<aside class="domi-nav">…</aside>
<main class="domi-grid domi-grid--two">
  <section class="domi-card">…</section>
  <section class="domi-card">…</section>
</main>
```

## Three-tier pricing (split with badges)

Primitives: `card`, `badge`, `button`.

```html
<div class="domi-split">
  <article class="domi-card">…<span class="domi-badge">STARTER</span></article>
  <article class="domi-card">…<span class="domi-badge">POPULAR</span></article>
  <article class="domi-card">…<span class="domi-badge">BEST VALUE</span></article>
</div>
```

## KPI dashboard (grid of cards)

Primitives: `card`, `badge`, `tooltip`.

```html
<div class="domi-grid domi-grid--four">
  <article class="domi-card">…<span class="domi-badge domi-badge--success">+12%</span></article>
  <article class="domi-card">…</article>
  <article class="domi-card">…</article>
  <article class="domi-card">…</article>
</div>
```

## Add a new recipe

To add a recipe:

1. Validate it works inside an existing archetype (`templates/dashboard/`, `templates/webapp-shell/`, etc.).
2. Add an H2 section to this file with the prose description, primitives used, and an HTML snippet.
3. Link the recipe from the archetype's `README.md`.
