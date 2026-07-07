// packages/react/src/primitives/card.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export type DomCardSize = 'sm' | 'lg';

export interface DomCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  size?: DomCardSize;
  className?: string;
  children?: ReactNode;
}

export const DomCard = forwardRef<HTMLDivElement, DomCardProps>(
  function DomCard({ size, className, children, ...rest }, ref) {
    const classes = cn(
      'domi-card',
      size && `domi-card--${size}`,
      className
    );
    return (
      <div ref={ref} className={classes} {...rest}>
        {children}
      </div>
    );
  }
);

DomCard.displayName = 'DomCard';
