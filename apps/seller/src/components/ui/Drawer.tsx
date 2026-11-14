import { useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { Button } from './Button';
import { useDialogFocus } from './useDialogFocus';
import { usePortalVisibility } from './PortalVisibilityContext';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  visuallyHiddenTitle?: boolean;
}

export function Drawer({ children, className, description, onClose, open, title, visuallyHiddenTitle = false }: DrawerProps) {
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45" onMouseDown={closeFromBackdrop}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn('h-full w-full max-w-lg overflow-y-auto bg-pure-white p-6 shadow-artifact outline-none', className)}
      >
        <header className="flex items-start justify-between gap-4 border-b border-outline-variant/60 pb-4">
          <div>
            <h2 id={titleId} className={cn(visuallyHiddenTitle && 'sr-only', 'font-display text-xl font-bold text-on-surface')}>{title}</h2>
            {description ? <p id={descriptionId} className="mt-2 font-body text-body-sm text-on-surface-variant">{description}</p> : null}
          </div>
          <Button variant="ghost" size="sm" aria-label="Đóng ngăn thông tin" onClick={onClose} className="-mr-2 -mt-2 px-2">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </Button>
        </header>
        <div className="mt-5">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
