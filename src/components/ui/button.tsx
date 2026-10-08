import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "default" | "sm"; asChild?: boolean };
export function Button({ className, variant = "primary", size = "default", asChild, ...props }: Props) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
    variant === "primary" && "bg-primary text-primary-foreground hover:brightness-90",
    variant === "secondary" && "border border-border bg-secondary text-secondary-foreground hover:bg-accent",
    variant === "ghost" && "text-foreground hover:bg-muted",
    variant === "danger" && "border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground",
    size === "sm" && "min-h-10 px-3", className)} {...props} />;
}
