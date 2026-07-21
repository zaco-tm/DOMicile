import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('scripts/runtime/domi-audit.js', 'utf8');

function loadInternals() {
  globalThis.eval(SRC);
  return globalThis.DomiAudit._internals;
}

describe('parseRefs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    delete globalThis.DomiAudit;
  });

  it('returns a single text segment for body with no @', () => {
    const { parseRefs } = loadInternals();
    expect(parseRefs('just a comment', new Set())).toEqual([
      { kind: 'text', value: 'just a comment' },
    ]);
  });

  it('returns a single text segment for empty body', () => {
    const { parseRefs } = loadInternals();
    expect(parseRefs('', new Set())).toEqual([
      { kind: 'text', value: '' },
    ]);
  });

  it('returns a ref segment when @<6 chars> matches a known short', () => {
    const { parseRefs } = loadInternals();
    const out = parseRefs('see @01J8XQ for context', new Set(['01J8XQ']));
    expect(out).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'ref', value: '@01J8XQ', refId: '01J8XQ' },
      { kind: 'text', value: ' for context' },
    ]);
  });

  it('keeps the @ as text when the candidate is not a known short', () => {
    const { parseRefs } = loadInternals();
    const out = parseRefs('see @01J8XX for context', new Set(['01J8XQ']));
    expect(out).toEqual([
      { kind: 'text', value: 'see @01J8XX for context' },
    ]);
  });

  it('matches a 4-char candidate if it is in the known shorts', () => {
    const { parseRefs } = loadInternals();
    const out = parseRefs('@01J8 partial', new Set(['01J8']));
    expect(out).toEqual([
      { kind: 'ref', value: '@01J8', refId: '01J8' },
      { kind: 'text', value: ' partial' },
    ]);
  });

  it('does not match inside a longer base-32 run (negative lookahead)', () => {
    const { parseRefs } = loadInternals();
    // 01J8XZ is a known short, but it's followed by 'A' (also base-32) so
    // the regex's negative lookahead rejects the match.
    const out = parseRefs('see @01J8XZA here', new Set(['01J8XZ']));
    expect(out).toEqual([
      { kind: 'text', value: 'see @01J8XZA here' },
    ]);
  });

  it('parses multiple @ refs in the same body', () => {
    const { parseRefs } = loadInternals();
    const out = parseRefs('compare @01J8XQ with @01J8XR', new Set(['01J8XQ', '01J8XR']));
    expect(out).toEqual([
      { kind: 'text', value: 'compare ' },
      { kind: 'ref', value: '@01J8XQ', refId: '01J8XQ' },
      { kind: 'text', value: ' with ' },
      { kind: 'ref', value: '@01J8XR', refId: '01J8XR' },
    ]);
  });

  it('does not match @ followed by fewer than 4 base-32 chars', () => {
    const { parseRefs } = loadInternals();
    const out = parseRefs('see @01J', new Set(['01J8XQ']));
    expect(out).toEqual([
      { kind: 'text', value: 'see @01J' },
    ]);
  });

  it('does not match @ with no base-32 chars', () => {
    const { parseRefs } = loadInternals();
    const out = parseRefs('email me @', new Set());
    expect(out).toEqual([
      { kind: 'text', value: 'email me @' },
    ]);
  });

  it('does not match a ref to a known short that was removed (still known)', () => {
    // The parser is unaware of removed state. The render layer marks removed
    // refs as faded. The parser just looks up knownShorts.
    const { parseRefs } = loadInternals();
    const out = parseRefs('see @01J8XQ', new Set(['01J8XQ']));
    expect(out[1].kind).toBe('ref');
    expect(out[1].refId).toBe('01J8XQ');
  });
});
