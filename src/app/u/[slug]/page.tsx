import React from 'react';
import { ArrowRight, ShoppingBag, ExternalLink, Sparkles } from 'lucide-react';
import { loadPublicStorefrontConfig } from '@/app/api/public-page/route';
import { getDatabase, readDatabase } from '@/lib/server/storage';
import { ADMIN_UUID } from '@/lib/server/auth';
import { evaluateRealDealBadge } from '@/lib/server/price-history';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

function buildTrackedRedirectHref(destinationUrl: string, fallbackId?: string): string {
  if (!destinationUrl) return '#';
  if (destinationUrl.startsWith('/r/')) return destinationUrl;
  try {
    const encoded = Buffer.from(destinationUrl.trim(), 'utf8').toString('base64url');
    return `/r/${encoded}`;
  } catch {
    return fallbackId ? `/r/${fallbackId.slice(0, 8)}` : destinationUrl;
  }
}

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function PublicBioLinkPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const cleanSlug = decodeURIComponent(rawSlug || '').replace(/^@+/, '').toLowerCase();

  const config = await loadPublicStorefrontConfig(ADMIN_UUID);

  let db;
  try {
    db = await getDatabase();
  } catch {
    db = readDatabase();
  }

  // Ofertas reais do catálogo com link de afiliado válido (sem dados falsos!)
  const realOffers = (db.products || [])
    .filter((p) => p.affiliateUrl && p.currentPrice > 0)
    .slice(0, 12);

  // Avaliar selo de promoção real para as ofertas exibidas
  const offersWithBadges = await Promise.all(
    realOffers.map(async (offer) => {
      const audit = await evaluateRealDealBadge({
        productUrl: offer.productUrl || offer.affiliateUrl,
        currentPrice: offer.currentPrice,
        claimedOriginalPrice: offer.originalPrice,
      });
      return {
        ...offer,
        trackedHref: buildTrackedRedirectHref(offer.affiliateUrl, offer.id),
        realDealBadge: audit.badgeLabel,
      };
    })
  );

  const accentColor = config.accentColor || '#6366f1';
  const communityLinks = [
    config.btn1Text && config.btn1Url
      ? {
          title: config.btn1Text,
          href: buildTrackedRedirectHref(config.btn1Url, 'btn1'),
          primary: true,
        }
      : null,
    config.btn2Text && config.btn2Url
      ? {
          title: config.btn2Text,
          href: buildTrackedRedirectHref(config.btn2Url, 'btn2'),
          primary: false,
        }
      : null,
  ].filter(Boolean) as Array<{ title: string; href: string; primary: boolean }>;

  return (
    <div
      className="min-h-screen flex flex-col items-center py-8 px-4 text-white"
      style={{
        background: 'linear-gradient(165deg, #04060d 0%, #091128 55%, #111d45 100%)',
      }}
    >
      <div className="w-full max-w-xl rounded-3xl bg-[#0a1022]/90 border border-white/15 p-6 sm:p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
        {/* Glow com a cor de destaque do cliente */}
        <div
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-25"
          style={{ background: accentColor }}
        />

        {/* Logo personalizada do cliente ou emblema oficial */}
        <div className="relative z-10 mb-4">
          {config.logoUrl ? (
            <img
              src={config.logoUrl}
              alt={config.title}
              className="w-20 h-20 rounded-full object-cover border-2 shadow-lg"
              style={{ borderColor: accentColor }}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black border-2 shadow-lg"
              style={{
                borderColor: accentColor,
                background: 'rgba(15, 23, 42, 0.9)',
                color: accentColor,
              }}
            >
              ◎
            </div>
          )}
        </div>

        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-semibold mb-2 border"
          style={{
            borderColor: `${accentColor}55`,
            backgroundColor: `${accentColor}22`,
            color: '#e2e8f0',
          }}
        >
          @{cleanSlug || config.slug}
        </span>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {config.title}
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md">
          {config.bio}
        </p>

        {/* Botões de Comunidade (WhatsApp / Telegram / Links) passando por /r/[code] */}
        {communityLinks.length > 0 && (
          <div className="mt-6 w-full space-y-3">
            {communityLinks.map((item, idx) => (
              <a
                key={idx}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                style={
                  item.primary
                    ? { backgroundColor: accentColor, color: '#ffffff' }
                    : undefined
                }
                className={`w-full p-4 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-bold transition-all duration-200 ${
                  item.primary
                    ? 'shadow-lg hover:opacity-95'
                    : 'bg-white/5 border border-white/15 text-white hover:bg-white/10'
                }`}
              >
                <span className="truncate pr-2">{item.title}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Vitrine de Ofertas do Dia (Links rastreados via /r/[code]) */}
        <div className="mt-8 w-full text-left">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" style={{ color: accentColor }} />
              Ofertas Verificadas
            </h2>
            <span className="text-xs text-slate-400">
              {offersWithBadges.length} {offersWithBadges.length === 1 ? 'oferta ativa' : 'ofertas ativas'}
            </span>
          </div>

          {offersWithBadges.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-black/25 p-6 text-center">
              <p className="text-xs sm:text-sm text-slate-300 font-medium">
                Nenhuma oferta publicada no momento.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                As ofertas compartilhadas pelo painel aparecerão automaticamente nesta vitrine com rastreamento de cliques.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {offersWithBadges.map((offer) => (
                <a
                  key={offer.id}
                  href={offer.trackedHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col justify-between rounded-2xl border border-white/12 bg-black/35 hover:border-white/30 p-3.5 transition-all"
                >
                  <div>
                    {offer.imageUrl && (
                      <div className="w-full h-36 rounded-xl bg-white p-2 mb-3 flex items-center justify-center overflow-hidden">
                        <img
                          src={offer.imageUrl}
                          alt={offer.title}
                          className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                        />
                      </div>
                    )}

                    {offer.realDealBadge && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300 mb-1.5">
                        <Sparkles className="w-2.5 h-2.5" />
                        {offer.realDealBadge}
                      </span>
                    )}

                    <h3 className="text-xs font-bold text-white line-clamp-2 leading-snug mb-2">
                      {offer.title}
                    </h3>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-end justify-between gap-2">
                    <div>
                      {offer.originalPrice && offer.originalPrice > offer.currentPrice && (
                        <span className="block text-[10px] text-slate-400 line-through">
                          R$ {formatBRL(offer.originalPrice)}
                        </span>
                      )}
                      <strong className="text-sm font-extrabold text-emerald-400">
                        R$ {formatBRL(offer.currentPrice)}
                      </strong>
                    </div>

                    <span
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white"
                      style={{ backgroundColor: accentColor }}
                    >
                      Ver oferta <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 text-[11px] text-slate-400">
          🎯 Vitrine verificada • Links protegidos via redirecionador oficial
        </div>
      </div>
    </div>
  );
}
