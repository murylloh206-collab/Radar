import { NextRequest, NextResponse } from 'next/server';
import { checkPlanFeatureAccess, resolveCurrentUserId } from '@/lib/server/plan-guard';

export type CaptionTone = 'animado' | 'direto' | 'urgente';
export type CaptionChannel = 'whatsapp' | 'instagram' | 'telegram';

interface GenerateCaptionInput {
  title: string;
  currentPrice: number;
  originalPrice?: number;
  couponCode?: string;
  affiliateUrl: string;
  storeName?: string;
  tone: CaptionTone;
  channel: CaptionChannel;
  variationIndex?: number;
}

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildStructuredCaption(input: GenerateCaptionInput): {
  caption: string;
  provider: 'gemini' | 'structured_engine';
} {
  const cleanTitle = input.title.trim();
  const hasDiscount =
    typeof input.originalPrice === 'number' &&
    input.originalPrice > input.currentPrice &&
    input.currentPrice > 0;

  const discountPct = hasDiscount
    ? Math.round(((input.originalPrice! - input.currentPrice) / input.originalPrice!) * 100)
    : undefined;

  const seed = typeof input.variationIndex === 'number' ? input.variationIndex : 0;

  // Variações de abertura por tom
  const hooksByTone: Record<CaptionTone, string[]> = {
    animado: [
      '😍 Olha essa oportunidade que acabou de aparecer!',
      '✨ Quem estava esperando preço baixo já pode comemorar!',
      '🔥 Promoção boa de verdade para aproveitar agora!',
      '🎯 Vale muito a pena conferir essa oferta com desconto!',
    ],
    direto: [
      '📦 Oferta verificada com desconto ativo:',
      '💡 Preço reduzido agora na loja oficial:',
      '✅ Oportunidade direta para economizar hoje:',
      '🏷️ Resumo da oferta com preço atualizado:',
    ],
    urgente: [
      '🚨 CORRE! O preço caiu muito e o estoque pode esgotar rápido!',
      '⚡ ALERTA DE PREÇO BAIXO! Aproveite antes que volte ao valor normal!',
      '⏳ ÚLTIMAS UNIDADES NESSE VALOR! Não deixe passar!',
      '🔥 DESCONTOFORTE LIBERADO AGORA! Garanta antes que acabe!',
    ],
  };

  const hooks = hooksByTone[input.tone] || hooksByTone.animado;
  const chosenHook = hooks[Math.abs(seed) % hooks.length];

  const lines: string[] = [];

  if (input.channel === 'whatsapp') {
    lines.push(`*${chosenHook}*`);
    lines.push('');
    lines.push(`🛍️ *${cleanTitle}*`);
    lines.push('');

    if (hasDiscount && input.originalPrice) {
      lines.push(`❌ De ~R$ ${formatBRL(input.originalPrice)}~`);
    }

    const discountBadge = discountPct && discountPct >= 5 ? ` *(${discountPct}% OFF)*` : '';
    lines.push(`🔥 *Por R$ ${formatBRL(input.currentPrice)}*${discountBadge}`);

    if (input.couponCode && input.couponCode.trim()) {
      lines.push(`🎟️ Cupom: *${input.couponCode.trim().toUpperCase()}*`);
    }

    lines.push('');
    lines.push(`🛒 *Compre pelo link oficial:*`);
    lines.push(input.affiliateUrl.trim());
    lines.push('');
    lines.push(`_⚠️ Preço e estoque sujeitos a alteração a qualquer momento._`);
  } else if (input.channel === 'telegram') {
    lines.push(chosenHook);
    lines.push('');
    lines.push(`🛍️ ${cleanTitle}`);
    lines.push('');

    if (hasDiscount && input.originalPrice) {
      lines.push(`📉 Antes: R$ ${formatBRL(input.originalPrice)}`);
    }

    const discountBadge = discountPct && discountPct >= 5 ? ` (${discountPct}% de desconto)` : '';
    lines.push(`💰 Agora: R$ ${formatBRL(input.currentPrice)}${discountBadge}`);

    if (input.couponCode && input.couponCode.trim()) {
      lines.push(`🎟️ Use o cupom: ${input.couponCode.trim().toUpperCase()}`);
    }

    lines.push('');
    lines.push(`👉 Acesse a oferta aqui: ${input.affiliateUrl.trim()}`);
  } else {
    // Instagram (Legenda de Feed / Reels / Story)
    lines.push(chosenHook);
    lines.push('');
    lines.push(`🛍️ ${cleanTitle}`);
    lines.push('');

    if (hasDiscount && input.originalPrice) {
      lines.push(`De R$ ${formatBRL(input.originalPrice)}`);
    }

    const discountBadge = discountPct && discountPct >= 5 ? ` (${discountPct}% OFF)` : '';
    lines.push(`🔥 Por R$ ${formatBRL(input.currentPrice)}${discountBadge}`);

    if (input.couponCode && input.couponCode.trim()) {
      lines.push(`🎟️ Cupom ativo: ${input.couponCode.trim().toUpperCase()}`);
    }

    lines.push('');
    lines.push(`🔗 Comente "EU QUERO" ou acesse o link na bio / nos Stories:`);
    lines.push(input.affiliateUrl.trim());
    lines.push('');
    lines.push(`#ofertas #promocao #desconto #comprasinteligentes`);
  }

  return {
    caption: lines.join('\n'),
    provider: 'structured_engine',
  };
}

export async function POST(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId();
    const access = await checkPlanFeatureAccess('ai_caption_generator', userId);

    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FEATURE_LOCKED',
          error: access.error,
          requiredPlan: access.requiredPlan,
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const currentPrice = Number(body.currentPrice);
    const originalPrice =
      body.originalPrice !== undefined && body.originalPrice !== '' && Number(body.originalPrice) > 0
        ? Number(body.originalPrice)
        : undefined;
    const couponCode = typeof body.couponCode === 'string' ? body.couponCode.trim() : undefined;
    const affiliateUrl = typeof body.affiliateUrl === 'string' ? body.affiliateUrl.trim() : '';
    const tone: CaptionTone = ['animado', 'direto', 'urgente'].includes(body.tone)
      ? body.tone
      : 'animado';
    const channel: CaptionChannel = ['whatsapp', 'instagram', 'telegram'].includes(body.channel)
      ? body.channel
      : 'whatsapp';
    const variationIndex = typeof body.variationIndex === 'number' ? body.variationIndex : 0;

    if (!title) {
      return NextResponse.json(
        { ok: false, error: 'Informe o nome real do produto para gerar a legenda.' },
        { status: 400 }
      );
    }

    if (isNaN(currentPrice) || currentPrice <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Informe um preço atual válido (maior que zero). Nunca inventamos preços.' },
        { status: 400 }
      );
    }

    if (!affiliateUrl) {
      return NextResponse.json(
        { ok: false, error: 'Informe o link de afiliado da oferta.' },
        { status: 400 }
      );
    }

    // Se houver chave Gemini configurada no servidor, tenta enriquecer mantendo os valores exatos
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const prompt = `Crie uma legenda curta e persuasiva em português do Brasil para postar uma oferta no canal ${channel.toUpperCase()} com tom ${tone.toUpperCase()}.
REGRAS OBRIGATÓRIAS:
- Produto: ${title}
- Preço atual exato: R$ ${formatBRL(currentPrice)}
${originalPrice && originalPrice > currentPrice ? `- Preço anterior exato: R$ ${formatBRL(originalPrice)}` : '- Não cite preço anterior'}
${couponCode ? `- Cupom exato: ${couponCode}` : '- Não invente cupom'}
- Link obrigatório no final: ${affiliateUrl}
- NUNCA use as palavras "achado", "achadinho", "achadinhos" ou "apenas".
- Nunca invente números, descontos ou condições de parcelamento que não foram informados acima.
- Use emojis adequados ao tom ${tone}.`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 350 },
            }),
            signal: AbortSignal.timeout(8000),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (aiText && aiText.includes(affiliateUrl)) {
            return NextResponse.json({
              ok: true,
              caption: aiText,
              provider: 'gemini',
              tone,
              channel,
            });
          }
        }
      } catch {
        // Fallback silencioso para o motor estruturado se a API externa oscilar
      }
    }

    const generated = buildStructuredCaption({
      title,
      currentPrice,
      originalPrice,
      couponCode,
      affiliateUrl,
      tone,
      channel,
      variationIndex,
    });

    return NextResponse.json({
      ok: true,
      caption: generated.caption,
      provider: generated.provider,
      tone,
      channel,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
