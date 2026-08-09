import React from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="flex flex-col space-y-1 w-full">
        <input
          ref={ref}
          className={cn(
            "w-full bg-white border border-[var(--color-border)] rounded-[8px] px-[12px] py-[10px] text-[var(--color-ink)] font-inter text-[15px]",
            "placeholder-[var(--color-ink-muted)] outline-none transition-all",
            "focus:border-[var(--color-free)] focus:border-2 focus:ring-[3px] focus:ring-[var(--color-free-tint)]",
            error && "border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-red-100",
            className
          )}
          {...props}
        />
        {error && (
          <span className="text-[var(--color-error)] text-[13px] font-inter">
            {error}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
