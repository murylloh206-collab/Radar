/* ==============================================================================
   RADAR DE OFERTAS — POPUP JS (CONECTOR 1-CLIQUE MERCADO LIVRE)
   ============================================================================== */

let DASHBOARD_BASE_URL = 'https://painel-de-ofertas.vercel.app';

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
    } catch {}
  }
  return Array.from(allCookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const btnOneClick = document.getElementById('btnOneClick');
  const statusMessage = document.getElementById('statusMessage');
  const valDaysLeft = document.getElementById('valDaysLeft');
  const valMeliLa = document.getElementById('valMeliLa');
  const selectDashboardUrl = document.getElementById('selectDashboardUrl');

  function showMessage(text, type = 'success') {
    statusMessage.textContent = text;
    statusMessage.className = `status-msg ${type}`;
    statusMessage.style.display = 'block';
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 8000);
  }

  function setConnected(days = 30) {
    statusPill.className = 'status-pill connected';
    statusText.textContent = 'Conectado';
    if (valDaysLeft) valDaysLeft.textContent = `${days} dias restantes`;
    if (valMeliLa) {
      valMeliLa.textContent = 'Ativo (meli.la)';
      valMeliLa.className = 'val success';
    }
  }

  function setDisconnected() {
    statusPill.className = 'status-pill disconnected';
    statusText.textContent = 'Desconectado';
    if (valDaysLeft) valDaysLeft.textContent = 'Pendente';
  }

  // Carrega preferências salvas
  const storage = await chrome.storage.local.get(['dashboardUrl', 'mlConnection']);
  if (storage.dashboardUrl && selectDashboardUrl) {
    DASHBOARD_BASE_URL = storage.dashboardUrl;
    selectDashboardUrl.value = storage.dashboardUrl;
  }

  if (storage.mlConnection && storage.mlConnection.status === 'conectado') {
    setConnected(storage.mlConnection.daysRemaining || 30);
  } else {
    setDisconnected();
  }

  if (selectDashboardUrl) {
    selectDashboardUrl.addEventListener('change', async (e) => {
      DASHBOARD_BASE_URL = e.target.value;
      await chrome.storage.local.set({ dashboardUrl: DASHBOARD_BASE_URL });
      showMessage(`Painel alterado para: ${DASHBOARD_BASE_URL}`, 'success');
    });
  }

  // Conexão em 1 Clique
  btnOneClick.addEventListener('click', async () => {
    btnOneClick.disabled = true;
    btnOneClick.innerHTML = '<span>⏳ Conectando...</span>';

    try {
      // 1. Extrai todos os cookies de sessão do Mercado Livre
      const cookieString = await getAllMercadoLivreCookies();

      const payload = {
        affiliateTag: 'michelhenrique1',
        appId: '77625408',
        cookies: cookieString,
        cookieString: cookieString,
        accountName: 'michelhenrique1',
        verifiedAt: new Date().toISOString(),
      };

      const targetUrl = `${DASHBOARD_BASE_URL}/api/integrations/mercadolivre/connect`;

      // 2. Tenta envio direto pelo popup; se der falha de rede/CORS, delega para o background service worker
      let responseOk = false;
      let responseData = null;

      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/plain, */*',
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          responseOk = true;
          responseData = await res.json().catch(() => ({}));
        }
      } catch (directErr) {
        console.warn('Popup fetch direct failed, delegating to background script:', directErr);
      }

      if (!responseOk) {
        const bgRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: 'SYNC_TO_RADAR', targetUrl, payload },
            (resp) => resolve(resp || {})
          );
        });

        if (bgRes && bgRes.ok) {
          responseOk = true;
          responseData = bgRes.data;
        } else {
          throw new Error(bgRes?.error || 'Não foi possível conectar ao painel');
        }
      }

      // 3. Salva conexão confirmada localmente
      const connData = {
        status: 'conectado',
        affiliateTag: 'michelhenrique1',
        appId: '77625408',
        daysRemaining: 30,
        lastSync: new Date().toISOString(),
      };

      await chrome.storage.local.set({ mlConnection: connData });
      setConnected(30);

      showMessage('✅ Conectado com Sucesso! Cookies salvos e links meli.la ativados por 30 dias.', 'success');
    } catch (err) {
      console.error('Erro ao conectar Mercado Livre:', err);
      showMessage('Falha ao conectar: certifique-se de que o painel está acessível.', 'error');
    } finally {
      btnOneClick.disabled = false;
      btnOneClick.innerHTML = '<span>⚡ Conectar Mercado Livre em 1 Clique</span>';
    }
  });
});
