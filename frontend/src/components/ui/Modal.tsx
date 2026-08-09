import React, { useEffect, useRef } from 'react';
import { cn } from '../../utils/cn';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children,
  className 
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scrolling when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  return (
    <div 
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div 
        className={cn(
          "bg-[var(--color-surface)] w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-[10px] sm:rounded-[10px] shadow-xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-200",
          className
        )}
      >
        {(title !== undefined || onClose !== undefined) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-surface)] z-10">
            {title ? (
              <h2 className="font-display font-semibold text-[18px] text-[var(--color-ink)]">{title}</h2>
            ) : <div />}
            <button 
              onClick={onClose}
              className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors focus:outline-none p-1"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};
