import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ButtonVariant,
  CardSize,
  InputSize,
  AlertVariant,
  BadgeVariant,
} from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const barrelPath = resolve(here, '../src/index.ts');

describe('@domi/astro barrel (static + compile-time)', () => {
  it('barrel text exports all 15 components', () => {
    const src = readFileSync(barrelPath, 'utf-8');
    const expected = [
      'Button',
      'Card',
      'Form',
      'Input',
      'Select',
      'Checkbox',
      'Radio',
      'Table',
      'Nav',
      'Tabs',
      'Modal',
      'Alert',
      'Badge',
      'Toast',
      'Tooltip',
    ];
    for (const name of expected) {
      const re = new RegExp(`export \\{ default as ${name} \\}`);
      expect(src, `barrel should re-export ${name}`).toMatch(re);
    }
  });

  it('barrel text re-exports all 15 Props types', () => {
    const src = readFileSync(barrelPath, 'utf-8');
    const expected = [
      'ButtonProps',
      'CardProps',
      'FormProps',
      'InputProps',
      'SelectProps',
      'CheckboxProps',
      'RadioProps',
      'TableProps',
      'NavProps',
      'TabsProps',
      'ModalProps',
      'AlertProps',
      'BadgeProps',
      'ToastProps',
      'TooltipProps',
    ];
    for (const name of expected) {
      const re = new RegExp(`export type \\{ Props as ${name} \\}`);
      expect(src, `barrel should re-export ${name} type`).toMatch(re);
    }
  });

  it('compile-time: types.ts ButtonVariant matches', () => {
    type _Check = ButtonVariant extends 'primary' | 'ghost' | 'danger' ? true : false;
    const check: _Check = true;
    expect(check).toBe(true);
  });

  it('compile-time: CardSize / InputSize / AlertVariant / BadgeVariant match', () => {
    type _Card = CardSize extends 'sm' | 'lg' ? true : false;
    type _Input = InputSize extends 'sm' | 'lg' ? true : false;
    type _Alert = AlertVariant extends 'info' | 'success' | 'warning' | 'danger' ? true : false;
    type _Badge = BadgeVariant extends 'primary' | 'success' | 'warning' | 'danger' ? true : false;
    const c: _Card = true;
    const i: _Input = true;
    const a: _Alert = true;
    const b: _Badge = true;
    expect([c, i, a, b]).toEqual([true, true, true, true]);
  });
});