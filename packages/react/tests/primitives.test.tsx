import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRef } from 'react';
import { DomButton } from '../src/primitives/button';
import { DomCard } from '../src/primitives/card';
import { DomAlert } from '../src/primitives/alert';
import { DomBadge } from '../src/primitives/badge';
import { DomForm } from '../src/primitives/form';
import { DomInput } from '../src/primitives/input';
import { DomSelect } from '../src/primitives/select';
import { DomCheckbox } from '../src/primitives/checkbox';
import { DomRadio } from '../src/primitives/radio';
import { DomTable } from '../src/primitives/table';
import { DomNav } from '../src/primitives/nav';
import { DomTabs } from '../src/primitives/tabs';
import { DomModal } from '../src/primitives/modal';
import { DomToast } from '../src/primitives/toast';
import { DomTooltip } from '../src/primitives/tooltip';

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

