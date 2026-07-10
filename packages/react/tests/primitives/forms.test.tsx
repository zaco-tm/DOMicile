// Form, input, select, checkbox, radio: form-control primitives with
// size + error variants and selection state.

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { DomForm } from '../../src/primitives/form';
import { DomInput } from '../../src/primitives/input';
import { DomSelect } from '../../src/primitives/select';
import { DomCheckbox } from '../../src/primitives/checkbox';
import { DomRadio } from '../../src/primitives/radio';

describe('DomForm', () => {
  it('renders <form> with base class', () => {
    const html = renderToStaticMarkup(<DomForm><input /></DomForm>);
    expect(html).toContain('<form');
    expect(html).toContain('domi-form');
  });

  it('passes through action/method via ...props', () => {
    const html = renderToStaticMarkup(
      <DomForm action="/submit" method="post"><input /></DomForm>
    );
    expect(html).toContain('action="/submit"');
    expect(html).toContain('method="post"');
  });

  it('sets displayName', () => {
    expect(DomForm.displayName).toBe('DomForm');
  });
});

describe('DomInput', () => {
  it('renders <input> with base class', () => {
    const html = renderToStaticMarkup(<DomInput />);
    expect(html).toMatch(/<input[^>]*class="domi-input/);
  });

  it('default size is lg', () => {
    const html = renderToStaticMarkup(<DomInput />);
    expect(html).toContain('domi-input--lg');
  });

  it('applies sm size', () => {
    const html = renderToStaticMarkup(<DomInput size="sm" />);
    expect(html).toContain('domi-input--sm');
  });

  it('applies error variant when invalid', () => {
    const html = renderToStaticMarkup(<DomInput error />);
    expect(html).toContain('domi-input--error');
  });

  it('passes type via ...props', () => {
    const html = renderToStaticMarkup(<DomInput type="email" />);
    expect(html).toContain('type="email"');
  });

  it('appends user className', () => {
    const html = renderToStaticMarkup(<DomInput className="x" />);
    expect(html).toMatch(/class="domi-input[^"]*x/);
  });

  it('sets displayName', () => {
    expect(DomInput.displayName).toBe('DomInput');
  });
});

describe('DomSelect', () => {
  it('renders <select> with base class', () => {
    const html = renderToStaticMarkup(
      <DomSelect><option>A</option></DomSelect>
    );
    expect(html).toContain('<select');
    expect(html).toContain('domi-select');
    expect(html).toContain('<option');
  });

  it('default size is lg', () => {
    const html = renderToStaticMarkup(
      <DomSelect><option>A</option></DomSelect>
    );
    expect(html).toContain('domi-select--lg');
  });

  it('applies sm size', () => {
    const html = renderToStaticMarkup(
      <DomSelect size="sm"><option>A</option></DomSelect>
    );
    expect(html).toContain('domi-select--sm');
  });

  it('applies error variant when invalid', () => {
    const html = renderToStaticMarkup(
      <DomSelect error><option>A</option></DomSelect>
    );
    expect(html).toContain('domi-select--error');
  });

  it('passes value via ...props (selects matching option)', () => {
    // React renders <select value="b"> by marking the matching <option selected>,
    // not by emitting value="b" on the <select> element itself.
    const html = renderToStaticMarkup(
      <DomSelect value="b" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </DomSelect>
    );
    expect(html).toMatch(/<option[^>]*value="b"[^>]*selected/);
  });

  it('sets displayName', () => {
    expect(DomSelect.displayName).toBe('DomSelect');
  });
});

describe('DomCheckbox', () => {
  it('renders <input type="checkbox"> with base class', () => {
    const html = renderToStaticMarkup(<DomCheckbox />);
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*class="domi-check/);
  });

  it('passes checked + onChange via ...props', () => {
    const html = renderToStaticMarkup(
      <DomCheckbox checked onChange={() => {}} />
    );
    expect(html).toMatch(/checked/);
  });

  it('appends user className', () => {
    const html = renderToStaticMarkup(<DomCheckbox className="x" />);
    expect(html).toMatch(/class="domi-check[^"]*x/);
  });

  it('sets displayName', () => {
    expect(DomCheckbox.displayName).toBe('DomCheckbox');
  });
});

describe('DomRadio', () => {
  it('renders <input type="radio"> with base class', () => {
    const html = renderToStaticMarkup(<DomRadio />);
    expect(html).toMatch(/<input[^>]*type="radio"[^>]*class="domi-radio/);
  });

  it('passes name + value via ...props', () => {
    const html = renderToStaticMarkup(<DomRadio name="r" value="a" />);
    expect(html).toContain('name="r"');
    expect(html).toContain('value="a"');
  });

  it('sets displayName', () => {
    expect(DomRadio.displayName).toBe('DomRadio');
  });
});
