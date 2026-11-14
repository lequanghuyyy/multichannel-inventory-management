import { useState } from 'react';
import { cn } from '../../../lib/cn';

export interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = 'Sao chép', className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Đã sao chép!' : `${label}: ${text}`}
      aria-label={copied ? 'Đã sao chép' : `${label} ${text}`}
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-control transition-colors text-graphite hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
        copied && 'text-emerald-600 dark:text-emerald-400',
        className,
      )}
    >
      <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
        {copied ? 'check' : 'content_copy'}
      </span>
    </button>
  );
}
