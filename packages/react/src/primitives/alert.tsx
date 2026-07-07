// packages/react/src/primitives/alert.tsx
import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export type DomAlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface DomAlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  variant?: DomAlertVariant;
  className?: string;
  children?: ReactNode;
  as?: 'div' | 'span';
}

export const DomAlert = forwardRef<HTMLDivElement | HTMLSpanElement, DomAlertProps>(
  function DomAlert(
    { variant = 'info', className, children, as = 'div', ...rest },
    ref
  ) {
    const classes = cn(
      'domi-alert',
      variant && `domi-alert--${variant}`,
      className
    );
    if (as === 'span') {
      return (
        <span ref={ref as Ref<HTMLSpanElement>} className={classes} {...rest}>
          {children}
        </span>
      );
    }
    return (
      <div ref={ref as Ref<HTMLDivElement>} className={classes} {...rest}>
        {children}
      </div>
    );
  }
);

DomAlert.displayName = 'DomAlert';
