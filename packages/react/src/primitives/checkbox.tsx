// packages/react/src/primitives/checkbox.tsx
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export interface DomCheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> {
  className?: string;
}

export const DomCheckbox = forwardRef<HTMLInputElement, DomCheckboxProps>(
  function DomCheckbox({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn('domi-check', className)}
        {...rest}
      />
    );
  }
);

DomCheckbox.displayName = 'DomCheckbox';
