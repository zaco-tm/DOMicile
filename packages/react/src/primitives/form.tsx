// packages/react/src/primitives/form.tsx
import { forwardRef } from 'react';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface DomFormProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, 'className'> {
  className?: string;
  children?: ReactNode;
}

export const DomForm = forwardRef<HTMLFormElement, DomFormProps>(
  function DomForm({ className, children, ...rest }, ref) {
    return (
      <form ref={ref} className={cn('domi-form', className)} {...rest}>
        {children}
      </form>
    );
  }
);

DomForm.displayName = 'DomForm';
