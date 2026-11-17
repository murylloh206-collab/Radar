import React, { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: any;
  color?: string;
  trend?: string;
  trendPositive?: boolean;
  highlight?: boolean;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = '#f5c542',
  trend,
  trendPositive,
  highlight = false,
}: MetricCardProps) {
  const renderIcon = () => {
    if (!Icon) return null;
    if (React.isValidElement(Icon)) {
      return Icon;
    }
    if (typeof Icon === 'function' || (typeof Icon === 'object' && Icon !== null)) {
      const Component = Icon as React.ComponentType<{ className?: string }>;
      return <Component className="w-4 h-4 sm:w-5 sm:h-5" />;
    }
    return null;
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-3.5 sm:p-4 transition-all duration-200 ${
        highlight
          ? 'bg-gradient-to-br from-[#161616] to-[#292825] border-[#f5c542]/40 shadow-lg shadow-[#f5c542]/10'
          : 'bg-[#161616] border-[#2c2c2c] hover:border-[#f5c542]/30'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[#a8a39a] truncate">
            {title}
          </p>
          <h3 className="mt-1 text-lg sm:text-2xl font-black tracking-tight text-[#f6f2e8] truncate">
            {value}
          </h3>
        </div>
        {Icon && (
          <div
            className="flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#0c0c0d] border border-[#2c2c2c]"
            style={{ color }}
          >
            {renderIcon()}
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-2.5 sm:mt-3 flex items-center gap-1.5 text-[11px] sm:text-xs truncate">
          {trend && (
            <span
              className={`font-semibold flex-shrink-0 ${
                trendPositive ? 'text-[#5fd0a0]' : 'text-[#f07878]'
              }`}
            >
              {trend}
            </span>
          )}
          {subtitle && <span className="text-[#a8a39a] truncate">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
