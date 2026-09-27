import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Same voice as the radix toast: a dark sheet, one hairline, thin type.
 * Icons are hidden so a success or an error is a sentence, not a colour.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{ success: null, info: null, warning: null, error: null, loading: null }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover/95 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-foreground/10 group-[.toaster]:rounded-md group-[.toaster]:shadow-none group-[.toaster]:font-light",
          title: "group-[.toast]:text-[14px] group-[.toast]:font-light",
          description: "group-[.toast]:text-[13px] group-[.toast]:font-light group-[.toast]:text-foreground/60",
          actionButton:
            "group-[.toast]:bg-transparent group-[.toast]:border group-[.toast]:border-foreground/15 group-[.toast]:text-foreground group-[.toast]:font-light group-[.toast]:rounded-md",
          cancelButton:
            "group-[.toast]:bg-transparent group-[.toast]:text-foreground/50 group-[.toast]:font-light group-[.toast]:rounded-md",
          error: "group-[.toaster]:text-destructive",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
