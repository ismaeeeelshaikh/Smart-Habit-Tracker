import React, { useEffect, useId, useRef } from 'react';
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
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;

    // Remember where focus came from so it can be handed back on close —
    // otherwise closing a dialog drops a keyboard user back at the top of the
    // page with no idea where they were.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Keep Tab inside the dialog; without this you tab straight out into the
      // page behind and can no longer see what you are focused on.
      const items = focusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    focusable()[0]?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-200 overscroll-contain"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        className={cn(
          "bg-[var(--color-surface)] w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-[10px] sm:rounded-[10px] shadow-xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-200",
          className
        )}
      >
        {(title !== undefined || onClose !== undefined) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-surface)] z-10">
            {title ? (
              <h2 id={titleId} className="font-display font-semibold text-[18px] text-[var(--color-ink)]">{title}</h2>
            ) : <div />}
            <button 
              onClick={onClose}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-[8px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" aria-hidden="true" />
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
