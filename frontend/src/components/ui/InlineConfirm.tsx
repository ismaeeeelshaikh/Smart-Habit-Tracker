import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

interface InlineConfirmProps {
  promptMessage: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  className?: string;
  children: React.ReactNode; // The trigger elements (e.g. edit/delete icons)
}

export const InlineConfirm: React.FC<InlineConfirmProps> = ({
  promptMessage,
  confirmLabel = 'Yes, remove',
  cancelLabel = 'Cancel',
  onConfirm,
  className,
  children
}) => {
  const [isConfirming, setIsConfirming] = useState(false);

  if (isConfirming) {
    return (
      <div className={cn("flex items-center space-x-3 text-[13px] font-inter animate-in fade-in slide-in-from-right-2 duration-200", className)}>
        <span className="text-[var(--color-ink-muted)]">{promptMessage}</span>
        <Button 
          variant="destructive" 
          onClick={onConfirm}
          className="p-0 h-auto font-medium"
        >
          {confirmLabel}
        </Button>
        <button
          onClick={() => setIsConfirming(false)}
          className="text-[var(--color-ink)] hover:underline font-medium rounded-[6px] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]"
        >
          {cancelLabel}
        </button>
      </div>
    );
  }

  // A button, not a div with onClick: this is the delete trigger, and as a div
  // it could not be reached or fired from a keyboard at all.
  return (
    <button
      type="button"
      onClick={() => setIsConfirming(true)}
      aria-label={promptMessage}
      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-[8px] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]"
    >
      {children}
    </button>
  );
};
