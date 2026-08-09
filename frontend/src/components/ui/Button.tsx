import React from 'react';
import { cn } from '../../utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'destructive';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', isLoading, children, disabled, ...props }, ref) => {
    
    const baseStyles = "inline-flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none disabled:bg-[var(--color-border)] disabled:text-[var(--color-ink-muted)] disabled:border-transparent font-inter font-medium";
    
    const variants = {
      primary: "bg-[var(--color-free)] text-white rounded-[10px] px-[20px] py-[12px] hover:brightness-90 focus:ring-[var(--color-free)]",
      secondary: "bg-transparent border border-[var(--color-border)] text-[var(--color-ink)] rounded-[10px] px-[20px] py-[12px] hover:bg-gray-50 focus:ring-[var(--color-ink)]",
      destructive: "bg-transparent text-[var(--color-error)] hover:underline focus:ring-[var(--color-error)] px-2 py-1"
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
