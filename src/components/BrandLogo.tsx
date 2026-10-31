'use client';

import React, { useState } from 'react';

export type SupportedBrand =
  | 'shopee'
  | 'netshoes'
  | 'amazon'
  | 'mercadolivre'
  | 'magalu'
  | 'whatsapp';

export type BrandLogoVariant =
  | 'icon'
  | 'integracao'
  | 'grupo'
  | 'whatsapp-destaque'
  | 'whatsapp-conta';

interface BrandConfigItem {
  name: string;
  svgSrc: string;
  pngSrc: string;
  bgColor: string;
  defaultAlt: string;
  opticalScale: number; // Ajuste óptico específico da marca
}

export const BRAND_CONFIG: Record<SupportedBrand, BrandConfigItem> = {
  shopee: {
    name: 'Shopee',
    svgSrc: '/brands/shopee.svg',
    pngSrc: '/brands/shopee.png',
    bgColor: '#EE4D2D',
    defaultAlt: 'Logo oficial da Shopee (sacola laranja com S branco)',
    opticalScale: 1.0,
  },
  netshoes: {
    name: 'Netshoes',
    svgSrc: '/brands/netshoes.svg',
    pngSrc: '/brands/netshoes.png',
    bgColor: '#5A2D82',
    defaultAlt: 'Logo oficial da Netshoes (símbolo N roxo e branco)',
    opticalScale: 1.0,
  },
  amazon: {
    name: 'Amazon',
    svgSrc: '/brands/amazon.svg',
    pngSrc: '/brands/amazon.png',
    bgColor: '#131921',
    defaultAlt: 'Logo oficial da Amazon (símbolo a com seta sorriso)',
    opticalScale: 1.0,
  },
  mercadolivre: {
    name: 'Mercado Livre',
    svgSrc: '/brands/mercadolivre.svg',
    pngSrc: '/brands/mercadolivre.png',
    bgColor: '#FFE600',
    defaultAlt: 'Logo oficial do Mercado Livre (aperto de mãos)',
    opticalScale: 1.0,
  },
  magalu: {
    name: 'Magalu',
    svgSrc: '/brands/magalu.svg',
    pngSrc: '/brands/magalu.png',
    bgColor: '#0086FF',
    defaultAlt: 'Logo oficial da Magalu',
    opticalScale: 1.0,
  },
  whatsapp: {
    name: 'WhatsApp',
    svgSrc: '/brands/whatsapp.svg',
    pngSrc: '/brands/whatsapp.png',
    bgColor: '#25D366',
    defaultAlt: 'Logo oficial do WhatsApp (balão verde com telefone branco)',
    opticalScale: 1.0,
  },
};

interface BrandLogoProps {
  brand: SupportedBrand;
  variant?: BrandLogoVariant;
  size?: number; // Tamanho visual da imagem (se não especificado, inferido da variante)
  containerSize?: number; // Tamanho do contêiner suporte
  className?: string;
  alt?: string;
  preferFormat?: 'svg' | 'png';
  withBackground?: boolean;
}

export function BrandLogo({
  brand,
  variant = 'icon',
  size,
  containerSize,
  className = '',
  alt,
  preferFormat = 'svg',
  withBackground = false,
}: BrandLogoProps) {
  const [hasError, setHasError] = useState(false);
  const config = BRAND_CONFIG[brand];

  if (!config) return null;

  // Determinar dimensões ideais com base na variante solicitada
  let computedContainerSize = containerSize;
  let computedImageSize = size;
  let borderRadius = '10px';
  let isCircular = false;
  let borderStyle = '1px solid rgba(255, 255, 255, 0.08)';

  switch (variant) {
    case 'integracao':
      // Conexões > Lojas e afiliados: suporte 48-56px (52px padrão), desenho 32-36px claramente reconhecível
      computedContainerSize = containerSize ?? 52;
      computedImageSize = size ?? 34;
      borderRadius = '12px';
      break;

    case 'grupo':
      // Inicial e carrossel: suporte circular 44-48px (46px), desenho 28-34px
      computedContainerSize = containerSize ?? 46;
      computedImageSize = size ?? 32;
      borderRadius = '50%';
      isCircular = true;
      borderStyle = '2px solid #161f2e'; // Separação discreta entre suportes sobrepostos
      break;

    case 'whatsapp-destaque':
      // Atalho do Copiador: imagem oficial 30-32px dentro de suporte de 48px
      computedContainerSize = containerSize ?? 48;
      computedImageSize = size ?? 32;
      borderRadius = '12px';
      borderStyle = '1px solid rgba(37, 211, 102, 0.2)';
      break;

    case 'whatsapp-conta':
      // Identificação da conta conectada em Conexões: imagem 36-40px alinhada ao nome e número
      computedContainerSize = containerSize ?? 46;
      computedImageSize = size ?? 38;
      borderRadius = '12px';
      borderStyle = '1px solid rgba(255, 255, 255, 0.08)';
      break;

    case 'icon':
    default:
      computedContainerSize = containerSize ?? 44;
      computedImageSize = size ?? 28;
      borderRadius = '10px';
      break;
  }

  // Ajuste óptico fino para equilibrar peso visual
  const finalImageSize = Math.round((computedImageSize ?? 28) * config.opticalScale);
  const accessibleAlt = alt || config.defaultAlt;
  // Para o WhatsApp, usar preferencialmente o PNG autêntico oficial com transparência
  const imageSrc =
    brand === 'whatsapp' || preferFormat === 'png'
      ? config.pngSrc
      : config.svgSrc;

  // Estado discreto de indisponibilidade caso o arquivo falhe (nunca mostra outra marca)
  if (hasError) {
    return (
      <div
        className={`brand-fallback ${className}`}
        style={{
          width: computedContainerSize,
          height: computedContainerSize,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius,
          color: '#94a3b8',
          fontSize: 10,
          fontWeight: 700,
          flexShrink: 0,
        }}
        title={`${config.name} indisponível`}
        aria-label={`${config.name} indisponível`}
      >
        {config.name.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  // Se o próprio SVG já é o círculo completo ou a marca tem suporte próprio
  const containerBg = isCircular
    ? 'transparent'
    : withBackground
    ? config.bgColor
    : brand === 'whatsapp'
    ? 'rgba(37, 211, 102, 0.1)'
    : 'rgba(255, 255, 255, 0.05)';

  return (
    <div
      className={`brand-logo-container brand-${brand} ${className}`}
      style={{
        width: computedContainerSize,
        height: computedContainerSize,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: containerBg,
        border: borderStyle,
        borderRadius,
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: isCircular ? '0 2px 6px rgba(0,0,0,0.35)' : '0 1px 3px rgba(0,0,0,0.2)',
        position: 'relative',
      }}
      aria-label={accessibleAlt}
    >
      <img
        src={imageSrc}
        alt={accessibleAlt}
        width={finalImageSize}
        height={finalImageSize}
        onError={() => setHasError(true)}
        style={{
          width: isCircular ? '100%' : `${finalImageSize}px`,
          height: isCircular ? '100%' : `${finalImageSize}px`,
          maxWidth: isCircular ? '100%' : `${finalImageSize}px`,
          maxHeight: isCircular ? '100%' : `${finalImageSize}px`,
          objectFit: 'contain',
          display: 'block',
          userSelect: 'none',
        }}
      />
    </div>
  );
}

/**
 * Componente para o grupo sobreposto de logos (Shopee → Netshoes → Amazon).
 * - Suportes de 44-48px no computador e 40-44px no celular.
 * - Desenho visível de aproximadamente 28-34px.
 * - Sequência estrita: Shopee -> Netshoes -> Amazon.
 * - Sobreposição leve de 4-6px com separação discreta (nenhum símbolo escondido).
 */
export function OverlappingStoreLogos({
  containerSizeDesktop = 46,
  containerSizeMobile = 42,
  overlap = 5, // 5px de sobreposição leve (respeita a regra de 4-6px)
  className = '',
}: {
  containerSizeDesktop?: number;
  containerSizeMobile?: number;
  overlap?: number;
  className?: string;
}) {
  return (
    <div
      className={`rdv3-store-marks-group inline-flex items-center relative ${className}`}
      aria-label="Lojas parceiras integradas: Shopee, Netshoes e Amazon"
      style={{ isolation: 'isolate' }}
    >
      {/* 1. Shopee (à esquerda, zIndex 3) */}
      <div style={{ zIndex: 3, position: 'relative' }}>
        <BrandLogo
          brand="shopee"
          variant="grupo"
          containerSize={containerSizeDesktop}
        />
      </div>

      {/* 2. Netshoes (ao centro, zIndex 2, sobreposição de 4-6px) */}
      <div style={{ zIndex: 2, position: 'relative', marginLeft: -overlap }}>
        <BrandLogo
          brand="netshoes"
          variant="grupo"
          containerSize={containerSizeDesktop}
        />
      </div>

      {/* 3. Amazon (à direita, zIndex 1, sobreposição de 4-6px) */}
      <div style={{ zIndex: 1, position: 'relative', marginLeft: -overlap }}>
        <BrandLogo
          brand="amazon"
          variant="grupo"
          containerSize={containerSizeDesktop}
        />
      </div>
    </div>
  );
}
