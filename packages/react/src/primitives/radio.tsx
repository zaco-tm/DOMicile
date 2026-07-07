// packages/react/src/primitives/radio.tsx
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export interface DomRadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> {
  className?: string;
}

export const DomRadio = forwardRef<HTMLInputElement, DomRadioProps>(
  function DomRadio({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="radio"
        className={cn('domi-radio', className)}
        {...rest}
      />
    );
  }
);

DomRadio.displayName = 'DomRadio';
