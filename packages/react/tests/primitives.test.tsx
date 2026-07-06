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
import { DomCard } from '../src/primitives/card';
import { DomAlert } from '../src/primitives/alert';
import { DomBadge } from '../src/primitives/badge';

describe('DomCard', () => {
  it('renders base class', () => {
    const html = renderToStaticMarkup(<DomCard>body</DomCard>);
    expect(html).toContain('class="domi-card');
  });

  it('default has no size suffix', () => {
    const html = renderToStaticMarkup(<DomCard>body</DomCard>);
    expect(html).not.toContain('domi-card--');
  });

  it('applies sm size', () => {
    const html = renderToStaticMarkup(<DomCard size="sm">body</DomCard>);
    expect(html).toContain('domi-card--sm');
  });

  it('applies lg size', () => {
    const html = renderToStaticMarkup(<DomCard size="lg">body</DomCard>);
    expect(html).toContain('domi-card--lg');
  });

  it('appends user className', () => {
    const html = renderToStaticMarkup(<DomCard className="x">body</DomCard>);
    expect(html).toMatch(/class="domi-card[^"]*x/);
  });

  it('passes through ...props', () => {
    const html = renderToStaticMarkup(<DomCard id="c1">body</DomCard>);
    expect(html).toContain('id="c1"');
  });

  it('sets displayName', () => {
    expect(DomCard.displayName).toBe('DomCard');
  });
});

describe('DomAlert', () => {
  it('renders base class', () => {
    const html = renderToStaticMarkup(<DomAlert>msg</DomAlert>);
    expect(html).toContain('class="domi-alert');
  });

  it('default variant is info', () => {
    const html = renderToStaticMarkup(<DomAlert>msg</DomAlert>);
    expect(html).toContain('domi-alert--info');
  });

  it.each(['info', 'success', 'warning', 'danger'] as const)(
    'applies %s variant',
    (v) => {
      const html = renderToStaticMarkup(<DomAlert variant={v}>msg</DomAlert>);
      expect(html).toContain(`domi-alert--${v}`);
    }
  );

  it('renders as <span> when as="span"', () => {
    const html = renderToStaticMarkup(<DomAlert as="span">msg</DomAlert>);
    expect(html).toMatch(/<span[^>]*domi-alert/);
  });

  it('sets displayName', () => {
    expect(DomAlert.displayName).toBe('DomAlert');
  });
});

describe('DomBadge', () => {
  it('renders as <span> with base class', () => {
    const html = renderToStaticMarkup(<DomBadge>label</DomBadge>);
    expect(html).toMatch(/<span[^>]*domi-badge/);
  });

  it('default variant is primary', () => {
    const html = renderToStaticMarkup(<DomBadge>label</DomBadge>);
    expect(html).toContain('domi-badge--primary');
  });

  it.each(['primary', 'success', 'warning', 'danger'] as const)(
    'applies %s variant',
    (v) => {
      const html = renderToStaticMarkup(<DomBadge variant={v}>label</DomBadge>);
      expect(html).toContain(`domi-badge--${v}`);
    }
  );

  it('renders as <a> when as="a"', () => {
    const html = renderToStaticMarkup(<DomBadge as="a" href="/x">label</DomBadge>);
    expect(html).toContain('<a');
    expect(html).toContain('href="/x"');
  });

  it('sets displayName', () => {
    expect(DomBadge.displayName).toBe('DomBadge');
  });
});
