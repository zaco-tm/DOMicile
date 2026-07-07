// packages/react/src/primitives/select.tsx
import { forwardRef } from 'react';
import type { SelectHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export type DomSelectSize = 'sm' | 'lg';

export interface DomSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'size'> {
  size?: DomSelectSize;
  error?: boolean;
  className?: string;
  children?: ReactNode;
}

export const DomSelect = forwardRef<HTMLSelectElement, DomSelectProps>(
  function DomSelect(
    { size = 'lg', error = false, className, children, ...rest },
    ref
  ) {
    const classes = cn(
      'domi-select',
      size && `domi-select--${size}`,
      error && 'domi-select--error',
      className
    );
    return (
      <select ref={ref} className={classes} {...rest}>
        {children}
      </select>
    );
  }
);

DomSelect.displayName = 'DomSelect';
