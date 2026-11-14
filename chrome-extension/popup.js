/* RADAR CONECTOR — popup (MV3, v2.3)
   - Vincula sozinho quando o painel está logado neste navegador (código só como reserva).
   - Na página de uma loja, oferece "Conectar agora"; fora dela, cada loja tem o link direto da página certa.
   - Mostra o status real vindo do painel. Nunca clica em nada nas páginas das lojas. */
import {
  extractRakutenCredentials,
  extractRakutenCredentialsFromText,
  extractRakutenSid,
  extractAmazonTag,
  extractShopeeCredentials,
  detectStorePage,
} from './extractors.js';

let DASHBOARD = 'https://painel-de-ofertas.vercel.app';
let token = null;
let statuses = {};
let activePage = null; // { page, tabId }

const PAGES = {
  shopee: 'https://affiliate.shopee.com.br/open_api',
  amazon: 'https://associados.amazon.com.br/home',
  rakuten_dev: 'https://developers.rakutenadvertising.com/default/dashboard/',
  rakuten_publisher: 'https://publisher.rakutenadvertising.com/',
  mercadolivre: 'https://www.mercadolivre.com.br/afiliados',
};

const STORES = [
  { key: 'mercadolivre', name: 'Mercado Livre', link: PAGES.mercadolivre, linkText: 'Abrir Mercado Livre ↗' },
  { key: 'shopee', name: 'Shopee', link: PAGES.shopee, linkText: 'Abrir página da API ↗' },
  { key: 'amazon', name: 'Amazon', link: PAGES.amazon, linkText: 'Abrir Associados ↗' },
  { key: 'netshoes', name: 'Netshoes', link: null, linkText: '' },
];

const HERE = {
  mercadolivre: { title: 'Você está no Mercado Livre', hint: 'Vamos usar a sua sessão de afiliado deste navegador.' },
  shopee: { title: 'Você está na página da API da Shopee', hint: 'Vamos ler o AppID e a Senha desta tela.' },
  amazon: { title: 'Você está no Amazon Associados', hint: 'Vamos ler a sua tag (…-20) desta tela.' },
  rakuten_dev: { title: 'Netshoes, passo 1 de 2', hint: 'Vamos ler o Client ID e o Client Secret desta tela.' },
  rakuten_publisher: { title: 'Netshoes, passo 2 de 2', hint: 'Vamos ler o seu SID desta tela.' },
};

const $ = id => document.getElementById(id);
const openTab = url => chrome.tabs.create({ url });

function toast(message, type = 'ok') {
  const el = $('toast');
  el.textContent = message;
  el.className = `rc-toast${type === 'error' ? ' error' : ''}`;
  el.hidden = false;
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
    throw new Error('A extensão foi desvinculada. Vincule de novo.');
  }
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}

// ---------- vínculo ----------
async function autoPair() {
  try {
    const res = await fetch(`${DASHBOARD}/api/integrations/extension/pair-code`, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return false;
    const { code } = await res.json();
    if (!code) return false;
    return await pairWith(code);
  } catch {
    return false;
  }
}

async function pairWith(code) {
  const data = await api('/api/extension/pair', { method: 'POST', body: JSON.stringify({ code }) });
  token = data.token;
  await chrome.storage.local.set({ extensionToken: token });
  return true;
}

function showPairing() {
  $('pairBox').hidden = false;
  $('stores').hidden = true;
  $('here').hidden = true;
  $('linkState').textContent = 'Não vinculada ao painel';
  $('linkState').className = 'rc-link-state';
}

async function showConnected() {
  $('pairBox').hidden = true;
  $('stores').hidden = false;
  $('linkState').textContent = 'Vinculada à sua conta';
  $('linkState').className = 'rc-link-state ok';
  await refreshStatus();
  await detectActivePage();
}

// ---------- status ----------
function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const opts = { timeZone: 'America/Sao_Paulo' };
  const time = d.toLocaleTimeString('pt-BR', { ...opts, hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', opts) === new Date().toLocaleDateString('pt-BR', opts)
    ? `testada hoje às ${time}`
    : `testada em ${d.toLocaleDateString('pt-BR', opts).slice(0, 5)} às ${time}`;
}

function statusOf(view) {
  if (!view || view.status === 'nao_configurado') return { cls: '', text: 'Não conectada' };
  if (view.status === 'ok') {
    if (view.lastCheckedAt && Date.now() - Date.parse(view.lastCheckedAt) > 26 * 3600e3) return { cls: 'warn', text: 'Teste atrasado. Teste pelo painel.' };
    return { cls: 'ok', text: `Conectada, ${formatWhen(view.lastCheckedAt)}` };
  }
  if (view.status === 'sem_teste') {
    return view.store === 'amazon' ? { cls: 'ok', text: 'Tag salva (a Amazon não permite teste)' } : { cls: 'warn', text: 'Ainda não testada' };
  }
  return { cls: 'fail', text: view.reason || 'Falhou. Conecte de novo.' };
}

function netshoesSteps(view) {
  if (!view || view.status === 'nao_configurado') return { step1: false, step2: false };
  if (view.status === 'ok') return { step1: true, step2: true };
  const reason = view.reason || '';
  return { step1: !/desenvolvedor/i.test(reason), step2: !/publisher/i.test(reason) };
}

function storeLink(text, url, className) {
  const a = document.createElement('a');
  a.href = url;
  a.textContent = text;
  if (className) a.className = className;
  a.addEventListener('click', e => { e.preventDefault(); openTab(url); });
  return a;
}

function renderStores() {
  const box = $('stores');
  box.innerHTML = '';
  for (const s of STORES) {
    const view = statuses[s.key];
    const st = statusOf(view);
    const row = document.createElement('div');
    row.className = 'rc-store';
    const name = document.createElement('span');
    name.className = 'rc-store-name';
    name.textContent = s.name;
    const status = document.createElement('span');
    status.className = `rc-store-status ${st.cls}`;
    status.textContent = st.text;
    row.append(name);
    if (s.key !== 'netshoes') {
      row.append(storeLink(view?.status === 'ok' ? 'Reconectar ↗' : s.linkText, s.link, 'rc-store-go'));
      row.append(status);
    } else {
      row.append(status);
      const { step1, step2 } = netshoesSteps(view);
      const ol = document.createElement('ol');
      ol.className = 'rc-steps';
      for (const [done, label, url] of [
        [step1, '1. Client ID e Secret (Rakuten Developers)', PAGES.rakuten_dev],
        [step2, '2. SID (painel do publisher)', PAGES.rakuten_publisher],
      ]) {
        const li = document.createElement('li');
        li.className = done ? 'done' : '';
        const t = document.createElement('span');
        t.textContent = `${done ? '✓' : '○'} ${label}`;
        li.append(t, storeLink(done ? 'refazer ↗' : 'abrir ↗', url));
        ol.append(li);
      }
      row.append(ol);
    }
    box.append(row);
  }
}

async function refreshStatus() {
  try {
    const data = await api('/api/extension/status');
    statuses = Object.fromEntries((data.stores || []).map(v => [v.store, v]));
  } catch (e) {
    toast(e.message, 'error');
  }
  renderStores();
}

// ---------- página atual ----------
async function detectActivePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const page = tab?.url ? detectStorePage(tab.url) : null;
  activePage = page ? { page, tabId: tab.id } : null;
  $('here').hidden = !activePage;
  if (activePage) {
    $('hereTitle').textContent = HERE[page].title;
    $('hereHint').textContent = HERE[page].hint;
  }
}

// Roda DENTRO da aba da loja: só lê. Espera a tabela aparecer (páginas que carregam depois).
async function collectPage() {
  const cell = el => (el.innerText || el.textContent || '').trim();
  const readTables = () =>
    [...document.querySelectorAll('table')].map(t => {
      let headers = [...t.querySelectorAll('thead th')].map(cell);
      let rows = [...t.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(cell));
      if (!headers.length) {
        const all = [...t.querySelectorAll('tr')];
        headers = all.length ? [...all[0].querySelectorAll('th,td')].map(cell) : [];
        rows = all.slice(1).map(tr => [...tr.querySelectorAll('td')].map(cell));
      }
      return { headers, rows };
    });
  const needsTable = location.hostname === 'developers.rakutenadvertising.com';
  for (let i = 0; needsTable && i < 12 && !document.querySelector('table tbody tr'); i++) {
    await new Promise(r => setTimeout(r, 500));
  }
  return {
    text: (document.body?.innerText || '').slice(0, 20000),
    storeIdInput: document.querySelector('input[name="store_id"]')?.value || null,
    tables: readTables(),
  };
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

function showManual(store, fields, note, extra = {}) {
  const box = $('manualFields');
  box.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = note;
  box.append(p);
  for (const f of fields) {
    const label = document.createElement('label');
    label.textContent = f.label;
    const input = document.createElement('input');
    input.id = `manual_${f.name}`;
    input.autocomplete = 'off';
    input.placeholder = f.placeholder || '';
    if (f.secret) input.type = 'password';
    label.append(input);
    box.append(label);
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rc-btn rc-btn-main';
  btn.textContent = 'Conectar';
  btn.addEventListener('click', () => {
    const payload = { store, ...extra };
    for (const f of fields) {
      const v = $(`manual_${f.name}`).value.trim();
      if (v) payload[f.name] = v;
    }
    sendConnect(payload);
  });
  box.append(btn);
  box.hidden = false;
  box.querySelector('input')?.focus();
}

async function sendConnect(payload) {
  $('hereConnect').disabled = true;
  $('hereConnect').textContent = 'Testando…';
  try {
    const data = await api('/api/extension/connect', { method: 'POST', body: JSON.stringify(payload) });
    const view = data.status;
    statuses[view.store] = view;
    $('manualFields').hidden = true;
    const st = statusOf(view);
    const name = STORES.find(s => s.key === view.store)?.name || 'Loja';
    toast(view.notice || `${name}: ${st.text}`, st.cls === 'fail' ? 'error' : 'ok');
    renderStores();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    $('hereConnect').disabled = false;
    $('hereConnect').textContent = 'Conectar agora';
  }
}

async function connectHere() {
  if (!activePage) return;
  const { page, tabId } = activePage;
  $('manualFields').hidden = true;

  if (page === 'mercadolivre') {
    const cookies = await getMercadoLivreCookies();
    if (!/(^|;\s*)ssid=/.test(cookies)) return toast('Entre na sua conta do Mercado Livre neste navegador e tente de novo.', 'error');
    if (!statuses.mercadolivre || statuses.mercadolivre.status === 'nao_configurado') {
      return showManual('mercadolivre', [{ name: 'tag', label: 'Sua etiqueta de afiliado (só na primeira vez)', placeholder: 'ex.: seunome' }],
        'Falta só a sua etiqueta de afiliado do Mercado Livre.', { cookies });
    }
    return sendConnect({ store: 'mercadolivre', cookies });
  }

  let data = null;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: collectPage });
    data = res?.result || null;
  } catch {
    data = null;
  }

  if (page === 'shopee') {
    const c = extractShopeeCredentials(data?.text);
    return c ? sendConnect({ store: 'shopee', ...c })
      : showManual('shopee', [{ name: 'appId', label: 'AppID' }, { name: 'appSecret', label: 'Senha da API', secret: true }],
        'Não achei o AppID e a Senha nesta tela. Copie de "Meu API" e cole aqui:');
  }
  if (page === 'amazon') {
    const tag = extractAmazonTag(data?.storeIdInput, data?.text);
    return tag ? sendConnect({ store: 'amazon', tag })
      : showManual('amazon', [{ name: 'tag', label: 'Sua tag de associado', placeholder: 'seunome-20' }], 'Não achei a tag nesta tela. Cole aqui:');
  }
  if (page === 'rakuten_dev') {
    const c = (data?.tables || []).map(extractRakutenCredentials).find(Boolean) || extractRakutenCredentialsFromText(data?.text);
    return c ? sendConnect({ store: 'rakuten', ...c })
      : showManual('rakuten', [{ name: 'clientId', label: 'Client ID' }, { name: 'clientSecret', label: 'Client Secret', secret: true }],
        'Não consegui ler a tabela "API Credentials". Copie os dois valores e cole aqui:');
  }
  if (page === 'rakuten_publisher') {
    const sid = extractRakutenSid(data?.text);
    return sid ? sendConnect({ store: 'rakuten', sid })
      : showManual('rakuten', [{ name: 'sid', label: 'SID (ID do Site)', placeholder: 'só números' }],
        'Não achei o SID. Ele aparece ao clicar no seu nome, no canto superior direito. Cole aqui:');
  }
}

// ---------- início ----------
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['dashboardUrl', 'extensionToken']);
  if (stored.dashboardUrl) {
    DASHBOARD = stored.dashboardUrl;
    $('selectDashboardUrl').value = stored.dashboardUrl;
  }
  token = stored.extensionToken || null;

  $('openPanel').addEventListener('click', e => { e.preventDefault(); openTab(`${DASHBOARD}/conexoes?aba=lojas`); });
  $('openLogin').addEventListener('click', e => { e.preventDefault(); openTab(`${DASHBOARD}/login?redirect=/conexoes`); });
  $('retryPair').addEventListener('click', async () => {
    if (await autoPair()) return showConnected();
    toast('Ainda não encontrei o painel logado. Entre no painel neste navegador e clique de novo.', 'error');
  });
  $('btnPair').addEventListener('click', async () => {
    try {
      await pairWith($('pairCode').value.trim());
      await showConnected();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  $('hereConnect').addEventListener('click', () => connectHere().catch(e => toast(e.message, 'error')));
  $('selectDashboardUrl').addEventListener('change', async e => {
    DASHBOARD = e.target.value;
    token = null;
    await chrome.storage.local.set({ dashboardUrl: DASHBOARD });
    await chrome.storage.local.remove(['extensionToken']);
    if (await autoPair()) return showConnected();
    showPairing();
  });

  if (token || (await autoPair())) return showConnected();
  showPairing();
});
