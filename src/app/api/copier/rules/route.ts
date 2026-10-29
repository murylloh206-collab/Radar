import { NextRequest, NextResponse } from 'next/server';
import { QualityRule, StoreCredential, StoreName } from '@/lib/types';
import { readDatabase, writeDatabase, sanitizeStoreCredentials } from '@/lib/server/storage';
import { getSessionFromRequest } from '@/lib/server/auth';

const ALLOWED_STORE_NAMES: StoreName[] = ['shopee', 'mercadolivre', 'netshoes', 'amazon', 'magalu'];

export async function GET(req: NextRequest) {
  try {
    // 1. Exige sessão administrativa para ler configurações
    const session = getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Acesso não autorizado. Sessão de administrador obrigatória.' },
        { status: 401 }
      );
    }

    const db = readDatabase();
    return NextResponse.json({
      ok: true,
      rules: db.rules,
      stores: sanitizeStoreCredentials(db.stores),
      settings: db.settings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar regras de configuração';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Exige sessão administrativa para alterar configurações
    const session = getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Acesso não autorizado. Sessão de administrador obrigatória.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawStores = body.stores || body.storeCredentials;
    const rawRules = body.rules || body.storeQualityRules;
    const settings = body.settings;
    const db = readDatabase();

    // 2. Regras de Qualidade: Whitelist estrita de campos
    if (Array.isArray(rawRules)) {
      rawRules.forEach((incomingRule: Partial<QualityRule>) => {
        if (!incomingRule.storeName || !ALLOWED_STORE_NAMES.includes(incomingRule.storeName as StoreName)) {
          return;
        }

        const storeName = incomingRule.storeName as StoreName;
        const sanitizedRule: QualityRule = {
          id: `rule_${storeName}`,
          userId: db.settings.userId || session.userId,
          storeName,
          minRating: typeof incomingRule.minRating === 'number' ? incomingRule.minRating : 4.0,
          minReviewsCount: typeof incomingRule.minReviewsCount === 'number' ? incomingRule.minReviewsCount : 10,
          minSalesCount: typeof incomingRule.minSalesCount === 'number' ? incomingRule.minSalesCount : 5,
          minDiscountPct: typeof incomingRule.minDiscountPct === 'number' ? incomingRule.minDiscountPct : 10,
          minCommissionRate: typeof incomingRule.minCommissionRate === 'number' ? incomingRule.minCommissionRate : 3,
          requireSocialProof: Boolean(incomingRule.requireSocialProof),
          requireInStock: incomingRule.requireInStock !== undefined ? Boolean(incomingRule.requireInStock) : true,
          blockedKeywords: Array.isArray(incomingRule.blockedKeywords) ? incomingRule.blockedKeywords.map(String) : [],
          updatedAt: new Date().toISOString(),
        };

        const idx = db.rules.findIndex((r) => r.storeName === storeName);
        if (idx >= 0) {
          db.rules[idx] = sanitizedRule;
        } else {
          db.rules.push(sanitizedRule);
        }
      });
    }

    // 3. Credenciais de Lojas: Whitelist estrita
    // NUNCA permitir que o navegador altere isValidated, validationMethod, lastValidatedAt ou validationError!
    if (Array.isArray(rawStores)) {
      rawStores.forEach((incomingCred: Partial<StoreCredential> & { storeName?: unknown }) => {
        if (!incomingCred.storeName || !ALLOWED_STORE_NAMES.includes(incomingCred.storeName as StoreName)) {
          return;
        }

        const storeName = incomingCred.storeName as StoreName;
        const idx = db.stores.findIndex((s) => s.storeName === storeName);
        const current = idx >= 0 ? db.stores[idx] : null;

        const newAppId = typeof incomingCred.appId === 'string' ? incomingCred.appId.trim() : (current?.appId || '');
        const newAffiliateTag = typeof incomingCred.affiliateTag === 'string' ? incomingCred.affiliateTag.trim() : (current?.affiliateTag || '');
        const hasCredentialsChanged = current && (current.appId !== newAppId || current.affiliateTag !== newAffiliateTag);

        // Se o usuário alterou appId ou affiliateTag, resetamos a validação prévia
        const preservedIsValidated = hasCredentialsChanged ? false : (current?.isValidated ?? false);
        const preservedValidationMethod = hasCredentialsChanged ? undefined : current?.validationMethod;
        const preservedLastValidatedAt = hasCredentialsChanged ? undefined : current?.lastValidatedAt;

        const sanitizedStore: StoreCredential = {
          id: current?.id || `store_${storeName}`,
          userId: current?.userId || session.userId,
          storeName,
          appId: newAppId,
          affiliateTag: newAffiliateTag,
          // Preserva segredos existentes caso o cliente envie vazio ou mascarado
          appSecret:
            typeof incomingCred.appSecret === 'string' && incomingCred.appSecret.trim().length > 0 && !incomingCred.appSecret.includes('••••')
              ? incomingCred.appSecret.trim()
              : (current?.appSecret || ''),
          userToken:
            typeof incomingCred.userToken === 'string' && incomingCred.userToken.trim().length > 0 && !incomingCred.userToken.includes('••••')
              ? incomingCred.userToken.trim()
              : (current?.userToken || ''),
          isActive: incomingCred.isActive !== undefined ? Boolean(incomingCred.isActive) : (current?.isActive ?? true),
          // SEGURANÇA: O cliente NÃO PODE alterar o estado de validação por este endpoint
          isValidated: preservedIsValidated,
          validationMethod: preservedValidationMethod,
          lastValidatedAt: preservedLastValidatedAt,
          validationError: hasCredentialsChanged ? undefined : current?.validationError,
          updatedAt: new Date().toISOString(),
        };

        if (idx >= 0) {
          db.stores[idx] = sanitizedStore;
        } else {
          db.stores.push(sanitizedStore);
        }
      });
    }

    // 4. Configurações gerais: Whitelist estrita
    if (settings && typeof settings === 'object') {
      db.settings = {
        ...db.settings,
        systemName: typeof settings.systemName === 'string' ? settings.systemName.trim() : db.settings.systemName,
        nightPauseEnabled: settings.nightPauseEnabled !== undefined ? Boolean(settings.nightPauseEnabled) : db.settings.nightPauseEnabled,
        nightPauseStart: typeof settings.nightPauseStart === 'string' ? settings.nightPauseStart : db.settings.nightPauseStart,
        nightPauseEnd: typeof settings.nightPauseEnd === 'string' ? settings.nightPauseEnd : db.settings.nightPauseEnd,
        minSendIntervalSeconds: typeof settings.minSendIntervalSeconds === 'number' ? settings.minSendIntervalSeconds : db.settings.minSendIntervalSeconds,
        maxDailyMessages: typeof settings.maxDailyMessages === 'number' ? settings.maxDailyMessages : db.settings.maxDailyMessages,
        watermarkText: typeof settings.watermarkText === 'string' ? settings.watermarkText.trim() : db.settings.watermarkText,
        updatedAt: new Date().toISOString(),
      };
    }

    writeDatabase(db);

    // Resposta sanitizada: NUNCA devolver segredos (appSecret, userToken)
    return NextResponse.json({
      ok: true,
      rules: db.rules,
      stores: sanitizeStoreCredentials(db.stores),
      settings: db.settings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar configurações';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
