import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'border border-border-strong bg-glass text-foreground hover:bg-glass-strong',
        primary:
          'bg-gradient-to-br from-blue to-purple border-0 text-white hover:brightness-110',
        destructive:
          'bg-red/15 border border-red/40 text-red hover:bg-red/25',
        ghost: 'bg-transparent border border-transparent text-foreground hover:bg-glass-soft',
        link: 'text-cyan underline-offset-4 hover:underline border-0 bg-transparent',
      },
      size: {
        default: 'px-4 py-2.5',
        sm: 'px-2.5 py-1.5 text-[13px]',
        lg: 'px-6 py-3',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
