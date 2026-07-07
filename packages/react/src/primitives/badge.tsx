// packages/react/src/primitives/badge.tsx
import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export type DomBadgeVariant = 'primary' | 'success' | 'warning' | 'danger';

export interface DomBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'className'> {
  variant?: DomBadgeVariant;
  className?: string;
  children?: ReactNode;
  as?: 'span' | 'a';
}

export const DomBadge = forwardRef<HTMLSpanElement | HTMLAnchorElement, DomBadgeProps>(
  function DomBadge(
    { variant = 'primary', className, children, as = 'span', ...rest },
    ref
  ) {
    const classes = cn(
      'domi-badge',
      variant && `domi-badge--${variant}`,
      className
    );
    if (as === 'a') {
      return (
        <a
          ref={ref as Ref<HTMLAnchorElement>}
          className={classes}
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {children}
        </a>
      );
    }
    return (
      <span ref={ref as Ref<HTMLSpanElement>} className={classes} {...rest}>
        {children}
      </span>
    );
  }
);

DomBadge.displayName = 'DomBadge';
