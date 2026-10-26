import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Buttons are thin words with a little room around them. One accent
 * (`signal`) for the commitment of a page; everything else is quiet.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[14px] font-light ring-offset-background transition-[transform,filter,background-color,color,box-shadow] duration-200 ease-soft active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 disabled:saturate-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-foreground/90",
        destructive: "bg-transparent text-destructive hover:bg-destructive/10",
        outline: "border border-foreground/15 bg-transparent text-foreground hover:bg-foreground/[0.04]",
        secondary: "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1]",
        ghost: "text-foreground/70 hover:text-foreground hover:bg-foreground/[0.05]",
        link: "text-foreground underline-offset-4 hover:underline",
        /* High-commitment action: gold as a metal, lit from above. */
        signal: "btn-gold font-medium tracking-[-0.005em]",
        /* Kept for callers; reads as a quiet outline now. */
        glass: "border border-foreground/15 bg-transparent text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04]",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
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
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
