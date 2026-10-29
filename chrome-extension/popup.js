/* ==============================================================================
   RADAR DE OFERTAS — POPUP JS (CONECTOR MERCADO LIVRE)
   Pareamento Seguro com Painel, Inspeção Real da Aba + Extração de Link / Tag
   ============================================================================== */

const DASHBOARD_BASE_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', async () => {
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const panelPairStatus = document.getElementById('panelPairStatus');
  const pairingForm = document.getElementById('pairingForm');
  const inputPairCode = document.getElementById('inputPairCode');
  const btnPairPanel = document.getElementById('btnPairPanel');
  const btnPairCookie = document.getElementById('btnPairCookie');
  const consentSection = document.getElementById('consentSection');
  const connectedSection = document.getElementById('connectedSection');
  const inputManualTag = document.getElementById('inputManualTag');
  const inputManualTool = document.getElementById('inputManualTool');
  const btnConsent = document.getElementById('btnConsent');
  const accountUser = document.getElementById('accountUser');
  const accountTag = document.getElementById('accountTag');
  const lastSync = document.getElementById('lastSync');
  const btnGenerateCurrent = document.getElementById('btnGenerateCurrent');
  const btnDisconnect = document.getElementById('btnDisconnect');
  const resultBox = document.getElementById('resultBox');
  const resultUrl = document.getElementById('resultUrl');
  const resultBadge = document.getElementById('resultBadge');
  const resultSource = document.getElementById('resultSource');
  const resultNotice = document.getElementById('resultNotice');
  const btnCopyResult = document.getElementById('btnCopyResult');
  const copyFeedback = document.getElementById('copyFeedback');
  const statusMessage = document.getElementById('statusMessage');

  function showMessage(text, type = 'info') {
    statusMessage.textContent = text;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 9000);
  }

  function setStatus(status, tag = '') {
    statusPill.className = 'status-pill';
    if (status === 'conectado') {
      statusPill.classList.add('connected');
      statusText.textContent = 'Conectado';
      consentSection.classList.add('hidden');
      connectedSection.classList.remove('hidden');
      accountTag.textContent = tag || 'Ativo';
    } else if (status === 'sessao_expirada') {
      statusPill.classList.add('expired');
      statusText.textContent = 'Sessão Expirada';
      consentSection.classList.remove('hidden');
      connectedSection.classList.add('hidden');
    } else {
      statusPill.classList.add('disconnected');
      statusText.textContent = 'Desconectado';
      consentSection.classList.remove('hidden');
      connectedSection.classList.add('hidden');
    }
  }

  // Helper para inspecionar a aba ativa mesmo sem recarregar (injetando content.js se necessário)
  async function inspectActiveMercadoLivreTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.id || !currentTab.url) return null;
      if (!currentTab.url.includes('mercadolivre.com') && !currentTab.url.includes('meli.la')) {
        return { isMercadoLivreTab: false, currentTab };
      }

      try {
        const res = await chrome.tabs.sendMessage(currentTab.id, { action: 'INSPECT_ML_SESSION' });
        if (res) return { isMercadoLivreTab: true, currentTab, ...res };
      } catch {
        // Se a aba estava aberta antes de carregar a extensão, injeta content.js dinamicamente
        if (chrome.scripting) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: currentTab.id },
              files: ['content.js'],
            });
            const retryRes = await chrome.tabs.sendMessage(currentTab.id, { action: 'INSPECT_ML_SESSION' });
            if (retryRes) return { isMercadoLivreTab: true, currentTab, ...retryRes };
          } catch {}
        }
      }
      return { isMercadoLivreTab: true, currentTab };
    } catch {
      return null;
    }
  }

  // Helper para extrair matt_word e matt_tool de texto, tag ou URL (incluindo links curtos /sec/ ou meli.la)
  async function extractTagAndToolFromInput(rawInput, rawToolInput) {
    let tag = (rawInput || '').trim();
    let tool = (rawToolInput || '').trim();

    if (!tag) return { tag: null, tool: tool || null };

    // Se o usuário colou uma URL
    if (tag.startsWith('http://') || tag.startsWith('https://') || tag.includes('mercadolivre.com') || tag.includes('meli.la')) {
      let targetUrl = tag.startsWith('http') ? tag : `https://${tag}`;

      // Se for link curto /sec/ ou meli.la, tenta resolver o redirecionamento usando o próprio navegador Chrome
      if (targetUrl.includes('/sec/') || targetUrl.includes('meli.la/')) {
        try {
          const resp = await fetch(targetUrl, { method: 'GET', redirect: 'follow', credentials: 'include' });
          if (resp && resp.url) {
            targetUrl = resp.url;
          }
        } catch {}
      }

      try {
        const parsed = new URL(targetUrl);
        const w = parsed.searchParams.get('matt_word');
        const t = parsed.searchParams.get('matt_tool');
        if (w && w.trim()) {
          return { tag: w.trim(), tool: (t && t.trim()) || tool || null };
        }
      } catch {}

      return { tag: null, tool: null, isUnresolvedShortLink: true };
    }

    return { tag, tool: tool || null };
  }

  // 1. Carregar estado local salvo
  const storage = await chrome.storage.local.get(['panelAuth', 'mlConnection']);
  const panelAuth = storage.panelAuth;
  const mlConn = storage.mlConnection;

  if (panelAuth && panelAuth.extensionToken) {
    panelPairStatus.textContent = `Pareado com ${panelAuth.userEmail || 'Painel'}`;
    panelPairStatus.className = 'value text-success';
    pairingForm.classList.add('hidden');
    consentSection.classList.remove('hidden');
  } else {
    panelPairStatus.textContent = 'Não Pareado';
    panelPairStatus.className = 'value text-warning';
    pairingForm.classList.remove('hidden');
    consentSection.classList.add('hidden');
  }

  if (mlConn && mlConn.status === 'conectado' && mlConn.affiliateTag) {
    setStatus('conectado', mlConn.affiliateTag);
    accountUser.textContent = mlConn.accountName || 'Conta Mercado Livre';
    lastSync.textContent = mlConn.lastSync ? new Date(mlConn.lastSync).toLocaleTimeString() : 'Hoje';
  } else {
    setStatus('desconectado');
    // Tentar pré-preencher se houver aba do Mercado Livre aberta
    const initialInspect = await inspectActiveMercadoLivreTab();
    if (initialInspect && initialInspect.isMercadoLivreTab) {
      if (initialInspect.affiliateTag && inputManualTag) {
        inputManualTag.value = initialInspect.affiliateTag;
      } else if (initialInspect.detectedSecLink && inputManualTag) {
        inputManualTag.value = initialInspect.detectedSecLink;
      } else if (initialInspect.suggestedNicknameTag && inputManualTag) {
        inputManualTag.value = initialInspect.suggestedNicknameTag;
      }
      if (initialInspect.mattTool && inputManualTool) {
        inputManualTool.value = initialInspect.mattTool;
      }
    }
  }

  // 2. Fluxo de Pareamento com o Painel via Código ou Cookie
  async function performPairing(code = '') {
    try {
      const res = await fetch(`${DASHBOARD_BASE_URL}/api/integrations/extension/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pairingCode: code }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        if (data.error) {
          showMessage(data.error, 'error');
        } else if (res.status === 401) {
          showMessage('Falha de autenticação (HTTP 401): Faça login no painel Radar de Ofertas antes de parear.', 'error');
        } else {
          showMessage('Erro ao parear com o painel Radar.', 'error');
        }
        await chrome.storage.local.remove(['panelAuth']);
        panelPairStatus.textContent = 'Não Pareado';
        panelPairStatus.className = 'value text-warning';
        pairingForm.classList.remove('hidden');
        consentSection.classList.add('hidden');
        return false;
      }

      await chrome.storage.local.set({
        panelAuth: {
          extensionToken: data.extensionToken,
          userId: data.userId,
          userEmail: data.userEmail,
          pairedAt: data.pairedAt,
        },
      });

      panelPairStatus.textContent = `Pareado com ${data.userEmail || 'Painel'}`;
      panelPairStatus.className = 'value text-success';
      pairingForm.classList.add('hidden');
      consentSection.classList.remove('hidden');
      showMessage('Extensão pareada com sucesso ao painel Radar de Ofertas!', 'success');
      return true;
    } catch {
      showMessage('Impossível conectar ao painel Radar em localhost:3000. Inicie o painel primeiro.', 'error');
      return false;
    }
  }

  btnPairPanel.addEventListener('click', async () => {
    const code = inputPairCode.value.trim();
    if (!code) {
      showMessage('Informe o código de pareamento gerado no painel.', 'error');
      return;
    }
    btnPairPanel.disabled = true;
    btnPairPanel.textContent = 'Pareando...';
    await performPairing(code);
    btnPairPanel.disabled = false;
    btnPairPanel.textContent = 'Parear';
  });

  btnPairCookie.addEventListener('click', async () => {
    btnPairCookie.textContent = 'Verificando sessão do painel...';
    await performPairing('');
    btnPairCookie.textContent = 'Ou parear com sessão ativa do navegador';
  });

  // 3. Consentimento e Conexão Real da Conta Mercado Livre
  btnConsent.addEventListener('click', async () => {
    btnConsent.disabled = true;
    btnConsent.textContent = 'Verificando Mercado Livre...';

    try {
      const currentStorage = await chrome.storage.local.get(['panelAuth']);
      const token = currentStorage.panelAuth?.extensionToken;

      if (!token) {
        showMessage('Realize o pareamento com o painel Radar primeiro antes de conectar o Mercado Livre.', 'error');
        setStatus('desconectado');
        return;
      }

      const mlData = await inspectActiveMercadoLivreTab();
      const manualRaw = inputManualTag ? inputManualTag.value.trim() : '';
      const manualToolRaw = inputManualTool ? inputManualTool.value.trim() : '';

      const extracted = await extractTagAndToolFromInput(
        manualRaw || mlData?.affiliateTag || mlData?.detectedSecLink || mlData?.suggestedNicknameTag || '',
        manualToolRaw || mlData?.mattTool || ''
      );

      const realTag = extracted.tag;
      const realTool = extracted.tool;

      if (!realTag) {
        showMessage(
          'Informe sua Tag de Afiliado (matt_word) no campo acima ou abra uma página do Mercado Livre com link de afiliado ativo.',
          'error'
        );
        setStatus('desconectado');
        return;
      }

      const accountName = mlData?.accountName || `Afiliado ML (${realTag})`;
      const now = new Date().toISOString();

      // Enviar handshake autenticado ao backend
      const res = await fetch(`${DASHBOARD_BASE_URL}/api/integrations/mercadolivre/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          affiliateTag: realTag,
          appId: realTool || undefined,
          authType: 'extension_session',
          accountName,
          verifiedAt: now,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          showMessage('Sessão expirada no painel Radar (HTTP 401). Realize o pareamento novamente.', 'error');
          setStatus('sessao_expirada');
        } else {
          showMessage(data.error || 'Falha ao registrar conexão no painel Radar.', 'error');
          setStatus('desconectado');
        }
        await chrome.storage.local.remove(['mlConnection']);
        return;
      }

      const connData = {
        status: 'conectado',
        affiliateTag: realTag,
        appId: realTool || null,
        accountName,
        lastSync: now,
      };

      await chrome.storage.local.set({ mlConnection: connData });
      setStatus('conectado', realTag);
      accountUser.textContent = accountName;
      lastSync.textContent = new Date(now).toLocaleTimeString();
      showMessage('Conta do Mercado Livre conectada com sucesso!', 'success');
    } catch {
      showMessage('Falha de comunicação com o servidor Radar.', 'error');
      setStatus('desconectado');
    } finally {
      btnConsent.disabled = false;
      btnConsent.textContent = 'Verificar e Conectar Mercado Livre';
    }
  });

  // 4. Capturar / Gerar Link Oficial da Página Atual
  btnGenerateCurrent.addEventListener('click', async () => {
    btnGenerateCurrent.disabled = true;
    btnGenerateCurrent.textContent = 'Capturando...';
    resultBox.classList.add('hidden');

    try {
      const currentStorage = await chrome.storage.local.get(['panelAuth', 'mlConnection']);
      const token = currentStorage.panelAuth?.extensionToken;
      const tag = currentStorage.mlConnection?.affiliateTag;

      if (!token) {
        showMessage('Extensão não pareada com o painel Radar. Faça o pareamento acima.', 'error');
        return;
      }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      if (!currentTab || !currentTab.url || !currentTab.url.includes('mercadolivre.com')) {
        showMessage('Navegue até a página de um produto no Mercado Livre para capturar o link.', 'error');
        return;
      }

      let pageData = {};
      try {
        pageData = (await chrome.tabs.sendMessage(currentTab.id, { action: 'GET_PRODUCT_DATA' })) || {};
      } catch {
        if (chrome.scripting) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: currentTab.id },
              files: ['content.js'],
            });
            pageData = (await chrome.tabs.sendMessage(currentTab.id, { action: 'GET_PRODUCT_DATA' })) || {};
          } catch {}
        }
      }

      const shortSecUrl = pageData.shortSecUrl || null;

      const res = await fetch(`${DASHBOARD_BASE_URL}/api/integrations/mercadolivre/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rawUrl: currentTab.url,
          shortSecUrl,
          affiliateTag: tag,
          title: pageData.title || currentTab.title || 'Produto Mercado Livre',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          showMessage('Autenticação expirada (HTTP 401). Faça o pareamento novamente.', 'error');
        } else {
          showMessage(data.error || 'Falha ao processar link no Mercado Livre.', 'error');
        }
        return;
      }

      resultUrl.value = data.affiliateUrl;
      resultBox.classList.remove('hidden');

      if (data.verificationStatus === 'verificado') {
        resultBadge.textContent = 'Confirmado pela Plataforma';
        resultBadge.className = 'status-badge badge-verified';
        resultSource.textContent = 'Mercado Livre /sec/';
        resultNotice.textContent = 'Link oficial comissionado capturado e auditado no cofre.';
        showMessage('Link oficial /sec/ capturado e confirmado no cofre de evidências!', 'success');
      } else {
        resultBadge.textContent = 'Revisão Manual Obrigatória';
        resultBadge.className = 'status-badge badge-warning';
        resultSource.textContent = 'Link Parametrizado';
        resultNotice.textContent =
          'Atenção: Link montado apenas por parâmetros de rastreamento. Sem confirmação de API pelo Mercado Livre; o envio automático está bloqueado até aprovação manual.';
        showMessage('Link montado registrado. Oferta em revisão manual obrigatória.', 'info');
      }
    } catch {
      showMessage('Erro ao processar captura de link.', 'error');
    } finally {
      btnGenerateCurrent.disabled = false;
      btnGenerateCurrent.textContent = '⚡ Capturar Link Oficial da Página Atual';
    }
  });

  // 5. Copiar resultado
  btnCopyResult.addEventListener('click', () => {
    resultUrl.select();
    navigator.clipboard.writeText(resultUrl.value);
    copyFeedback.classList.remove('hidden');
    setTimeout(() => {
      copyFeedback.classList.add('hidden');
    }, 2500);
  });

  // 6. Desconectar e Revogar
  btnDisconnect.addEventListener('click', async () => {
    if (!confirm('Deseja realmente desconectar e revogar a conexão com o Mercado Livre?')) {
      return;
    }

    const currentStorage = await chrome.storage.local.get(['panelAuth']);
    const token = currentStorage.panelAuth?.extensionToken;

    if (token) {
      try {
        await fetch(`${DASHBOARD_BASE_URL}/api/integrations/mercadolivre/disconnect`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }

    await chrome.storage.local.remove(['mlConnection']);
    setStatus('desconectado');
    showMessage('Conexão revogada com sucesso.', 'info');
  });
});
