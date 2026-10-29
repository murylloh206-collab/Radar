import React from 'react';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'cyan';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function StatusBadge({
  label,
  variant = 'neutral',
  size = 'md',
  dot = true,
}: StatusBadgeProps) {
  const variantStyles: Record<BadgeVariant, { bg: string; text: string; dotColor: string; border: string }> = {
    success: {
      bg: 'bg-[#20C997]/15',
      text: 'text-[#20C997]',
      dotColor: 'bg-[#20C997]',
      border: 'border-[#20C997]/30',
    },
    warning: {
      bg: 'bg-[#F7B84B]/15',
      text: 'text-[#F7B84B]',
      dotColor: 'bg-[#F7B84B]',
      border: 'border-[#F7B84B]/30',
    },
    danger: {
      bg: 'bg-[#F87171]/15',
      text: 'text-[#F87171]',
      dotColor: 'bg-[#F87171]',
      border: 'border-[#F87171]/30',
    },
    cyan: {
      bg: 'bg-[#1CCAF2]/15',
      text: 'text-[#1CCAF2]',
      dotColor: 'bg-[#1CCAF2]',
      border: 'border-[#1CCAF2]/30',
    },
    info: {
      bg: 'bg-[#0879DF]/15',
      text: 'text-[#60A5FA]',
      dotColor: 'bg-[#0879DF]',
      border: 'border-[#0879DF]/30',
    },
    neutral: {
      bg: 'bg-[#18334D]/40',
      text: 'text-[#8EADC7]',
      dotColor: 'bg-[#8EADC7]',
      border: 'border-[#18334D]',
    },
  };

  const current = variantStyles[variant];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${current.bg} ${current.text} ${current.border} ${sizeClasses} select-none`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${current.dotColor}`} />}
      {label}
    </span>
  );
}
