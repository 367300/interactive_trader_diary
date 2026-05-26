import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-[10px] border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-y focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/15 disabled:cursor-not-allowed disabled:opacity-55',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
