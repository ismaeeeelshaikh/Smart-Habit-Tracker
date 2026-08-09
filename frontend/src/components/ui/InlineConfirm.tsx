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
          className="text-[var(--color-ink)] hover:underline font-medium"
        >
          {cancelLabel}
        </button>
      </div>
    );
  }

  return (
    <div onClick={() => setIsConfirming(true)} className="inline-block cursor-pointer">
      {children}
    </div>
  );
};
