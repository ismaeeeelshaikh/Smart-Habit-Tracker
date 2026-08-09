import React from 'react';
import { cn } from '../../utils/cn';

export type PriorityLevel = 'high' | 'medium' | 'low';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  priority: PriorityLevel;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ priority, className, ...props }, ref) => {
    
    const priorityStyles = {
      high: "text-[var(--color-priority-high)] bg-[var(--color-priority-high)]/15",
      medium: "text-[var(--color-priority-medium)] bg-[var(--color-priority-medium)]/15",
      low: "text-[var(--color-priority-low)] bg-[var(--color-priority-low)]/15"
    };

    const labels = {
      high: 'High',
      medium: 'Medium',
      low: 'Low'
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center px-[10px] py-[4px] rounded-full font-inter font-medium text-[12px] leading-none",
          priorityStyles[priority],
          className
        )}
        {...props}
      >
        {labels[priority]}
      </span>
    );
  }
);
Badge.displayName = 'Badge';
