import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(resolve(here, '../tokens/tokens.json'), 'utf8'));
const schema = JSON.parse(readFileSync(resolve(here, '../tokens/tokens.schema.json'), 'utf8'));

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
