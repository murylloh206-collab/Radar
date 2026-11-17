'use client';

import React, { useState } from 'react';
import Image from 'next/image';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function Logo({ className = '', size = 'md', showText = true }: LogoProps) {
  const [imageError, setImageError] = useState(false);

  const containerSizes = {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-24',
  };

  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-20 h-20',
  };

  // Se for apenas o ícone sem o texto ao lado
  if (!showText) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        {!imageError ? (
          <div className={`relative ${iconSizes[size]} overflow-hidden rounded-2xl shadow-lg shadow-[#f5c542]/15 border border-[#2c2c2c]`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Radar de Ofertas"
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <div className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#d9a520] to-[#f5c542] p-0.5 shadow-lg shadow-[#f5c542]/20 ${iconSizes[size]}`}>
            <div className="w-full h-full bg-[#0c0c0d] rounded-[14px] flex items-center justify-center">
              <span className="text-[#f5c542] font-black text-xs">RO</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Versão completa com o logo oficial
  return (
    <div className={`flex items-center gap-2.5 ${containerSizes[size]} ${className}`}>
      {!imageError ? (
        <div className="relative flex items-center h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Radar de Ofertas — Achados que valem a pena"
            className="h-full w-auto object-contain drop-shadow-[0_0_12px_rgba(245, 197, 66,0.25)]"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2.5 leading-none select-none">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#d9a520] to-[#f5c542] p-0.5">
            <div className="w-full h-full bg-[#0c0c0d] rounded-[10px] flex items-center justify-center font-black text-xs text-[#f5c542]">
              RO
            </div>
          </div>
          <div>
            <span className="text-base font-black text-[#f6f2e8] tracking-tight">
              RADAR <span className="text-[#f5c542]">DE OFERTAS</span>
            </span>
            <p className="text-[10px] font-medium text-[#a8a39a] tracking-wider mt-0.5">
              Achados que valem a pena.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
