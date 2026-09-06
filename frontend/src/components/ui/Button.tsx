import React from 'react';
import { cn } from '../../utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'destructive';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', isLoading, children, disabled, ...props }, ref) => {
    
    // focus-visible rather than focus: a ring on every mouse click is noise, but
    // a keyboard user with no ring at all is lost. min-h-[44px] is the Design
    // Brief's tap-target floor; touch-manipulation drops the 300ms double-tap
    // delay on mobile.
    const baseStyles = "inline-flex items-center justify-center min-h-[44px] touch-manipulation transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-[var(--color-border)] disabled:text-[var(--color-ink-muted)] disabled:border-transparent font-inter font-medium";
    
    const variants = {
      primary: "bg-[var(--color-free)] text-white rounded-[10px] px-[20px] py-[12px] hover:brightness-90 focus-visible:ring-[var(--color-free)]",
      secondary: "bg-transparent border border-[var(--color-border)] text-[var(--color-ink)] rounded-[10px] px-[20px] py-[12px] hover:bg-gray-50 focus-visible:ring-[var(--color-ink)]",
      destructive: "bg-transparent text-[var(--color-error)] hover:underline focus-visible:ring-[var(--color-error)] rounded-[8px] px-3 py-2"
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], className)}
        {...props}
      >
        {isLoading ? (
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
