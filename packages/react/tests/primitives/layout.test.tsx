// Card, table, nav: page-layout primitives. Larger structural
// elements that compose children rather than capturing input.

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { DomCard } from '../../src/primitives/card';
import { DomTable } from '../../src/primitives/table';
import { DomNav } from '../../src/primitives/nav';

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

describe('DomTable', () => {
  it('renders <table> with base class', () => {
    const html = renderToStaticMarkup(
      <DomTable><thead><tr><th>x</th></tr></thead></DomTable>
    );
    expect(html).toContain('<table');
    expect(html).toContain('domi-table');
  });

  it('passes ...props', () => {
    const html = renderToStaticMarkup(
      <DomTable id="t1"><tbody /></DomTable>
    );
    expect(html).toContain('id="t1"');
  });

  it('sets displayName', () => {
    expect(DomTable.displayName).toBe('DomTable');
  });
});

describe('DomNav', () => {
  it('renders <nav> with base class', () => {
    const html = renderToStaticMarkup(
      <DomNav><a href="/">x</a></DomNav>
    );
    expect(html).toContain('<nav');
    expect(html).toContain('domi-nav');
  });

  it('appends user className', () => {
    const html = renderToStaticMarkup(<DomNav className="x" />);
    expect(html).toMatch(/class="domi-nav[^"]*x/);
  });

  it('sets displayName', () => {
    expect(DomNav.displayName).toBe('DomNav');
  });
});
