import { useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { Button } from './Button';
import { useDialogFocus } from './useDialogFocus';
import { usePortalVisibility } from './PortalVisibilityContext';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ children, className, description, footer, onClose, open, title }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const portalVisible = usePortalVisibility();
  useDialogFocus(open && portalVisible, onClose, panelRef);

  if (!open || !portalVisible) return null;

  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={closeFromBackdrop}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn('max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-card bg-pure-white p-6 shadow-artifact outline-none', className)}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-xl font-bold text-on-surface">{title}</h2>
            {description ? <p id={descriptionId} className="mt-2 font-body text-body-sm text-on-surface-variant">{description}</p> : null}
          </div>
          <Button variant="ghost" size="sm" aria-label="Đóng hộp thoại" onClick={onClose} className="-mr-2 -mt-2 px-2">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </Button>
        </header>
        <div className="mt-5">{children}</div>
        {footer ? <footer className="mt-6 flex flex-wrap justify-end gap-3 border-t border-outline-variant/60 pt-4">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
