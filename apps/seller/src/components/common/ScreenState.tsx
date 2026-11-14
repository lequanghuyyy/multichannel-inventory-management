import { presentApiError } from '../../core/api-error';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';

interface StateShellProps {
  mark: string;
  title?: string;
  detail: string;
  tone?: 'default' | 'error';
  busy?: boolean;
  children?: React.ReactNode;
}

function StateShell({ busy = false, children, detail, mark, title, tone = 'default' }: StateShellProps) {
  return (
    <div
      className={cn('grid min-h-56 justify-items-start gap-2 rounded-card bg-surface-container-low p-8 font-body text-on-surface-variant', tone === 'error' ? 'border border-error/20 bg-error-container/30' : null)}
      aria-live={busy ? 'polite' : undefined}
      aria-busy={busy || undefined}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <span className={cn('grid size-9 place-items-center rounded-full bg-carbon text-pure-white', tone === 'error' ? 'bg-error' : null)} aria-hidden="true">{mark}</span>
      {title ? <h2 className="m-0 font-display text-xl font-bold text-on-surface">{title}</h2> : null}
      <p className="m-0 max-w-xl text-body-sm leading-5">{detail}</p>
      {children}
    </div>
  );
}

export function LoadingState({ label = 'Đang tải…' }: { label?: string }) {
  return <StateShell mark="◌" detail={label} busy />;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <StateShell mark="—" title={title} detail={detail} />;
}

export function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  const presentation = presentApiError(error);
  return (
    <StateShell mark="!" title={presentation.title} detail={presentation.detail} tone="error">
      {presentation.requestId ? <p className="m-0 text-caption">Mã yêu cầu: <code>{presentation.requestId}</code></p> : null}
      <Button variant="secondary" onClick={retry}>Thử lại</Button>
    </StateShell>
  );
}
