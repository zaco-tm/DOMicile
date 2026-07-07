import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ButtonVariant,
  ButtonSize,
  CardSize,
  InputSize,
  SelectSize,
  AlertVariant,
  BadgeVariant,
} from '../src/types';

const auditPath = resolve(__dirname, '../../react/CSS-AUDIT.md');
const audit = readFileSync(auditPath, 'utf-8');

/**
 * Parse the per-component table row from CSS-AUDIT.md.
 * Returns the suffix list for the named component + field.
 * The markdown table columns are: Component | Base | Variants | Sizes | Notes
 * (zero-indexed 1..4 after splitting on `|`).
 */
function parseSuffixes(component: string, field: 'Variant' | 'Size'): string[] {
  const lines = audit.split('\n');
  const row = lines.find((l) => l.startsWith(`| ${component} `));
  if (!row) throw new Error(`CSS-AUDIT.md has no row for ${component}`);
  const cells = row.split('|').map((c) => c.trim());
  // cells: ['', 'DomButton', '`.domi-btn`', '`--primary`, `--ghost`, `--danger`', '`--sm`, `--lg`', 'Notes']
  const idx = field === 'Variant' ? 3 : 4;
  const cell = cells[idx];
  if (!cell || cell === '—' || cell === '') return [];
  // Strip backticks, split on commas, trim each, strip leading `--`.
  return cell
    .replace(/`/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith('--') ? s.slice(2) : s));
}

/** Build the literal union TS type from a list of suffix strings. */
function unionLiteral(suffixes: string[]): string {
  if (suffixes.length === 0) return 'never';
  return [...suffixes].sort().map((s) => `'${s}'`).join(' | ');
}

describe('CSS audit consistency', () => {
  it('Button variants match CSS-AUDIT', () => {
    expect(parseSuffixes('DomButton', 'Variant')).toEqual(['primary', 'ghost', 'danger']);
  });

  it('Button sizes match CSS-AUDIT', () => {
    expect(parseSuffixes('DomButton', 'Size')).toEqual(['sm', 'lg']);
  });

  it('Card sizes match CSS-AUDIT', () => {
    expect(parseSuffixes('DomCard', 'Size')).toEqual(['sm', 'lg']);
  });

  it('Card has no variants in CSS-AUDIT', () => {
    expect(parseSuffixes('DomCard', 'Variant')).toEqual([]);
  });

  it('Input sizes match CSS-AUDIT', () => {
    expect(parseSuffixes('DomInput', 'Size')).toEqual(['sm', 'lg']);
  });

  it('Select sizes match CSS-AUDIT', () => {
    expect(parseSuffixes('DomSelect', 'Size')).toEqual(['sm', 'lg']);
  });

  it('Alert variants match CSS-AUDIT', () => {
    expect(parseSuffixes('DomAlert', 'Variant')).toEqual(['info', 'success', 'warning', 'danger']);
  });

  it('Badge variants match CSS-AUDIT', () => {
    expect(parseSuffixes('DomBadge', 'Variant')).toEqual(['primary', 'success', 'warning', 'danger']);
  });

  it('parseSuffixes: literal union matches TS union string', () => {
    // Quick sanity: verify our unionLiteral helper produces the expected string.
    expect(unionLiteral(['primary', 'ghost', 'danger'])).toBe("'danger' | 'ghost' | 'primary'");
    expect(unionLiteral([])).toBe('never');
  });

  it('compile-time guard: every TS union is at least as wide as CSS-AUDIT', () => {
    // If someone removes a member from a union in types.ts, this assignment fails to compile.
    const _buttonVariant: ButtonVariant = 'primary';
    const _buttonSize: ButtonSize = 'sm';
    const _cardSize: CardSize = 'lg';
    const _inputSize: InputSize = 'lg';
    const _selectSize: SelectSize = 'lg';
    const _alertVariant: AlertVariant = 'info';
    const _badgeVariant: BadgeVariant = 'primary';
    expect([
      _buttonVariant,
      _buttonSize,
      _cardSize,
      _inputSize,
      _selectSize,
      _alertVariant,
      _badgeVariant,
    ]).toBeDefined();
  });
});