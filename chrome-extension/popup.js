/* RADAR CONECTOR — popup (MV3, v2.2)
   1) Vincula a extensão à conta do painel (código de 8 letras → token).
   2) Na página da loja, lê os dados da tela e envia ao painel, que salva e testa na hora.
   3) Mostra o status real vindo do painel. Nunca clica em nada nas páginas das lojas. */
import {
  extractRakutenCredentials,
  extractRakutenSid,
  extractAmazonTag,
  extractShopeeCredentials,
  detectStorePage,
} from './extractors.js';

let DASHBOARD = 'https://painel-de-ofertas.vercel.app';
let token = null;
let currentStore = 'mercadolivre';
let statuses = {};

const STORES = {
  mercadolivre: { title: 'Mercado Livre', method: 'Pelo navegador', page: 'mercadolivre.com.br (logado como afiliado)', healthKey: 'mercadolivre' },
  shopee: { title: 'Shopee', method: 'Página Abrir API', page: 'affiliate.shopee.com.br/open_api', healthKey: 'shopee' },
  amazon: { title: 'Amazon', method: 'Página inicial do Associados', page: 'associados.amazon.com.br/home', healthKey: 'amazon' },
  netshoes: { title: 'Netshoes (Rakuten)', method: '2 páginas da Rakuten', page: 'developers.rakutenadvertising.com (Client ID/Secret) e publisher.rakutenadvertising.com (SID)', healthKey: 'netshoes' },
};

const $ = id => document.getElementById(id);
let toastTimer = null;
function toast(message, type = 'success') {
  const el = $('popupToast');
  if (toastTimer) clearTimeout(toastTimer);
  el.textContent = message;
  el.className = `cc-toast ${type}`;
  el.style.display = 'block';
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 8000);
}

async function api(path, init = {}) {
  const res = await fetch(`${DASHBOARD}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data?.code === 'EXTENSION_UNPAIRED') {
    token = null;
    await chrome.storage.local.remove(['extensionToken']);
    showPairing();
    throw new Error('Reconecte a extensão ao painel.');
  }
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `Erro HTTP ${res.status}`);
  return data;
}

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const opts = { timeZone: 'America/Sao_Paulo' };
  const day = d.toLocaleDateString('pt-BR', opts);
  const today = new Date().toLocaleDateString('pt-BR', opts);
  const time = d.toLocaleTimeString('pt-BR', { ...opts, hour: '2-digit', minute: '2-digit' });
  return day === today ? `testado hoje às ${time}` : `testado em ${day.slice(0, 5)} às ${time}`;
}

function statusLine(view) {
  if (!view) return '⚪ Não configurado — conecte pela página da loja.';
  const when = formatWhen(view.lastCheckedAt);
  if (view.status === 'ok') return `✅ Conectado${view.hint ? ` (${view.hint})` : ''} — ${when}`;
  if (view.status === 'falhou') return `❌ Falhou — ${view.reason || 'reconecte a loja.'}`;
  if (view.status === 'sem_teste') return `🟡 Tag salva${view.hint ? ` (${view.hint})` : ''} — a Amazon não permite teste sem API.`;
  return '⚪ Não configurado — conecte pela página da loja.';
}

function showPairing() {
  $('pairBox').hidden = false;
  $('storeArea').hidden = true;
  $('panelDot').className = 'cc-dot disconnected';
  $('pairedText').textContent = 'Extensão não vinculada';
}

function showStores() {
  $('pairBox').hidden = true;
  $('storeArea').hidden = false;
  $('panelDot').className = 'cc-dot';
  $('pairedText').textContent = 'Vinculada ao seu painel';
}

function renderStore(key) {
  currentStore = key;
  const cfg = STORES[key];
  document.querySelectorAll('.cc-shop-picker button').forEach(btn => {
    const active = btn.getAttribute('data-store') === key;
    btn.setAttribute('aria-pressed', String(active));
    btn.setAttribute('aria-checked', String(active));
  });
  $('storeTitle').textContent = cfg.title;
  $('storeMethod').textContent = cfg.method;
  $('storeCopy').textContent = `Abra ${cfg.page} já logado, depois clique em Conectar.`;
  $('btnStoreLabel').textContent = statuses[cfg.healthKey]?.status === 'ok' ? 'Reconectar' : 'Conectar';
  $('storeStatus').textContent = statusLine(statuses[cfg.healthKey]);
  $('manualFields').hidden = true;
  $('manualFields').innerHTML = '';
  chrome.storage.local.set({ selectedStore: key });
}

async function refreshStatus() {
  try {
    const data = await api('/api/extension/status');
    statuses = Object.fromEntries((data.stores || []).map(v => [v.store, v]));
  } catch (e) {
    if (token) toast(e.message, 'error');
  }
  if (token) renderStore(currentStore);
}

// Coleta feita DENTRO da aba da loja: só leitura de texto, tabelas e do campo store_id.
function collectPage() {
  const cell = el => (el.innerText || el.textContent || '').trim();
  const tables = [...document.querySelectorAll('table')].map(t => {
    let headers = [...t.querySelectorAll('thead th')].map(cell);
    let rows = [...t.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(cell));
    if (!headers.length) {
      const all = [...t.querySelectorAll('tr')];
      headers = all.length ? [...all[0].querySelectorAll('th,td')].map(cell) : [];
      rows = all.slice(1).map(tr => [...tr.querySelectorAll('td')].map(cell));
    }
    return { headers, rows };
  });
  return {
    url: location.href,
    text: (document.body?.innerText || '').slice(0, 20000),
    storeIdInput: document.querySelector('input[name="store_id"]')?.value || null,
    tables,
  };
}

async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return null;
  const page = detectStorePage(tab.url);
  if (!page || page === 'mercadolivre') return { page, data: null };
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPage });
  return { page, data: res?.result || null };
}

async function getMercadoLivreCookies() {
  const all = new Map();
  for (const domain of ['.mercadolivre.com.br', 'mercadolivre.com.br', 'www.mercadolivre.com.br', '.mercadolivre.com']) {
    try {
      for (const c of await chrome.cookies.getAll({ domain })) if (!all.has(c.name)) all.set(c.name, c.value);
    } catch {}
  }
  return [...all.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function showManualFields(fields, note, onSubmit) {
  const box = $('manualFields');
  box.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'cc-status';
  p.textContent = note;
  box.appendChild(p);
  for (const f of fields) {
    const label = document.createElement('label');
    label.textContent = f.label;
    const input = document.createElement('input');
    input.className = 'cc-input';
    input.id = `manual_${f.name}`;
    input.autocomplete = 'off';
    input.placeholder = f.placeholder || '';
    if (f.secret) input.type = 'password';
    label.appendChild(input);
    box.appendChild(label);
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cc-button cc-primary';
  btn.textContent = 'Enviar e testar';
  btn.addEventListener('click', async () => {
    const payload = { store: fields.store };
    for (const f of fields) {
      const v = $(`manual_${f.name}`).value.trim();
      if (v) payload[f.name] = v;
    }
    await (onSubmit ? onSubmit(payload) : sendConnect(payload));
  });
  box.appendChild(btn);
  box.hidden = false;
}

async function sendConnect(payload) {
  $('btnStoreAction').disabled = true;
  $('btnStoreLabel').textContent = 'Testando…';
  try {
    const data = await api('/api/extension/connect', { method: 'POST', body: JSON.stringify(payload) });
    const view = data.status;
    statuses[view.store] = view;
    toast(statusLine(view), view.status === 'falhou' ? 'error' : 'success');
    renderStore(currentStore);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    $('btnStoreAction').disabled = false;
    if (token) $('btnStoreLabel').textContent = statuses[STORES[currentStore].healthKey]?.status === 'ok' ? 'Reconectar' : 'Conectar';
  }
}

function manual(store, list, note) {
  const fields = list.map(f => ({ ...f }));
  fields.store = store;
  showManualFields(fields, note);
}

async function connectCurrent() {
  if (currentStore === 'mercadolivre') {
    const cookies = await getMercadoLivreCookies();
    if (!/(^|;\s*)ssid=/.test(cookies)) {
      toast('Não encontrei a sessão do Mercado Livre. Entre na sua conta de afiliado neste navegador e tente de novo.', 'error');
      return;
    }
    if (statuses.mercadolivre?.status === 'nao_configurado' || !statuses.mercadolivre) {
      const fields = [{ name: 'tag', label: 'Sua etiqueta de afiliado do Mercado Livre (só na primeira vez)', placeholder: 'ex.: seunome' }];
      fields.store = 'mercadolivre';
      showManualFields(fields, 'Informe sua etiqueta e clique em Enviar e testar.', p => sendConnect({ ...p, cookies }));
      return;
    }
    await sendConnect({ store: 'mercadolivre', cookies });
    return;
  }

  let read = null;
  try {
    read = await readActiveTab();
  } catch {
    read = null;
  }
  const page = read?.page;
  const data = read?.data;

  if (currentStore === 'shopee') {
    const creds = page === 'shopee' ? extractShopeeCredentials(data?.text) : null;
    if (creds) return sendConnect({ store: 'shopee', ...creds });
    return manual('shopee', [
      { name: 'appId', label: 'AppID', placeholder: 'só números' },
      { name: 'appSecret', label: 'Senha da API', secret: true },
    ], page === 'shopee'
      ? 'Não consegui ler o AppID e a Senha nesta página. Cole aqui:'
      : 'Abra affiliate.shopee.com.br/open_api e clique em Conectar de novo — ou cole aqui:');
  }

  if (currentStore === 'amazon') {
    const tag = page === 'amazon' ? extractAmazonTag(data?.storeIdInput, data?.text) : null;
    if (tag) return sendConnect({ store: 'amazon', tag });
    return manual('amazon', [{ name: 'tag', label: 'Sua tag de associado', placeholder: 'ex.: seunome-20' }],
      page === 'amazon' ? 'Não achei a tag nesta página. Cole aqui:' : 'Abra associados.amazon.com.br/home e clique em Conectar de novo — ou cole aqui:');
  }

  if (currentStore === 'netshoes') {
    if (page === 'rakuten_dev') {
      const creds = (data?.tables || []).map(extractRakutenCredentials).find(Boolean);
      if (creds) return sendConnect({ store: 'rakuten', ...creds });
    }
    if (page === 'rakuten_publisher') {
      const sid = extractRakutenSid(data?.text);
      if (sid) return sendConnect({ store: 'rakuten', sid });
    }
    return manual('rakuten', [
      { name: 'clientId', label: 'Client ID' },
      { name: 'clientSecret', label: 'Client Secret', secret: true },
      { name: 'sid', label: 'SID (ID do Site)', placeholder: 'só números' },
    ], page && page.startsWith('rakuten')
      ? 'Não consegui ler esta página. Cole os dados aqui:'
      : 'Abra a página de desenvolvedor da Rakuten (Client ID/Secret) e a do publisher (SID), clicando em Conectar em cada uma — ou cole aqui:');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['dashboardUrl', 'extensionToken', 'selectedStore']);
  if (stored.dashboardUrl) {
    DASHBOARD = stored.dashboardUrl;
    $('selectDashboardUrl').value = stored.dashboardUrl;
  }
  if (stored.selectedStore && STORES[stored.selectedStore]) currentStore = stored.selectedStore;
  token = stored.extensionToken || null;

  document.querySelectorAll('.cc-shop-picker button').forEach(btn =>
    btn.addEventListener('click', () => renderStore(btn.getAttribute('data-store'))));

  $('btnStoreAction').addEventListener('click', () => connectCurrent().catch(e => toast(e.message, 'error')));

  $('btnPair').addEventListener('click', async () => {
    const code = $('pairCode').value.trim();
    if (!code) return toast('Cole o código que aparece no painel.', 'error');
    try {
      const data = await api('/api/extension/pair', { method: 'POST', body: JSON.stringify({ code }) });
      token = data.token;
      await chrome.storage.local.set({ extensionToken: token });
      showStores();
      toast('Extensão vinculada à sua conta do painel.', 'success');
      await refreshStatus();
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  $('selectDashboardUrl').addEventListener('change', async e => {
    DASHBOARD = e.target.value;
    token = null;
    await chrome.storage.local.set({ dashboardUrl: DASHBOARD });
    await chrome.storage.local.remove(['extensionToken']);
    showPairing();
    toast('Servidor alterado. Vincule a extensão de novo.', 'success');
  });

  const openPanel = () => chrome.tabs.create({ url: `${DASHBOARD}/conexoes?aba=lojas` });
  $('btnManagePanel').addEventListener('click', openPanel);
  $('btnHelp').addEventListener('click', openPanel);

  if (!token) {
    showPairing();
    return;
  }
  showStores();
  renderStore(currentStore);
  await refreshStatus();
});
