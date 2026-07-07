// packages/react/src/primitives/tabs.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface DomTabsProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  className?: string;
  children?: ReactNode;
}

export const DomTabs = forwardRef<HTMLDivElement, DomTabsProps>(
  function DomTabs({ className, children, ...rest }, ref) {
    return (
      <div ref={ref} className={cn('domi-tabs', className)} {...rest}>
        {children}
      </div>
    );
  }
);

DomTabs.displayName = 'DomTabs';
