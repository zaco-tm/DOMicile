// packages/react/src/primitives/button.tsx
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export type DomButtonVariant = 'primary' | 'ghost' | 'danger';
export type DomButtonSize = 'sm' | 'lg';

export interface DomButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: DomButtonVariant;
  size?: DomButtonSize;
  className?: string;
  children?: ReactNode;
  as?: 'button' | 'a';
}

export const DomButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  DomButtonProps
>(function DomButton(
  {
    variant = 'primary',
    size = 'lg',
    className,
    children,
    as = 'button',
    ...rest
  },
  ref
) {
  const classes = cn(
    'domi-btn',
    variant && `domi-btn--${variant}`,
    size && `domi-btn--${size}`,
    className
  );

  if (as === 'a') {
    return (
      <a ref={ref as Ref<HTMLAnchorElement>} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button ref={ref as Ref<HTMLButtonElement>} className={classes} {...rest}>
      {children}
    </button>
  );
});

DomButton.displayName = 'DomButton';
