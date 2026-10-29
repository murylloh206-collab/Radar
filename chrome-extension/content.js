/* ==============================================================================
   RADAR DE OFERTAS — CONTENT SCRIPT MERCADO LIVRE (MANIFEST V3)
   Inspeção real de sessão de afiliado, barra Stripe, scripts e links /sec/ ou matt_word
   ============================================================================== */

function inspectMercadoLivrePage() {
  let affiliateTag = null;
  let mattTool = null;
  let accountName = null;
  let detectedSecLink = null;
  let hasAffiliateBar = false;

  // 1. Verificar URL atual por matt_word / matt_tool
  try {
    const currentUrlObj = new URL(window.location.href);
    const urlWord = currentUrlObj.searchParams.get('matt_word');
    const urlTool = currentUrlObj.searchParams.get('matt_tool');
    if (urlWord && urlWord.trim()) affiliateTag = urlWord.trim();
    if (urlTool && urlTool.trim()) mattTool = urlTool.trim();
  } catch {}

  // 2. Inspecionar barra oficial de afiliados (Stripe / Toolbar) no DOM do Mercado Livre
  const affiliateBarSelectors = [
    '[data-testid="affiliate-toolbar"]',
    '.ui-affiliate-toolbar',
    '#affiliate-bar',
    '#stripe-bar',
    '[id*="stripe"]',
    '[class*="stripe-bar"]',
    '[class*="affiliate-bar"]',
    '[class*="affiliates-toolbar"]',
    '.affiliate-header',
    'a[href*="/afiliados"]',
  ];

  let affiliateBar = null;
  for (const sel of affiliateBarSelectors) {
    const found = document.querySelector(sel);
    if (found) {
      affiliateBar = found;
      hasAffiliateBar = true;
      break;
    }
  }

  if (affiliateBar) {
    const tagEl = affiliateBar.querySelector('.tag-name, [data-tag], .affiliate-tag, .tag-badge');
    if (!affiliateTag && tagEl && tagEl.textContent?.trim()) {
      affiliateTag = tagEl.textContent.trim();
    }

    const linkEl = affiliateBar.querySelector('input[value*="/sec/"], input[value*="meli.la"], a[href*="/sec/"], a[href*="meli.la"]');
    if (linkEl) {
      detectedSecLink = (linkEl.value || linkEl.href || '').trim();
    }
  }

  // 3. Procurar links ou inputs na página contendo /sec/, meli.la ou matt_word=
  if (!detectedSecLink) {
    const inputsAndLinks = document.querySelectorAll(
      'input[value*="/sec/"], input[value*="meli.la"], textarea, a[href*="/sec/"], a[href*="meli.la"], a[href*="matt_word="]'
    );
    for (const el of inputsAndLinks) {
      const val = (el.value || el.href || el.textContent || '').trim();
      if (!detectedSecLink && (val.includes('/sec/') || val.includes('meli.la/'))) {
        const matchSec = val.match(/https?:\/\/(?:www\.)?(?:mercadolivre\.com(?:\.br)?\/sec\/|meli\.la\/)[A-Za-z0-9_-]+/i);
        if (matchSec) detectedSecLink = matchSec[0];
      }
      if (!affiliateTag && val.includes('matt_word=')) {
        try {
          const u = new URL(val, window.location.origin);
          if (u.searchParams.get('matt_word')) affiliateTag = u.searchParams.get('matt_word').trim();
          if (u.searchParams.get('matt_tool')) mattTool = u.searchParams.get('matt_tool').trim();
        } catch {}
      }
    }
  }

  // 4. Buscar nome/apelido da conta logada no cabeçalho do Mercado Livre
  const userSelectors = [
    '.nav-header-username',
    '.nav-header-user-badge',
    '.nav-header-user-myml',
    'a[data-js="user-menu"]',
    '.user-menu-title',
    '[data-testid="user-menu"]',
  ];
  for (const uSel of userSelectors) {
    const el = document.querySelector(uSel);
    if (el && el.textContent?.trim()) {
      accountName = el.textContent.trim().replace(/^Olá,?\s*/i, '').trim();
      if (accountName) break;
    }
  }

  // 5. Inspecionar scripts inline do Mercado Livre (__PRELOADED_STATE__, melidata, etc.)
  if (!affiliateTag || !accountName) {
    const scripts = document.querySelectorAll('script:not([src])');
    for (const s of scripts) {
      const text = s.textContent || '';
      if (!text) continue;

      if (!affiliateTag) {
        const mattWordMatch =
          text.match(/"matt_word"\s*:\s*"([a-zA-Z0-9_-]{3,40})"/i) ||
          text.match(/matt_word=([a-zA-Z0-9_-]{3,40})/i) ||
          text.match(/"affiliateTag"\s*:\s*"([a-zA-Z0-9_-]{3,40})"/i) ||
          text.match(/"tag_name"\s*:\s*"([a-zA-Z0-9_-]{3,40})"/i);
        if (mattWordMatch && mattWordMatch[1]) {
          affiliateTag = mattWordMatch[1].trim();
        }
      }

      if (!mattTool) {
        const mattToolMatch =
          text.match(/"matt_tool"\s*:\s*"?([0-9]{4,15})"?/i) ||
          text.match(/matt_tool=([0-9]{4,15})/i);
        if (mattToolMatch && mattToolMatch[1]) {
          mattTool = mattToolMatch[1].trim();
        }
      }

      if (!accountName) {
        const nickMatch = text.match(/"nickname"\s*:\s*"([A-Za-z0-9_.-]{3,40})"/);
        if (nickMatch && nickMatch[1]) {
          accountName = nickMatch[1].trim();
        }
      }

      if (!detectedSecLink) {
        const secMatch = text.match(/https?:\/\/(?:www\.)?(?:mercadolivre\.com(?:\.br)?\/sec\/|meli\.la\/)[A-Za-z0-9_-]+/i);
        if (secMatch) {
          detectedSecLink = secMatch[0];
        }
      }
    }
  }

  // 6. Se estiver na área de afiliados (/afiliados) e houver nickname logado ou tag visível
  const isAffiliatePage =
    window.location.pathname.includes('/afiliados') ||
    window.location.hostname.includes('afiliados.mercadolivre');

  if (!affiliateTag && isAffiliatePage) {
    const tagSpan = document.querySelector('.tag-value, .user-tag, [data-testid="tag-name"]');
    if (tagSpan && tagSpan.textContent?.trim()) {
      affiliateTag = tagSpan.textContent.trim();
    }
  }

  // Se o usuário está logado no Mercado Livre (accountName identificado) em uma página de afiliados ou com barra ativa,
  // podemos sugerir o nickname normalizado caso matt_word ainda não esteja explícito no DOM
  const suggestedNicknameTag = accountName
    ? accountName.toLowerCase().replace(/[^a-z0-9_-]/g, '')
    : null;

  const isProduct =
    window.location.pathname.includes('/p/MLB') ||
    window.location.pathname.includes('/MLB-') ||
    window.location.pathname.includes('/item/');

  return {
    hasActiveAffiliateSession: Boolean(affiliateTag || detectedSecLink || hasAffiliateBar || isAffiliatePage || accountName),
    affiliateTag: affiliateTag || null,
    mattTool: mattTool || null,
    suggestedNicknameTag: suggestedNicknameTag && suggestedNicknameTag.length >= 3 ? suggestedNicknameTag : null,
    accountName: accountName || null,
    detectedSecLink: detectedSecLink || null,
    hasAffiliateBar: Boolean(hasAffiliateBar || isAffiliatePage),
    isProductPage: isProduct,
    currentUrl: window.location.href,
    pageTitle: document.title,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'INSPECT_ML_SESSION') {
    sendResponse(inspectMercadoLivrePage());
  }

  if (message.action === 'GET_PRODUCT_DATA') {
    const titleEl = document.querySelector('h1.ui-pdp-title') || document.querySelector('h1');
    const title = titleEl ? titleEl.textContent?.trim() : document.title;

    let price = null;
    const priceEl = document.querySelector('.andes-money-amount__fraction');
    if (priceEl) {
      price = parseFloat(priceEl.textContent?.replace(/\./g, '').replace(',', '.') || '0');
    }

    const secInput = document.querySelector('input[value*="/sec/"], input[value*="meli.la"], a[href*="/sec/"], a[href*="meli.la"]');
    const shortSecUrl = secInput ? (secInput.value || secInput.href || '').trim() : null;

    sendResponse({
      title,
      price,
      shortSecUrl,
      url: window.location.href,
    });
  }

  return true;
});
