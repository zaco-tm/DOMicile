// packages/react/src/primitives/table.tsx
import { forwardRef } from 'react';
import type { TableHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface DomTableProps
  extends Omit<TableHTMLAttributes<HTMLTableElement>, 'className'> {
  className?: string;
  children?: ReactNode;
}

export const DomTable = forwardRef<HTMLTableElement, DomTableProps>(
  function DomTable({ className, children, ...rest }, ref) {
    return (
      <table ref={ref} className={cn('domi-table', className)} {...rest}>
        {children}
      </table>
    );
  }
);

DomTable.displayName = 'DomTable';
