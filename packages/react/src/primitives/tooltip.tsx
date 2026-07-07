// packages/react/src/primitives/tooltip.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface DomTooltipProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'className'> {
  /** Text shown in the tooltip on hover. Rendered as `data-tooltip` attribute. */
  content: string;
  className?: string;
  children?: ReactNode;
}

export const DomTooltip = forwardRef<HTMLSpanElement, DomTooltipProps>(
  function DomTooltip({ content, className, children, ...rest }, ref) {
    return (
      <span
        ref={ref}
        className={cn('domi-tooltip', className)}
        data-tooltip={content}
        {...rest}
      >
        {children}
      </span>
    );
  }
);

DomTooltip.displayName = 'DomTooltip';
