// packages/react/src/primitives/input.tsx
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export type DomInputSize = 'sm' | 'lg';

export interface DomInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size'> {
  size?: DomInputSize;
  error?: boolean;
  className?: string;
}

export const DomInput = forwardRef<HTMLInputElement, DomInputProps>(
  function DomInput({ size = 'lg', error = false, className, ...rest }, ref) {
    const classes = cn(
      'domi-input',
      size && `domi-input--${size}`,
      error && 'domi-input--error',
      className
    );
    return <input ref={ref} className={classes} {...rest} />;
  }
);

DomInput.displayName = 'DomInput';
