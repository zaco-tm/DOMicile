---
name: dominice
description: Cross-platform UI design system. Use when authoring interactive HTML artifacts for human-agent communication. Generates standalone HTML files using locked Neo-Glass-Vintage "Sunset Pastel" tokens, 15 primitives, and 5 archetypes. Triggers on "make me a [dashboard|pricing|...]", "open this in a tab", or any request for an interactive HTML deliverable.
---

# DOMiNice

You are an agent that produces interactive HTML artifacts using the DOMiNice design system. The driving documents in any agent↔human loop are HTML, not markdown.

## When to use this skill

Load this skill when the user asks for:

- An interactive HTML page, dashboard, report, or app prototype
- A UI mockup, wireframe, or visual comparison
- Any artifact where the user will view it in a browser and may want to give feedback

Do NOT use this skill for: pure text/markdown reports, code generation, server-side logic, or anything the user won't open in a browser.

## The pattern

1. **Identify the archetype.** Pick the closest fit from: `dashboard`, `webapp-shell`, `mobile-app-shell`, `admin-tool`, `pos-kiosk`. Copy from `templates/<archetype>/index.html`.
2. **Compose primitives.** Use only DOMiNice primitives (button, card, input, table, nav, modal, alert, badge, tabs, toast, tooltip, select, checkbox, radio, form). Reference: `components/primitives/<name>/README.md`.
3. **Apply tokens, not raw colors.** Use CSS classes (`.domi-btn`, `.domi-card`, etc.) instead of inline styles for color/typography/radius. Inline styles are OK for layout-only properties (display, padding, margin, grid).
4. **Single CSS link.** Include `<link rel="stylesheet" href="../../components/domi.css">` (relative path from `templates/`) or copy the contents inline for fully self-contained files.
5. **Optional interactivity.** Add `<script src="../../scripts/domi.js"></script>` for click feedback and form capture. Add `data-feedback="<name>"` to elements you want the user to be able to click on.
6. **Standalone-first.** Every artifact must open via `file://` with zero infra. No CDN, no build step, no fetch.

## Output location

Write to `.domi/output/<artifact>.html` in the user's project. If `.domi/state/server-info.json` exists (Phase 2 live server is running), the user will see it hot-reload in their browser.

## Aesthetic — Neo-Glass-Vintage Sunset Pastel

- **Background:** primary gradient `plum → coral → peach` (`#a89cc8 → #f4978e → #ffd6b3`) at 135°
- **Surfaces:** glass (`rgba(255,255,255,0.4–0.8)` with `backdrop-filter: blur(12px)`)
- **Display:** Helvetica Neue Black, uppercase, tight tracking
- **Body/labels:** JetBrains Mono / SF Mono
- **Text:** dark plum `#3d2342`
- **Accents:** sage `#9caf88` for success, terracotta `#c2410c` for danger

## Examples

### "Make me a sales dashboard"

1. Copy `templates/dashboard/index.html`
2. Replace KPI numbers with real data
3. Replace chart bars with real data (or inject inline SVG)
4. Add `data-feedback="metric-revenue"` etc. to KPI cards
5. Write to `.domi/output/dashboard.html`

### "Show me three pricing options side by side"

1. Compose three `.domi-card` elements in a `.split` layout
2. Use `.domi-btn--primary` for the recommended tier
3. Use `.domi-badge` for "POPULAR" / "BEST VALUE"
4. Write to `.domi/output/pricing.html`

## Reference

- Design tokens: `tokens/tokens.json`
- Primitives: `components/primitives/<name>/README.md`
- Archetypes: `templates/<name>/README.md`
- Full docs: `docs/DESIGN.md`, `docs/USAGE.md`, `docs/STANDARDS.md`
- Status: `status/STATUS.html`
