# modal

Fixed-overlay dialog. Opens via the `[open]` attribute (set via JS).

## Usage

```html
<div class="domi-modal" open>
  <div class="domi-modal__dialog">
    <h3 class="domi-modal__title">Title</h3>
    <p>Content</p>
  </div>
</div>
```

Toggle `open` via JS: `el.toggleAttribute('open')`.
