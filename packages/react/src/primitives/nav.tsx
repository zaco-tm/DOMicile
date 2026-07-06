// packages/react/src/primitives/nav.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface DomNavProps
  extends Omit<HTMLAttributes<HTMLElement>, 'className'> {
  className?: string;
  children?: ReactNode;
}

export const DomNav = forwardRef<HTMLElement, DomNavProps>(
  function DomNav({ className, children, ...rest }, ref) {
    return (
      <nav ref={ref} className={cn('domi-nav', className)} {...rest}>
        {children}
      </nav>
    );
  }
);

DomNav.displayName = 'DomNav';
