# landing-page

Public-facing marketing landing page. The DOMicile project's own homepage
(`https://zaco-tm.github.io/DOMicile/`) is built from this archetype — so
this is the highest-fidelity example of what a finished DOMicile page looks
like. It doubles as the DOMicile design-system reference and as the
"show, don't tell" demo for the skill.

## What it demonstrates

- **Hero** — pixel-font wordmark card, large display headline with two
  color-popped key words, plum→coral→peach gradient separator above the
  subhead, full-bleed brand gradient background
- **The loop** — 4-step diagram with a dashed "not yet?" loop arrow drawn
  above the row, plus a terracotta→plum callout banner
- **Bento grid** — archetypes row across the top (3 visible + hover-popup
  for all 5), primitives and languages sharing the second row (8 visible
  primitives + hover-popup for all 15, all 3 languages shown)
- **Closing CTA** — bold display headline, an install card with two
  copyable rows (one for the human, one as a prompt to paste into the
  user's own agent), small link row, branded credits footer
- **Hover interactions** — `:hover`-triggered popups, card lift, link
  underlines
- **Touch fallback** — `@media (hover: none)` makes the popups
  always-visible with a dashed border on devices that don't support hover
- **Responsive** — all three breakpoints work (mobile collapses the
  bento to a single column, hides the mascot, and switches the loop grid
  to 2×2)
- **CSS-only animations** — the loop diagram's "not yet?" arrow and the
  mascot subtle drift, all respecting `prefers-reduced-motion`

## Tokens used

Everything reads from `tokens/tokens.json` via the inlined library CSS at
the top of the file. The gradient backgrounds (plum→coral→peach) and the
type stack (Helvetica Neue display, SF Mono / JetBrains Mono / Space Mono
body, Press Start 2P for the wordmark) are all from the token set.

## Customization

To make your own landing page from this archetype:

1. **Copy the folder** — `cp -R templates/landing-page/ my-landing/`
2. **Edit the headline + subhead** in the hero section
3. **Swap the mascot** at `domi-mascot-200.png` (keep the filename, or
   update the `<img src>` in the hero)
4. **Replace the install commands** in the closing CTA card with your
   own
5. **Update the links** in `close-links` and the credits footer
6. **Tweak the bento** — add or remove primitives from
   `box-primitive-grid` and the popup, add/remove archetypes the same
   way

The hover popups are pure CSS (`.box-card:hover .box-popup { display:
block; }`) — no JS needed for the interactions.

## Deployment

This archetype is also published to **GitHub Pages** at the repo root.
`.github/workflows/publish-landing.yml` runs on every push to `main` and
copies `index.html` + `domi-mascot-200.png` to the repo root so Pages
serves them at `https://zaco-tm.github.io/DOMicile/`. If you fork the
archetype, either:

- Copy the same workflow into your repo's `.github/workflows/`, or
- Just deploy the folder to any static host (Vercel, Netlify, S3+CDN,
  etc.) — it's fully self-contained except for two Google Fonts
  (Space Mono and Press Start 2P).

## Self-reference

This page is the highest-fidelity argument for the skill: it's a real,
working public site built entirely with DOMicile primitives and tokens,
no bespoke components. If it works here, it works for your project.
