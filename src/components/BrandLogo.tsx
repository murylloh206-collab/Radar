'use client';

import React, { useState } from 'react';
import './brand-identity.css';

export type SupportedBrand = 'shopee' | 'netshoes' | 'amazon' | 'mercadolivre' | 'magalu' | 'whatsapp';
export type BrandLogoVariant = 'icon' | 'integracao' | 'grupo' | 'whatsapp-destaque' | 'whatsapp-conta';

export const BRAND_CONFIG: Record<SupportedBrand, { name: string; pngSrc: string }> = {
  shopee: { name: 'Shopee', pngSrc: '/brands/shopee-original.png' },
  netshoes: { name: 'Netshoes', pngSrc: '/brands/netshoes-original.png' },
  amazon: { name: 'Amazon', pngSrc: '/brands/amazon-original.png' },
  mercadolivre: { name: 'Mercado Livre', pngSrc: '/brands/mercadolivre-original.png' },
  magalu: { name: 'Magalu', pngSrc: '/brands/magalu-original.png' },
  whatsapp: { name: 'WhatsApp', pngSrc: '/brands/whatsapp-original.png' },
};

interface BrandLogoProps {
  brand: SupportedBrand;
  variant?: BrandLogoVariant;
  size?: number;
  containerSize?: number;
  className?: string;
  alt?: string;
  preferFormat?: 'svg' | 'png';
  withBackground?: boolean;
}

// Legacy presentation props remain accepted so existing callers keep working.
export function BrandLogo({ brand, variant = 'icon', className = '', alt }: BrandLogoProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const config = BRAND_CONFIG[brand];
  const unavailable = failedSource === config.pngSrc;

  return (
    <span
      className={`radar-brand radar-brand--${brand} radar-brand--${variant} ${className}`}
      role={unavailable ? 'img' : undefined}
      aria-label={unavailable ? `Imagem de ${config.name} indisponível` : undefined}
    >
      {unavailable ? <span aria-hidden="true" className="radar-brand__missing">—</span> : (
        <img
          src={config.pngSrc}
          alt={alt ?? config.name}
          width={128}
          height={128}
          decoding="async"
          onError={() => setFailedSource(config.pngSrc)}
        />
      )}
    </span>
  );
}

export function OverlappingStoreLogos({ className = '' }: {
  containerSizeDesktop?: number;
  containerSizeMobile?: number;
  overlap?: number;
  className?: string;
}) {
  return (
    <span className={`radar-brand-stack ${className}`} role="group" aria-label="Shopee, Netshoes e Amazon">
      <BrandLogo brand="shopee" variant="grupo" />
      <BrandLogo brand="netshoes" variant="grupo" />
      <BrandLogo brand="amazon" variant="grupo" />
    </span>
  );
}
