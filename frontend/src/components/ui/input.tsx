import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-[10px] border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/15 disabled:cursor-not-allowed disabled:opacity-55',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
