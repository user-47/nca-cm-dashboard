import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded font-medium " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-55 " +
  "whitespace-nowrap";

/** Brass is reserved for the one primary action on a screen. */
const variants: Record<Variant, string> = {
  primary: "bg-brass text-white hover:bg-brass-hi active:bg-brass",
  secondary:
    "bg-surface text-ink border border-[var(--line-strong)] hover:bg-paper active:bg-paper",
  quiet: "text-ink-muted hover:text-ink hover:bg-[rgba(27,36,48,0.05)]",
  danger: "bg-error text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-base",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  )
);
Button.displayName = "Button";
