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
  color = '#1CCAF2',
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
          ? 'bg-gradient-to-br from-[#0D1B31] to-[#0A2244] border-[#1CCAF2]/40 shadow-lg shadow-[#1CCAF2]/10'
          : 'bg-[#0D1B31] border-[#18334D] hover:border-[#1CCAF2]/30'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[#8EADC7] truncate">
            {title}
          </p>
          <h3 className="mt-1 text-lg sm:text-2xl font-black tracking-tight text-[#F8FBFF] truncate">
            {value}
          </h3>
        </div>
        {Icon && (
          <div
            className="flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#061225] border border-[#18334D]"
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
                trendPositive ? 'text-[#20C997]' : 'text-[#F87171]'
              }`}
            >
              {trend}
            </span>
          )}
          {subtitle && <span className="text-[#8EADC7] truncate">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
