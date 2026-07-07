import { describe, it, expectTypeOf } from 'vitest';
import type {
  ButtonVariant,
  ButtonSize,
  CardSize,
  InputSize,
  SelectSize,
  AlertVariant,
  BadgeVariant,
} from '../src/types';

describe('types.ts unions', () => {
  it('ButtonVariant is exactly primary | ghost | danger', () => {
    expectTypeOf<ButtonVariant>().toEqualTypeOf<'primary' | 'ghost' | 'danger'>();
  });
  it('ButtonSize is exactly sm | lg', () => {
    expectTypeOf<ButtonSize>().toEqualTypeOf<'sm' | 'lg'>();
  });
  it('CardSize is exactly sm | lg', () => {
    expectTypeOf<CardSize>().toEqualTypeOf<'sm' | 'lg'>();
  });
  it('InputSize is exactly sm | lg', () => {
    expectTypeOf<InputSize>().toEqualTypeOf<'sm' | 'lg'>();
  });
  it('SelectSize is exactly sm | lg', () => {
    expectTypeOf<SelectSize>().toEqualTypeOf<'sm' | 'lg'>();
  });
  it('AlertVariant is exactly info | success | warning | danger', () => {
    expectTypeOf<AlertVariant>().toEqualTypeOf<'info' | 'success' | 'warning' | 'danger'>();
  });
  it('BadgeVariant is exactly primary | success | warning | danger', () => {
    expectTypeOf<BadgeVariant>().toEqualTypeOf<'primary' | 'success' | 'warning' | 'danger'>();
  });
});