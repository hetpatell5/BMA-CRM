'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.25)] hover:bg-primary/90 hover:shadow-[0_2px_8px_hsl(var(--primary)/0.35)]',
                destructive:
                    'bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90',
                outline:
                    'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
                secondary:
                    'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                ghost:
                    'hover:bg-accent hover:text-accent-foreground',
                link:
                    'text-primary underline-offset-4 hover:underline',
                // Real two-stop gradient on primary hue — use for single most-important CTA per page
                gradient:
                    'gradient-primary text-white shadow-[0_2px_12px_hsl(var(--primary)/0.30)] hover:opacity-90 hover:shadow-[0_4px_20px_hsl(var(--primary)/0.45)] active:scale-[0.98]',
                success:
                    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15',
            },
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-9 rounded-md px-3 text-xs',
                lg: 'h-11 rounded-lg px-8',
                icon: 'h-10 w-10',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button'
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
