/* ==============================================================================
   RADAR DE OFERTAS — BACKGROUND SERVICE WORKER (MANIFEST V3)
   ============================================================================== */

chrome.runtime.onInstalled.addListener(() => {
  // Inicialização do estado local
  chrome.storage.local.get(['mlConnection'], (res) => {
    if (!res.mlConnection) {
      chrome.storage.local.set({
        mlConnection: {
          status: 'desconectado',
          installedAt: new Date().toISOString(),
        },
      });
    }
  });
});
