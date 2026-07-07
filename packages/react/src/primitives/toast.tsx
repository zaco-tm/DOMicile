// packages/react/src/primitives/toast.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface DomToastProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  className?: string;
  children?: ReactNode;
}

export const DomToast = forwardRef<HTMLDivElement, DomToastProps>(
  function DomToast({ className, children, ...rest }, ref) {
    return (
      <div ref={ref} className={cn('domi-toast', className)} {...rest}>
        {children}
      </div>
    );
  }
);

DomToast.displayName = 'DomToast';
