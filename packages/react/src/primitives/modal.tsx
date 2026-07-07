// packages/react/src/primitives/modal.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface DomModalProps
  extends Omit<HTMLAttributes<HTMLDialogElement>, 'className' | 'open'> {
  open?: boolean;
  className?: string;
  children?: ReactNode;
}

export const DomModal = forwardRef<HTMLDialogElement, DomModalProps>(
  function DomModal({ open = false, className, children, ...rest }, ref) {
    return (
      <dialog ref={ref} className={cn('domi-modal', className)} open={open} {...rest}>
        {children}
      </dialog>
    );
  }
);

DomModal.displayName = 'DomModal';
