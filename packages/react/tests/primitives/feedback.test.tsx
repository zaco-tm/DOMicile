// Tabs, modal, toast, tooltip: user-feedback primitives. All of these
// use the existing native semantics (`<dialog>`, `data-tooltip`, etc.)
// and a `domi-*` class for styling.

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { DomTabs } from '../../src/primitives/tabs';
import { DomModal } from '../../src/primitives/modal';
import { DomToast } from '../../src/primitives/toast';
import { DomTooltip } from '../../src/primitives/tooltip';

describe('DomTabs', () => {
  it('renders <div> with base class', () => {
    const html = renderToStaticMarkup(
      <DomTabs><div role="tablist">tab</div></DomTabs>
    );
    expect(html).toContain('domi-tabs');
  });

  it('sets displayName', () => {
    expect(DomTabs.displayName).toBe('DomTabs');
  });
});

describe('DomModal', () => {
  it('renders <dialog> with base class', () => {
    const html = renderToStaticMarkup(
      <DomModal><div>body</div></DomModal>
    );
    expect(html).toContain('<dialog');
    expect(html).toContain('domi-modal');
  });

  it('passes open via ...props', () => {
    const html = renderToStaticMarkup(
      <DomModal open><div>body</div></DomModal>
    );
    expect(html).toMatch(/<dialog[^>]*open/);
  });

  it('sets displayName', () => {
    expect(DomModal.displayName).toBe('DomModal');
  });
});

describe('DomToast', () => {
  it('renders <div> with base class', () => {
    const html = renderToStaticMarkup(<DomToast>msg</DomToast>);
    expect(html).toContain('<div');
    expect(html).toContain('domi-toast');
  });

  it('sets displayName', () => {
    expect(DomToast.displayName).toBe('DomToast');
  });
});

describe('DomTooltip', () => {
  it('renders <span> with base class and data-tooltip attr', () => {
    const html = renderToStaticMarkup(
      <DomTooltip content="hint">trigger</DomTooltip>
    );
    expect(html).toContain('<span');
    expect(html).toContain('domi-tooltip');
    expect(html).toContain('data-tooltip="hint"');
  });

  it('sets displayName', () => {
    expect(DomTooltip.displayName).toBe('DomTooltip');
  });
});
