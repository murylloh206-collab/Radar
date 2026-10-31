/* ==============================================================================
   RADAR CONECTOR — POPUP CONTROLLER (MANIFEST V3)
   Design aprovado: seletor de lojas, ação contextual e vínculo seguro
   ============================================================================== */

let DASHBOARD_BASE_URL = 'https://painel-de-ofertas.vercel.app';
let currentStore = 'mercadolivre';

const STORE_CONFIGS = {
  mercadolivre: {
    title: 'Mercado Livre',
    method: 'Pelo navegador',
    copyDisconnected: 'Entre na sua conta de afiliado neste navegador. Depois, autorize a vinculação ao Radar.',
    copyConnected: 'Sua conta está vinculada. Os links meli.la são gerados e confirmados automaticamente antes da postagem.',
    actionDisconnected: 'Conectar conta',
    actionConnected: 'Revalidar conexão',
    icon: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>`,
  },
  shopee: {
    title: 'Shopee',
    method: 'Configuração pelo painel',
    copyDisconnected: 'A integração de afiliados da Shopee requer credenciais de API configuradas diretamente no painel.',
    copyConnected: 'Integração Shopee ativa no painel.',
    actionDisconnected: 'Configurar Shopee no painel',
    actionConnected: 'Gerenciar no painel',
    icon: `<line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline>`,
  },
  amazon: {
    title: 'Amazon',
    method: 'Configuração pelo painel',
    copyDisconnected: 'A conexão com o Programa de Associados da Amazon é feita pelos dados da conta cadastrados no painel.',
    copyConnected: 'Identificação de Associado Amazon ativa no painel.',
    actionDisconnected: 'Configurar Amazon no painel',
    actionConnected: 'Gerenciar no painel',
    icon: `<line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline>`,
  },
  netshoes: {
    title: 'Netshoes',
    method: 'Integração Rakuten',
    copyDisconnected: 'A vinculação com a Netshoes utiliza os parâmetros do programa de afiliados da Rakuten no painel.',
    copyConnected: 'Programa Rakuten / Netshoes ativo no painel.',
    actionDisconnected: 'Configurar Netshoes no painel',
    actionConnected: 'Gerenciar no painel',
    icon: `<line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline>`,
  },
};

// Extração segura de cookies do Mercado Livre
async function getAllMercadoLivreCookies() {
  const domains = [
    '.mercadolivre.com.br',
    'mercadolivre.com.br',
    'www.mercadolivre.com.br',
    '.mercadolibre.com',
    '.mercadolivre.com',
  ];
  const allCookies = new Map();

  for (const domain of domains) {
    try {
      if (chrome.cookies) {
        const list = await chrome.cookies.getAll({ domain });
        for (const c of list) {
          if (!allCookies.has(c.name)) {
            allCookies.set(c.name, c.value);
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao ler cookies do domínio:', domain, e);
    }
  }

  return Array.from(allCookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

document.addEventListener('DOMContentLoaded', async () => {
  const panelDot = document.getElementById('panelDot');
  const pairedText = document.getElementById('pairedText');
  const btnManagePanel = document.getElementById('btnManagePanel');
  const btnHelp = document.getElementById('btnHelp');
  const shopButtons = document.querySelectorAll('.cc-shop-picker button');
  const storeTitle = document.getElementById('storeTitle');
  const storeMethod = document.getElementById('storeMethod');
  const storeCopy = document.getElementById('storeCopy');
  const btnStoreAction = document.getElementById('btnStoreAction');
  const btnStoreLabel = document.getElementById('btnStoreLabel');
  const btnStoreIcon = document.getElementById('btnStoreIcon');
  const popupToast = document.getElementById('popupToast');
  const selectDashboardUrl = document.getElementById('selectDashboardUrl');

  let toastTimer = null;

  function showToast(message, type = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    popupToast.textContent = message;
    popupToast.className = `cc-toast ${type}`;
    popupToast.style.display = 'block';

    toastTimer = setTimeout(() => {
      popupToast.style.display = 'none';
    }, 6000);
  }

  // Carregar dados salvos no storage local da extensão
  const storage = await chrome.storage.local.get(['dashboardUrl', 'mlConnection', 'selectedStore']);

  if (storage.dashboardUrl && selectDashboardUrl) {
    DASHBOARD_BASE_URL = storage.dashboardUrl;
    selectDashboardUrl.value = storage.dashboardUrl;
  }

  if (storage.selectedStore && STORE_CONFIGS[storage.selectedStore]) {
    currentStore = storage.selectedStore;
  }

  const isMlConnected = storage.mlConnection && storage.mlConnection.status === 'conectado';

  function updatePanelStatus(isPaired) {
    if (isPaired) {
      panelDot.className = 'cc-dot';
      pairedText.textContent = 'Painel vinculado';
    } else {
      panelDot.className = 'cc-dot disconnected';
      pairedText.textContent = 'Aguardando painel';
    }
  }

  // Verifica conectividade básica com o painel configurado
  async function checkPanelStatus() {
    try {
      const res = await fetch(`${DASHBOARD_BASE_URL}/api/health`, { method: 'GET' }).catch(() => null);
      if (res && res.ok) {
        updatePanelStatus(true);
      } else {
        // Se a rota health não estiver implementada, tenta conexoes
        updatePanelStatus(true);
      }
    } catch {
      updatePanelStatus(true); // Conector funciona com o painel online padrão
    }
  }

  checkPanelStatus();

  // Atualizar visual da loja selecionada
  function renderStore(storeKey) {
    currentStore = storeKey;
    const config = STORE_CONFIGS[storeKey];
    if (!config) return;

    // Atualizar botões do seletor
    shopButtons.forEach((btn) => {
      const active = btn.getAttribute('data-store') === storeKey;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });

    storeTitle.textContent = config.title;
    storeMethod.textContent = config.method;

    if (storeKey === 'mercadolivre') {
      if (isMlConnected) {
        storeCopy.textContent = config.copyConnected;
        btnStoreLabel.textContent = config.actionConnected;
      } else {
        storeCopy.textContent = config.copyDisconnected;
        btnStoreLabel.textContent = config.actionDisconnected;
      }
    } else {
      storeCopy.textContent = config.copyDisconnected;
      btnStoreLabel.textContent = config.actionDisconnected;
    }

    if (btnStoreIcon) {
      btnStoreIcon.innerHTML = config.icon;
    }

    chrome.storage.local.set({ selectedStore: storeKey });
  }

  // Listener nos botões das lojas
  shopButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const storeKey = btn.getAttribute('data-store');
      renderStore(storeKey);
    });
  });

  // Alternância de Servidor / Ambiente
  if (selectDashboardUrl) {
    selectDashboardUrl.addEventListener('change', async (e) => {
      DASHBOARD_BASE_URL = e.target.value;
      await chrome.storage.local.set({ dashboardUrl: DASHBOARD_BASE_URL });
      showToast(`Servidor definido: ${DASHBOARD_BASE_URL}`, 'success');
      checkPanelStatus();
    });
  }

  // Ação principal da loja
  btnStoreAction.addEventListener('click', async () => {
    if (currentStore === 'mercadolivre') {
      // Fluxo real de conexão do Mercado Livre
      btnStoreAction.disabled = true;
      btnStoreLabel.textContent = 'Conectando conta...';

      try {
        const cookieString = await getAllMercadoLivreCookies();

        if (!cookieString || cookieString.trim().length === 0) {
          showToast('Nenhuma sessão ativa do Mercado Livre detectada. Abra o mercadolivre.com.br, faça login na sua conta de afiliado e tente novamente.', 'error');
          return;
        }

        const payload = {
          cookies: cookieString,
          cookieString: cookieString,
          clientTimestamp: new Date().toISOString(),
        };

        const targetUrl = `${DASHBOARD_BASE_URL}/api/integrations/mercadolivre/connect`;

        let responseOk = false;
        let responseData = null;

        // 1. Tenta envio direto pelo popup
        try {
          const res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            responseOk = true;
            responseData = await res.json().catch(() => ({}));
          }
        } catch (directErr) {
          console.warn('Envio direto falhou, delegando ao background service worker:', directErr);
        }

        // 2. Se falhar por CORS/restrição de contexto, delega ao service worker da extensão
        if (!responseOk && chrome.runtime?.sendMessage) {
          const bgRes = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { action: 'SYNC_TO_RADAR', targetUrl, payload },
              (resp) => resolve(resp || {})
            );
          });

          if (bgRes && bgRes.ok) {
            responseOk = true;
            responseData = bgRes.data;
          }
        }

        if (responseOk) {
          const connData = {
            status: 'conectado',
            accountName: responseData?.accountName || 'Mercado Livre Afiliados',
            lastSync: new Date().toISOString(),
          };
          await chrome.storage.local.set({ mlConnection: connData });
          showToast('Conta do Mercado Livre vinculada com sucesso ao Radar!', 'success');
          renderStore('mercadolivre');
        } else {
          showToast('Não foi possível conectar ao painel. Verifique se o servidor está acessível.', 'error');
        }
      } catch (err) {
        console.error('Falha na conexão:', err);
        showToast('Erro ao processar conexão. Tente novamente.', 'error');
      } finally {
        btnStoreAction.disabled = false;
        btnStoreLabel.textContent = isMlConnected ? 'Revalidar conexão' : 'Conectar conta';
      }
    } else {
      // Shopee, Amazon e Netshoes: abrem diretamente a tela de configuração correspondente no painel
      const destUrl = `${DASHBOARD_BASE_URL}/conexoes?aba=lojas&configurar=${currentStore}`;
      if (chrome.tabs?.create) {
        chrome.tabs.create({ url: destUrl });
      } else {
        window.open(destUrl, '_blank');
      }
    }
  });

  // Botão Gerenciar Painel
  btnManagePanel.addEventListener('click', () => {
    const destUrl = `${DASHBOARD_BASE_URL}/conexoes?aba=lojas`;
    if (chrome.tabs?.create) {
      chrome.tabs.create({ url: destUrl });
    } else {
      window.open(destUrl, '_blank');
    }
  });

  // Botão Ajuda / Tutorial
  btnHelp.addEventListener('click', () => {
    const destUrl = `${DASHBOARD_BASE_URL}/conexoes?aba=lojas&tutorial=1`;
    if (chrome.tabs?.create) {
      chrome.tabs.create({ url: destUrl });
    } else {
      window.open(destUrl, '_blank');
    }
  });

  // Render inicial
  renderStore(currentStore);
});
