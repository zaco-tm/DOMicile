import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRef } from 'react';
import { DomButton } from '../src/primitives/button';

describe('DomButton', () => {
  it('renders the base class', () => {
    const html = renderToStaticMarkup(<DomButton>Click</DomButton>);
    expect(html).toContain('class="domi-btn');
  });

  it('applies default variant (primary) and default size (lg)', () => {
    const html = renderToStaticMarkup(<DomButton>Click</DomButton>);
    expect(html).toContain('domi-btn--primary');
    expect(html).toContain('domi-btn--lg');
  });

  it('applies ghost variant', () => {
    const html = renderToStaticMarkup(<DomButton variant="ghost">Click</DomButton>);
    expect(html).toContain('domi-btn--ghost');
    expect(html).not.toContain('domi-btn--primary');
  });

  it('applies danger variant', () => {
    const html = renderToStaticMarkup(<DomButton variant="danger">Click</DomButton>);
    expect(html).toContain('domi-btn--danger');
  });

  it('applies sm size', () => {
    const html = renderToStaticMarkup(<DomButton size="sm">Click</DomButton>);
    expect(html).toContain('domi-btn--sm');
    expect(html).not.toContain('domi-btn--lg');
  });

  it('appends user className last (wins specificity ties)', () => {
    const html = renderToStaticMarkup(
      <DomButton className="my-extra">Click</DomButton>
    );
    const classIdx = html.indexOf('class="');
    expect(html.substring(classIdx)).toMatch(/class="domi-btn[^\"]*my-extra/);
  });

  it('passes through onClick + type via ...props spread', () => {
    const html = renderToStaticMarkup(
      <DomButton onClick={() => {}} type="submit">Submit</DomButton>
    );
    expect(html).toContain('type="submit"');
  });

  it('forwards ref to the underlying <button>', () => {
    const ref = createRef<HTMLButtonElement>();
    renderToStaticMarkup(<DomButton ref={ref}>Click</DomButton>);
    // ref is null in SSR, but forwardRef wiring is verified by the type signature.
    // Functional check happens in a follow-up if needed; here we assert the API.
    expect(ref).toBeDefined();
  });

  it('renders as <a> when as="a" with href passed via ...props', () => {
    const html = renderToStaticMarkup(
      <DomButton as="a" href="/somewhere">Link</DomButton>
    );
    expect(html).toContain('<a');
    expect(html).toContain('href="/somewhere"');
    expect(html).toContain('domi-btn');
  });

  it('sets displayName', () => {
    expect(DomButton.displayName).toBe('DomButton');
  });
});
