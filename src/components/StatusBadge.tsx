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
      bg: 'bg-[#5fd0a0]/15',
      text: 'text-[#5fd0a0]',
      dotColor: 'bg-[#5fd0a0]',
      border: 'border-[#5fd0a0]/30',
    },
    warning: {
      bg: 'bg-[#e8b65c]/15',
      text: 'text-[#e8b65c]',
      dotColor: 'bg-[#e8b65c]',
      border: 'border-[#e8b65c]/30',
    },
    danger: {
      bg: 'bg-[#f07878]/15',
      text: 'text-[#f07878]',
      dotColor: 'bg-[#f07878]',
      border: 'border-[#f07878]/30',
    },
    cyan: {
      bg: 'bg-[#f5c542]/15',
      text: 'text-[#f5c542]',
      dotColor: 'bg-[#f5c542]',
      border: 'border-[#f5c542]/30',
    },
    info: {
      bg: 'bg-[#d9a520]/15',
      text: 'text-[#fad160]',
      dotColor: 'bg-[#d9a520]',
      border: 'border-[#d9a520]/30',
    },
    neutral: {
      bg: 'bg-[#2c2c2c]/40',
      text: 'text-[#a8a39a]',
      dotColor: 'bg-[#a8a39a]',
      border: 'border-[#2c2c2c]',
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
