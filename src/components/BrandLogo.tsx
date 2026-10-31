'use client';

import React from 'react';

export type SupportedBrand =
  | 'shopee'
  | 'netshoes'
  | 'amazon'
  | 'mercadolivre'
  | 'magalu'
  | 'whatsapp';

interface BrandLogoProps {
  brand: SupportedBrand;
  size?: number; // Tamanho visual da imagem (ex: 24, 28, 32, 40)
  containerSize?: number; // Tamanho do contêiner suporte (ex: 36, 44, 48)
  variant?: 'icon' | 'full';
  className?: string;
  alt?: string;
  withBackground?: boolean;
}

const BRAND_CONFIG: Record<
  SupportedBrand,
  {
    name: string;
    iconSrc: string;
    bgColor: string;
    defaultAlt: string;
  }
> = {
  shopee: {
    name: 'Shopee',
    iconSrc: '/brands/shopee.png',
    bgColor: '#EE4D2D',
    defaultAlt: 'Logo oficial da Shopee',
  },
  netshoes: {
    name: 'Netshoes',
    iconSrc: '/brands/netshoes.svg',
    bgColor: '#5A2D82',
    defaultAlt: 'Logo oficial da Netshoes',
  },
  amazon: {
    name: 'Amazon',
    iconSrc: '/brands/amazon.png',
    bgColor: '#FFFFFF',
    defaultAlt: 'Logo oficial da Amazon',
  },
  mercadolivre: {
    name: 'Mercado Livre',
    iconSrc: '/brands/mercadolivre.png',
    bgColor: '#FFE600',
    defaultAlt: 'Logo oficial do Mercado Livre',
  },
  magalu: {
    name: 'Magalu',
    iconSrc: '/brands/magalu.png',
    bgColor: '#0086FF',
    defaultAlt: 'Logo oficial do Magazine Luiza',
  },
  whatsapp: {
    name: 'WhatsApp',
    iconSrc: '/brands/whatsapp.png',
    bgColor: 'transparent',
    defaultAlt: 'Logo oficial do WhatsApp',
  },
};

export function BrandLogo({
  brand,
  size = 28,
  containerSize = 44,
  variant = 'icon',
  className = '',
  alt,
  withBackground = false,
}: BrandLogoProps) {
  const config = BRAND_CONFIG[brand];
  if (!config) return null;

  const accessibleAlt = alt || config.defaultAlt;

  // Renderização especial para marcas em fundo escuro garantindo nitidez e proporção
  if (brand === 'whatsapp') {
    return (
      <div
        className={`brand-logo-container brand-whatsapp ${className}`}
        style={{
          width: containerSize,
          height: containerSize,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          flexShrink: 0,
        }}
      >
        <img
          src={config.iconSrc}
          alt={accessibleAlt}
          width={size}
          height={size}
          style={{
            width: size,
            height: size,
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </div>
    );
  }

  // Marcas de lojas com suporte neutro ou de marca que preserva contraste no grafite
  const bg = withBackground
    ? config.bgColor
    : brand === 'amazon'
    ? '#ffffff'
    : brand === 'mercadolivre'
    ? '#FFE600'
    : 'rgba(255, 255, 255, 0.08)';

  return (
    <div
      className={`brand-logo-container brand-${brand} ${className}`}
      style={{
        width: containerSize,
        height: containerSize,
        backgroundColor: bg,
        borderRadius: 10,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      }}
    >
      <img
        src={config.iconSrc}
        alt={accessibleAlt}
        style={{
          maxWidth: size,
          maxHeight: size,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  );
}

// Componente para o grupo sobreposto de lojas (Shopee, Netshoes, Amazon)
export function OverlappingStoreLogos({
  size = 32,
  containerSize = 40,
}: {
  size?: number;
  containerSize?: number;
}) {
  return (
    <div
      className="rdv3-store-marks-group"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
      }}
      aria-label="Lojas parceiras: Shopee, Netshoes e Amazon"
    >
      <div style={{ zIndex: 3, position: 'relative' }}>
        <BrandLogo
          brand="shopee"
          size={size}
          containerSize={containerSize}
          withBackground
        />
      </div>
      <div style={{ zIndex: 2, position: 'relative', marginLeft: -12 }}>
        <BrandLogo
          brand="netshoes"
          size={size}
          containerSize={containerSize}
          withBackground
        />
      </div>
      <div style={{ zIndex: 1, position: 'relative', marginLeft: -12 }}>
        <BrandLogo
          brand="amazon"
          size={size}
          containerSize={containerSize}
          withBackground
        />
      </div>
    </div>
  );
}

