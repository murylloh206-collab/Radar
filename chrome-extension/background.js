/* RADAR CONECTOR — service worker (MV3).
   Só define o endereço padrão do painel. Toda comunicação é feita pelo popup,
   com o token da extensão vinculado à conta do painel. */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['dashboardUrl'], res => {
    if (!res.dashboardUrl) chrome.storage.local.set({ dashboardUrl: 'https://painel-de-ofertas.vercel.app' });
  });
  chrome.storage.local.remove(['mlConnection']);
});
