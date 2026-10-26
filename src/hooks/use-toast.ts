import type { ReactNode } from "react";
import { toast as sonner } from "sonner";

/**
 * One toast system. The app used to ship both Radix Toast and Sonner; every
 * `toast({ title, description, variant })` call now renders through Sonner,
 * so Radix Toast (and its 1,000-second removal delay) is gone from the bundle.
 */
export type ToastInput = {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive";
  duration?: number;
  action?: { label: string; onClick: () => void };
};

function toast({ title, description, variant, duration, action }: ToastInput) {
  const message = title ?? description ?? "";
  const options = {
    description: title ? description : undefined,
    duration: duration ?? (variant === "destructive" ? 6000 : 3200),
    action,
  };
  const id = variant === "destructive" ? sonner.error(message, options) : sonner(message, options);
  return {
    id: String(id),
    dismiss: () => sonner.dismiss(id),
    update: (next: ToastInput) => toast({ ...next }),
  };
}

function useToast() {
  return {
    toast,
    dismiss: (id?: string | number) => sonner.dismiss(id),
    toasts: [] as never[],
  };
}

export { useToast, toast };
