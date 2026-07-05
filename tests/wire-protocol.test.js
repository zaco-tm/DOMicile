import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(resolve(here, '../docs/schemas/event.schema.json'), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(SCHEMA);

const MINIMAL_EVENT = {
  v: 2,
  id: '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ0',
  ts: '2026-07-05T18:21:00.000Z',
  src: 'domi.js',
  doc: 'onboarding-v2',
  kind: 'click',
  target: { id: 'btn-save', selector: 'main > .domi-card:nth-of-type(1)', rect: { x: 120, y: 480, w: 200, h: 32 } },
  data: { value: 'Save' },
};

describe('event.schema.json', () => {
  it('accepts a minimal valid click event', () => {
    expect(validate(MINIMAL_EVENT)).toBe(true);
  });

  it('accepts each known kind with its data shape', () => {
    const ids = [
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ1',
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ2',
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ3',
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ4',
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ5',
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ6',
    ];
    const entryId = '01H8XZQ5K2J9Z9Q4X5Y6Z7XXZ9';
    let i = 0;
    for (const kind of ['click', 'input', 'submit', 'rail-add', 'rail-resolve', 'custom']) {
      const e = structuredClone(MINIMAL_EVENT);
      e.kind = kind;
      e.id = ids[i++];
      if (kind === 'input') e.data = { name: 'projectName', value: 'Acme Co' };
      else if (kind === 'submit') e.data = { formId: 'signup', fields: { email: 'a@b.co' } };
      else if (kind === 'rail-add') e.data = { body: 'too prominent', targetId: 'btn-save' };
      else if (kind === 'rail-resolve') e.data = { entryId };
      else if (kind === 'custom') e.data = { payload: { whatever: 'goes' } };
      expect(validate(e)).toBe(true);
    }
  });

  it('rejects events with v != 2', () => {
    const bad = structuredClone(MINIMAL_EVENT);
    bad.v = 1;
    expect(validate(bad)).toBe(false);
  });

  it('rejects events missing required fields', () => {
    const { ts, ...missing } = MINIMAL_EVENT;
    expect(validate(missing)).toBe(false);
  });

  it('rejects unknown src values', () => {
    const bad = structuredClone(MINIMAL_EVENT);
    bad.src = 'made-up-runtime';
    expect(validate(bad)).toBe(false);
  });

  it('rejects unknown kind values', () => {
    const bad = structuredClone(MINIMAL_EVENT);
    bad.kind = 'hover';
    expect(validate(bad)).toBe(false);
  });

  it('rejects id that is not a ULID', () => {
    const bad = structuredClone(MINIMAL_EVENT);
    bad.id = 'not-a-ulid';
    expect(validate(bad)).toBe(false);
  });

  it('rejects additional top-level properties', () => {
    const bad = { ...MINIMAL_EVENT, extraField: 'not allowed' };
    expect(validate(bad)).toBe(false);
  });

  it('rejects rail-add with empty body', () => {
    const bad = structuredClone(MINIMAL_EVENT);
    bad.kind = 'rail-add';
    bad.data = { body: '', targetId: 'btn-save' };
    expect(validate(bad)).toBe(false);
  });
});

describe('WIRE-PROTOCOL.md (drift guard against the spec markdown)', () => {
  const wireDoc = readFileSync(resolve(here, '../docs/WIRE-PROTOCOL.md'), 'utf8');

  it('declares protocol version 2 in prose and in the route table', () => {
    expect(wireDoc).toContain('Protocol version: **2**');
    expect(wireDoc).toMatch(/protocol:\s*2\b/);
  });

  it('names the six kinds consistently', () => {
    for (const kind of ['click', 'input', 'submit', 'rail-add', 'rail-resolve', 'custom']) {
      expect(wireDoc).toContain(kind);
    }
  });
});
