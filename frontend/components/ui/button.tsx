import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-primary-foreground shadow hover:bg-primary/90',
                destructive:
                    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
                outline:
                    'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
                secondary:
                    'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
                ghost: 'hover:bg-accent hover:text-accent-foreground',
                link: 'text-primary underline-offset-4 hover:underline',
                // Filled teal action inside a pipeline node, e.g. "Preview" and "Start labeling"
                nodeAction:
                    'font-normal text-white bg-[#2E7B75] border border-[#2E7B75] rounded-md hover:bg-[#256560] focus-visible:ring-2 focus-visible:ring-[#2E7B75] focus-visible:ring-offset-2',
                // Outlined counterpart of nodeAction for an active toggle, e.g. "Stop labeling"
                nodeActionOutline:
                    'font-normal text-[#2E7B75] bg-white border border-[#2E7B75] rounded-md hover:bg-[#EAF1F0] focus-visible:ring-2 focus-visible:ring-[#2E7B75] focus-visible:ring-offset-2',
                // Filled teal "Continue" action on the login/signup screens
                auth: 'font-medium font-ibmplex text-[16px] text-white bg-[#0d585f] border border-[#0d585f] rounded-[10px] hover:bg-[#0a464b] focus-visible:ring-2 focus-visible:ring-[#0d585f] focus-visible:ring-offset-2',
            },
            size: {
                default: 'h-9 px-4 py-2',
                sm: 'h-8 rounded-md px-3 text-xs',
                lg: 'h-10 rounded-md px-8',
                icon: 'h-9 w-9',
                //size used for nodeAction in preview
                node: 'h-auto px-3 py-1 gap-1.5 text-[16px] leading-none',
                // full-width pill used by the auth variant
                auth: 'h-[37px] w-full rounded-[10px] px-[24px] py-[12px]',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
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
    }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
