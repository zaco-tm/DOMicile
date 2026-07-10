// Barrel test: ensure the package's public surface (the index re-exports)
// still ships all 15 components and the cn() helper. Kept separate
// from the per-primitive tests because it tests the package boundary,
// not any individual component.

import { describe, it, expect } from 'vitest';
import * as DomiReact from '../../src';

describe('@domi/react barrel', () => {
  it('exports all 15 components', () => {
    const expected = [
      'DomButton', 'DomCard', 'DomForm', 'DomInput', 'DomSelect',
      'DomCheckbox', 'DomRadio', 'DomTable', 'DomNav', 'DomModal',
      'DomAlert', 'DomBadge', 'DomTabs', 'DomToast', 'DomTooltip'
    ];
    for (const name of expected) {
      expect(DomiReact).toHaveProperty(name);
    }
  });

  it('exports cn() helper', () => {
    expect(typeof DomiReact.cn).toBe('function');
  });
});
