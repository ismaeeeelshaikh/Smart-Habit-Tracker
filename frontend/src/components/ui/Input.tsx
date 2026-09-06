import React, { useId } from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col space-y-1 w-full">
        <input
          ref={ref}
          id={inputId}
          // Without these the error is visible but invisible to a screen reader:
          // nothing ties the message to the field it belongs to.
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "w-full bg-white border border-[var(--color-border)] rounded-[8px] px-[12px] py-[10px] text-[var(--color-ink)] font-inter text-[15px]",
            // transition-colors, not transition-all: naming the properties keeps this
            // off the compositor's slow path.
            "placeholder-[var(--color-ink-muted)] outline-none transition-colors",
            "focus:border-[var(--color-free)] focus:border-2 focus:ring-[3px] focus:ring-[var(--color-free-tint)]",
            error && "border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-red-100",
            className
          )}
          {...props}
        />
        {error && (
          <span
            id={errorId}
            role="alert"
            className="text-[var(--color-error)] text-[13px] font-inter"
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
