# Design — DOMicile

## Aesthetic: Neo-Glass-Vintage "Sunset Pastel"

A warm, slightly terminal/technical vibe built on three layers:

1. **Primary gradient:** plum → coral → peach at 135°
2. **Glass surfaces:** frosted panels with backdrop blur
3. **Mono body type:** JetBrains Mono / SF Mono throughout

## Tokens (source of truth: `tokens/tokens.json`)

### Colors

| Token | Value | Use |
|---|---|---|
| `--domi-color-primary-gradient` | `#a89cc8, #f4978e, #ffd6b3` | Page bg, primary buttons, hero blocks |
| `--domi-color-secondary-sage` | `#9caf88` | Success states, positive deltas |
| `--domi-color-accent-plum` | `#a89cc8` | Focus rings, tertiary surfaces |
| `--domi-color-text-default` | `#3d2342` | All body text, icons |
| `--domi-color-text-muted` | `#3d2342aa` | Captions, helper text |
| `--domi-color-surface-glass` | `#ffffff60` | Card bg, modal bg, button bg |

### Type

- **Display:** `'Helvetica Neue', 'Arial Black', sans-serif`, weight 900, uppercase, letter-spacing -0.02em
- **Body / labels:** `'SF Mono', 'JetBrains Mono', monospace`

### Radius

`4px` (badges) · `8px` (buttons, inputs) · `16px` (cards) · `9999px` (pill, opt-in)

### Glass

`backdrop-filter: blur(12px)` over `rgba(255,255,255,0.4–0.8)` background + `1px solid rgba(61,35,66,0.4)` border.

## Accessibility

- All interactive elements have `:focus-visible` outline (2px solid plum, 2px offset).
- Color contrast: dark plum `#3d2342` on glass surfaces meets WCAG AA for body text.
- Touch targets: minimum 44×44px (POS archetype bumps to 56px).

## Don't

- ❌ Don't use pure black `#000` or pure white `#fff` for text or surfaces
- ❌ Don't use sans-serif body type — it breaks the mono backbone
- ❌ Don't add box-shadows other than `--domi-shadow-soft` and `--domi-shadow-offset`
- ❌ Don't use Tailwind or external CSS frameworks
