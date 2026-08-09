import React from 'react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  actionLabel,
  onAction,
  className
}) => {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center p-8", className)}>
      <p className="text-[var(--color-ink-muted)] text-[13px] font-inter mb-4">
        {message}
      </p>
      {actionLabel && onAction && (
        <Button variant="secondary" onClick={onAction} className="border-none bg-transparent text-[var(--color-free)] hover:bg-[var(--color-free-tint)]">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
