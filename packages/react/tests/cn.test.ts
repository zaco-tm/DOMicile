import { describe, it, expect } from 'vitest';
import { cn } from '../src/utils/cn';

describe('cn()', () => {
  it('joins truthy strings with a single space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values (false / null / undefined)', () => {
    expect(cn('a', false, 'b', null, 'c', undefined)).toBe('a b c');
  });

  it('returns empty string when all parts are falsy', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('preserves internal whitespace within a single part', () => {
    expect(cn('a b', 'c')).toBe('a b c');
  });

  it('handles a single string', () => {
    expect(cn('only')).toBe('only');
  });
});
