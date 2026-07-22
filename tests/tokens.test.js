import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(resolve(here, '../tokens/tokens.json'), 'utf8'));
const schema = JSON.parse(readFileSync(resolve(here, '../tokens/tokens.schema.json'), 'utf8'));

const bundoroTokensPath = resolve(here, '../tokens/tokens.bundoro.json');
const indexPath = resolve(here, '../tokens/index.json');

const flatten = (obj, prefix = '') => {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flatten(v, key));
    } else {
      out.push(key);
    }
  }
  return out;
};

describe('tokens.json', () => {
  it('matches the schema', () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const ok = validate(tokens);
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('locks the primary gradient to plum → coral → peach', () => {
    expect(tokens.color.primary.gradient).toEqual(['#a89cc8', '#f4978e', '#ffd6b3']);
  });

  it('locks text color to dark plum', () => {
    expect(tokens.color.text.default).toBe('#3d2342');
  });
});

describe('tokens/tokens.bundoro.json', () => {
  it('exists', () => {
    expect(existsSync(bundoroTokensPath)).toBe(true);
  });

  it('matches the schema', () => {
    const tokens = JSON.parse(readFileSync(bundoroTokensPath, 'utf8'));
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(tokens), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('locks the primary gradient to a cream saturation sweep', () => {
    const tokens = JSON.parse(readFileSync(bundoroTokensPath, 'utf8'));
    expect(tokens.color.primary.gradient).toEqual(['#f4ead5', '#faf3e7', '#f0e2c4']);
  });

  it('locks text color to deep teal', () => {
    const tokens = JSON.parse(readFileSync(bundoroTokensPath, 'utf8'));
    expect(tokens.color.text.default).toBe('#1d3a3a');
  });

  it('locks accent to coral', () => {
    const tokens = JSON.parse(readFileSync(bundoroTokensPath, 'utf8'));
    expect(tokens.color.accent.primary).toBe('#e87a5d');
  });

  it('has the same key shape as tokens.json', () => {
    const neo = JSON.parse(readFileSync(resolve(here, '../tokens/tokens.json'), 'utf8'));
    const bundoro = JSON.parse(readFileSync(bundoroTokensPath, 'utf8'));
    expect(flatten(bundoro).sort()).toEqual(flatten(neo).sort());
  });
});

describe('tokens/index.json', () => {
  it('exists and parses', () => {
    expect(existsSync(indexPath)).toBe(true);
    expect(() => JSON.parse(readFileSync(indexPath, 'utf8'))).not.toThrow();
  });

  it('names neo as the default', () => {
    const idx = JSON.parse(readFileSync(indexPath, 'utf8'));
    expect(idx.default).toBe('neo');
  });

  it('lists neo and bundoro themes', () => {
    const idx = JSON.parse(readFileSync(indexPath, 'utf8'));
    expect(Object.keys(idx.themes).sort()).toEqual(['bundoro', 'neo']);
  });

  it('maps theme names to existing files', () => {
    const idx = JSON.parse(readFileSync(indexPath, 'utf8'));
    for (const [name, file] of Object.entries(idx.themes)) {
      expect(existsSync(resolve(here, '..', file)), `theme ${name} → missing ${file}`).toBe(true);
    }
  });
});
