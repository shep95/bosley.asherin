import * as React from "react";

import { cn } from "@/lib/utils";

/** A field is a hairline underneath, nothing around. Focus darkens the line. */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "field flex h-10 w-full text-[15px] font-light text-foreground placeholder:text-foreground/35 file:border-0 file:bg-transparent file:text-[13px] file:font-light file:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
