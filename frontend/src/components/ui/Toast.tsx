import React, { useEffect } from 'react';
import { cn } from '../../utils/cn';
import { X } from 'lucide-react';

export type ToastType = 'success' | 'error';

interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
  durationMs?: number;
}

export const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'success', 
  onClose,
  durationMs = 4000 
}) => {
  useEffect(() => {
    if (durationMs > 0) {
      const timer = setTimeout(onClose, durationMs);
      return () => clearTimeout(timer);
    }
  }, [durationMs, onClose]);

  const typeStyles = {
    success: "bg-[var(--color-free-tint)] border-l-4 border-l-[var(--color-free)]",
    error: "bg-red-50 border-l-4 border-l-[var(--color-error)]"
  };

  return (
    <div 
      className={cn(
        "fixed bottom-4 sm:bottom-auto sm:top-20 right-4 sm:right-6 min-w-[300px] max-w-sm rounded-[8px] shadow-md p-4 flex items-start justify-between z-50",
        "animate-in slide-in-from-bottom-5 sm:slide-in-from-top-5 fade-in duration-300",
        typeStyles[type]
      )}
      role="alert"
    >
      <p className="text-[14px] font-inter text-[var(--color-ink)] mr-4">{message}</p>
      <button 
        onClick={onClose} 
        className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors focus:outline-none"
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
