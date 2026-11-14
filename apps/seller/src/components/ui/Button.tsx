import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-carbon text-pure-white shadow-button-inset hover:bg-charcoal disabled:hover:bg-carbon',
  secondary: 'bg-pure-white text-on-surface shadow-button-outline hover:bg-surface-container-low',
  ghost: 'bg-transparent text-on-surface hover:bg-surface-container-low',
  danger: 'bg-error text-white hover:bg-on-error-container',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-xs',
  md: 'min-h-10 px-4 text-sm',
  lg: 'min-h-12 px-5 text-sm',
};

export function Button({
  children,
  className,
  disabled,
  leadingIcon,
  loading = false,
  loadingLabel = 'Đang xử lý…',
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control font-body font-semibold transition-[background-color,color,box-shadow,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" /> : leadingIcon}
      {loading ? loadingLabel : children}
    </button>
  );
}
