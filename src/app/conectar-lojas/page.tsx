'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Store,
  ShieldCheck,
  Key,
  Lock,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Download,
  Copy,
  Check,
  Eye,
  EyeOff,
  Clock,
  Sparkles,
  Link2,
  Laptop,
  Smartphone,
  ChevronRight,
  Info,
} from 'lucide-react';
import { SafeVaultStatus } from '@/lib/server/credentials-vault';
import { LinkEvidenceRecord } from '@/lib/server/link-evidence';

export default function ConectarLojasPage() {
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [stores, setStores] = useState<SafeVaultStatus[]>([]);
  const [evidenceList, setEvidenceList] = useState<LinkEvidenceRecord[]>([]);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal com instruções de instalação da extensão Chrome
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [pairingCode, setPairingCode] = useState<string>('');
  const [loadingPairCode, setLoadingPairCode] = useState(false);

  // Controles de visibilidade de senha/token
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Estados dos formulários de cada loja
  const [mlForm, setMlForm] = useState({
    affiliateTag: '',
    appId: '',
    cookieString: '',
  });

  const [shopeeForm, setShopeeForm] = useState({
    appId: '',
    appSecret: '',
    subId: '',
  });

  const [rakutenForm, setRakutenForm] = useState({
    token: '',
    advertiserId: '',
    siteId: '',
  });

  // Estados de teste em andamento
  const [testingShopee, setTestingShopee] = useState(false);
  const [testingRakuten, setTestingRakuten] = useState(false);
  const [testingMl, setTestingMl] = useState(false);

  // Resultados dos testes de conexão
  const [testResults, setTestResults] = useState<
    Record<
      string,
      {
        verified: boolean;
        message: string;
        limitationWarning?: string;
        testGeneratedLink?: string;
        isAutoDispatchAllowed?: boolean;
        confirmationSource?: string;
      }
    >
  >({});

  // Teste de produto real
  const [testProductUrl, setTestProductUrl] = useState({
    mercadolivre: 'https://www.mercadolivre.com.br/p/MLB12345678',
    shopee: 'https://shopee.com.br/product/123/456',
    netshoes: 'https://www.netshoes.com.br/tenis-nike-revolution-7-masculino-preto+branco-JD8-5683-026',
  });

  const [convertingStore, setConvertingStore] = useState<string | null>(null);
  const [conversionResults, setConversionResults] = useState<
    Record<
      string,
      {
        affiliateUrl: string;
        cleanUrl: string;
        isAutoDispatchAllowed: boolean;
        confirmationSource: string;
      }
    >
  >({});

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const showNotification = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(id);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Carrega status das credenciais e evidências
  const loadVaultData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/integrations/vault');
      const data = await res.json();

      if (res.status === 401 || data.code === 'SESSION_EXPIRED') {
        setSessionExpired(true);
        return;
      }

      if (data.ok) {
        setStores(data.stores || []);
        setEvidenceList(data.recentEvidence || []);

        // Pré-preenche os formulários se já houver dados públicos
        const mlData = data.stores?.find((s: SafeVaultStatus) => s.storeName === 'mercadolivre');
        if (mlData) {
          setMlForm((prev) => ({
            ...prev,
            affiliateTag: mlData.tagIdentified || mlData.affiliateTag || '',
            appId: mlData.appId || '',
          }));
        }

        const shopeeData = data.stores?.find((s: SafeVaultStatus) => s.storeName === 'shopee');
        if (shopeeData) {
          setShopeeForm((prev) => ({
            ...prev,
            appId: shopeeData.appId || '',
            subId: shopeeData.affiliateTag || '',
          }));
        }

        const rakutenData = data.stores?.find((s: SafeVaultStatus) => s.storeName === 'netshoes');
        if (rakutenData) {
          setRakutenForm((prev) => ({
            ...prev,
            advertiserId: rakutenData.appId || '',
            siteId: rakutenData.affiliateTag || '',
          }));
        }
      }
    } catch {
      showNotification('Não foi possível carregar os dados de conexão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchPairingCode = async () => {
    try {
      setLoadingPairCode(true);
      const res = await fetch('/api/integrations/extension/pair-code');
      const data = await res.json();
      if (data.ok && data.code) {
        setPairingCode(data.code);
      }
    } catch {
      // Silencioso no carregamento inicial
    } finally {
      setLoadingPairCode(false);
    }
  };

  useEffect(() => {
    loadVaultData();
    fetchPairingCode();
  }, []);

  // 1. Teste de Conexão Shopee (Open API GraphQL)
  const handleTestShopee = async () => {
    setTestingShopee(true);
    try {
      const res = await fetch('/api/copier/affiliates/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: 'shopee',
          credentials: {
            appId: shopeeForm.appId,
            appSecret: shopeeForm.appSecret,
            affiliateTag: shopeeForm.subId,
            isActive: true,
          },
        }),
      });

      const data = await res.json();
      if (res.status === 401 || data.code === 'SESSION_EXPIRED') {
        setSessionExpired(true);
        return;
      }

      setTestResults((prev) => ({
        ...prev,
        shopee: {
          verified: Boolean(data.isValidated),
          message: data.message || 'Teste concluído.',
          limitationWarning: data.limitationWarning,
          testGeneratedLink: data.testGeneratedLink,
          isAutoDispatchAllowed: Boolean(data.isValidated),
          confirmationSource: data.validationMethod,
        },
      }));

      if (data.isValidated) {
        showNotification('Shopee Open API validada com sucesso!', 'success');
      } else {
        showNotification(data.limitationWarning || data.message || 'Validação pendente.', 'info');
      }
      loadVaultData();
    } catch {
      showNotification('Falha de rede ao contatar a API da Shopee.', 'error');
    } finally {
      setTestingShopee(false);
    }
  };

  // 2. Teste de Conexão Rakuten / Netshoes (Deep Links API)
  const handleTestRakuten = async () => {
    setTestingRakuten(true);
    try {
      const res = await fetch('/api/integrations/rakuten/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rakutenForm.token,
          advertiserId: rakutenForm.advertiserId,
          siteId: rakutenForm.siteId,
        }),
      });

      const data = await res.json();
      if (res.status === 401 || data.code === 'SESSION_EXPIRED') {
        setSessionExpired(true);
        return;
      }

      setTestResults((prev) => ({
        ...prev,
        netshoes: {
          verified: Boolean(data.verified),
          message: data.message || 'Teste finalizado.',
          limitationWarning: data.limitationWarning,
          testGeneratedLink: data.testGeneratedLink,
          isAutoDispatchAllowed: Boolean(data.isAutoDispatchAllowed),
          confirmationSource: data.confirmationSource,
        },
      }));

      if (data.verified) {
        showNotification('Rakuten Advertising Deep Links API validada com sucesso!', 'success');
      } else {
        showNotification(data.limitationWarning || 'Credenciais salvas em modo de revisão manual.', 'info');
      }
      loadVaultData();
    } catch {
      showNotification('Falha de rede ao contatar a Rakuten Advertising.', 'error');
    } finally {
      setTestingRakuten(false);
    }
  };

  // 3. Teste / Reconexão / Salvamento Direto Mercado Livre
  const handleSaveMlDirect = async () => {
    const rawTag = mlForm.affiliateTag.trim();
    const rawTool = mlForm.appId.trim();
    if (!rawTag) {
      showNotification('Informe sua Tag de Afiliado (matt_word) do Mercado Livre.', 'error');
      return;
    }

    setTestingMl(true);
    try {
      let extractedTag = rawTag;
      let extractedTool = rawTool;

      if (rawTag.startsWith('http://') || rawTag.startsWith('https://') || rawTag.includes('matt_word=')) {
        try {
          const u = new URL(rawTag.startsWith('http') ? rawTag : `https://${rawTag}`);
          const w = u.searchParams.get('matt_word');
          const t = u.searchParams.get('matt_tool');
          if (w && w.trim()) extractedTag = w.trim();
          if (t && t.trim() && !extractedTool) extractedTool = t.trim();
        } catch {}
      }

      const res = await fetch('/api/integrations/mercadolivre/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affiliateTag: extractedTag,
          appId: extractedTool || undefined,
          cookieString: mlForm.cookieString.trim() || undefined,
          accountName: `Afiliado ML (${extractedTag})`,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setSessionExpired(true);
        return;
      }

      if (data.ok) {
        showNotification(`Mercado Livre conectado com a tag "${data.affiliateTag}"!`, 'success');
        loadVaultData();
      } else {
        showNotification(data.error || 'Falha ao salvar tag do Mercado Livre.', 'error');
      }
    } catch {
      showNotification('Falha ao salvar credenciais do Mercado Livre.', 'error');
    } finally {
      setTestingMl(false);
    }
  };

  const handleRefreshMl = async () => {
    setTestingMl(true);
    try {
      const res = await fetch('/api/integrations/mercadolivre/status');
      const data = await res.json();
      if (res.status === 401) {
        setSessionExpired(true);
        return;
      }

      if (data.ok) {
        showNotification(`Status do Mercado Livre: ${data.status.toUpperCase()}`, 'info');
      }
      loadVaultData();
    } catch {
      showNotification('Não foi possível verificar status da extensão.', 'error');
    } finally {
      setTestingMl(false);
    }
  };

  // 4. Testar Conversão de Produto Real
  const handleConvertProduct = async (store: 'mercadolivre' | 'shopee' | 'netshoes') => {
    setConvertingStore(store);
    const url = testProductUrl[store];

    try {
      if (store === 'mercadolivre') {
        const res = await fetch('/api/integrations/mercadolivre/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawUrl: url, title: 'Produto Real Teste ML' }),
        });
        const data = await res.json();
        if (data.ok) {
          setConversionResults((prev) => ({
            ...prev,
            mercadolivre: {
              affiliateUrl: data.affiliateUrl,
              cleanUrl: data.cleanUrl,
              isAutoDispatchAllowed: true,
              confirmationSource: 'mercadolivre_extension_session',
            },
          }));
          showNotification('Link gerado com evidência de sessão da extensão!', 'success');
        } else {
          showNotification(data.error || 'Falha ao converter link.', 'error');
        }
      } else {
        // Conversão via rota oficial com credenciais descriptografadas do cofre
        const res = await fetch('/api/converter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
          }),
        });

        const data = await res.json();
        if (data.ok && data.data?.affiliateUrl) {
          setConversionResults((prev) => ({
            ...prev,
            [store]: {
              affiliateUrl: data.data.affiliateUrl,
              cleanUrl: data.data.cleanUrl || url,
              isAutoDispatchAllowed: Boolean(data.data.isAutoDispatchAllowed),
              confirmationSource: data.data.meta?.verificationReason || 'API',
            },
          }));
          showNotification('Conversão efetuada com sucesso!', 'success');
        } else {
          showNotification(data.error || data.data?.error || 'Falha na conversão.', 'error');
        }
      }
      loadVaultData();
    } catch {
      showNotification('Falha de rede ao converter link.', 'error');
    } finally {
      setConvertingStore(null);
    }
  };

  const mlStore = stores.find((s) => s.storeName === 'mercadolivre');
  const shopeeStore = stores.find((s) => s.storeName === 'shopee');
  const netshoesStore = stores.find((s) => s.storeName === 'netshoes');

  return (
    <div className="min-h-screen bg-[#061225] text-[#F8FBFF] pb-24 md:pb-12 pt-4 px-3 sm:px-6 max-w-7xl mx-auto space-y-6">
      {/* Banner de Sessão Expirada */}
      {sessionExpired && (
        <div className="p-4 rounded-2xl bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#FBBF24] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl animate-pulse">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">Sua sessão expirou por segurança</p>
              <p className="text-xs text-[#FBBF24]/80">
                Para proteger suas chaves e credenciais criptografadas, faça login novamente.
              </p>
            </div>
          </div>
          <Link
            href="/login?redirect=/conectar-lojas&expired=true"
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#F59E0B] text-[#061225] font-bold text-xs hover:bg-[#F59E0B]/90 transition-all text-center flex-shrink-0"
          >
            Fazer Login e Retornar
          </Link>
        </div>
      )}

      {/* Header do Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#18334D] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1CCAF2] mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Módulo de Integrações & SaaS</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
            Conectar Lojas e Afiliados
          </h1>
          <p className="text-xs sm:text-sm text-[#8EADC7] mt-1 max-w-2xl">
            Gerencie credenciais oficiais com criptografia AES-256-GCM, teste conexões em tempo real e audite evidências de comissão sem dados fictícios.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadVaultData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-[#0D1B31] border border-[#18334D] text-xs font-semibold text-[#8EADC7] hover:text-[#F8FBFF] hover:border-[#1CCAF2] transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={() => setShowExtensionModal(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] text-xs font-bold hover:opacity-95 transition-opacity flex items-center gap-2 shadow-lg shadow-[#1CCAF2]/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Extensão Chrome</span>
          </button>
        </div>
      </div>

      {/* Notificação Toast */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-[#22C55E]/15 border-[#22C55E]/30 text-[#4ADE80]'
              : feedback.type === 'error'
              ? 'bg-[#EF4444]/15 border-[#EF4444]/30 text-[#F87171]'
              : 'bg-[#0879DF]/15 border-[#0879DF]/30 text-[#93C5FD]'
          }`}
        >
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Grade Principal de Lojas (Mobile First) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* =================================================================== */}
        {/* 1. MERCADO LIVRE (VIA EXTENSÃO CHROME) */}
        {/* =================================================================== */}
        <div className="bg-[#0D1B31] border border-[#18334D] rounded-2xl p-5 flex flex-col justify-between space-y-5 relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFE600]/10 border border-[#FFE600]/30 flex items-center justify-center font-black text-[#FFE600] text-sm">
                  ML
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#F8FBFF]">Mercado Livre</h3>
                  <span className="text-[11px] text-[#8EADC7]">Conector Extensão Chrome V3</span>
                </div>
              </div>

              {/* Status Badge */}
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 ${
                  mlStore?.connectionStatus === 'conectado'
                    ? 'bg-[#22C55E]/15 text-[#4ADE80] border-[#22C55E]/30'
                    : mlStore?.connectionStatus === 'sessao_expirada'
                    ? 'bg-[#F59E0B]/15 text-[#FBBF24] border-[#F59E0B]/30'
                    : 'bg-[#8EADC7]/15 text-[#8EADC7] border-[#8EADC7]/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    mlStore?.connectionStatus === 'conectado'
                      ? 'bg-[#4ADE80]'
                      : mlStore?.connectionStatus === 'sessao_expirada'
                      ? 'bg-[#FBBF24]'
                      : 'bg-[#8EADC7]'
                  }`}
                />
                {mlStore?.connectionStatus === 'conectado'
                  ? 'Conectado'
                  : mlStore?.connectionStatus === 'sessao_expirada'
                  ? 'Sessão Expirada'
                  : 'Desconectado'}
              </span>
            </div>

            {/* Explicação de Arquitetura e Browser-Assisted */}
            <div className="p-3 rounded-xl bg-[#061225] border border-[#18334D] space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[#8EADC7]">
                <span>Tag Identificada (matt_word):</span>
                <span className="font-mono text-[#1CCAF2] font-semibold">
                  {mlStore?.tagIdentified || mlStore?.affiliateTag || 'Pendente'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#8EADC7]">
                <span>Última Verificação:</span>
                <span className="text-[#F8FBFF]">
                  {mlStore?.lastVerifiedAt
                    ? new Date(mlStore.lastVerifiedAt).toLocaleString('pt-BR')
                    : 'Não verificada'}
                </span>
              </div>
            </div>

            {/* Aviso Obrigatório de Dependência do Chrome */}
            <div className="p-3 rounded-xl bg-[#0879DF]/10 border border-[#0879DF]/30 text-xs text-[#93C5FD] flex items-start gap-2">
              <Laptop className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Operação com Chrome aberto:</strong> Por regras do Mercado Livre e da Chrome Web Store, sua sessão permanece no navegador e os links confirmados são gerados sob demanda via extensão.
              </span>
            </div>

            {/* Código de Pareamento da Extensão Chrome */}
            <div className="p-3 rounded-xl bg-[#061225] border border-[#1CCAF2]/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#1CCAF2]">
                  Código de Pareamento da Extensão:
                </span>
                <button
                  type="button"
                  onClick={fetchPairingCode}
                  disabled={loadingPairCode}
                  className="text-[11px] text-[#8EADC7] hover:text-[#F8FBFF] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingPairCode ? 'animate-spin' : ''}`} />
                  <span>Gerar novo</span>
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 bg-[#0D1B31] border border-[#18334D] rounded-lg px-3 py-2">
                <span className="font-mono text-sm font-black tracking-widest text-[#F8FBFF]">
                  {pairingCode || 'Gerando...'}
                </span>
                {pairingCode && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(pairingCode, 'pair_code')}
                    className="px-2.5 py-1 rounded-md bg-[#1CCAF2]/15 text-[#1CCAF2] hover:bg-[#1CCAF2]/25 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedUrl === 'pair_code' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#4ADE80]" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Código</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[#8EADC7]">
                Cole este código <strong>RDR-...</strong> na extensão do Chrome (ou clique em <em>"Ou parear com sessão ativa do navegador"</em> no popup da extensão).
              </p>
            </div>

            {/* Configuração Direta da Tag Mercado Livre no Painel */}
            <div className="space-y-2.5 pt-2 border-t border-[#18334D]">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7] block mb-1">
                  Tag de Afiliado (matt_word) ou Link Afiliado ML:
                </label>
                <input
                  type="text"
                  value={mlForm.affiliateTag}
                  onChange={(e) => setMlForm((p) => ({ ...p, affiliateTag: e.target.value }))}
                  placeholder="Ex: muryllo2026 ou link com matt_word=..."
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:border-[#1CCAF2] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7] block mb-1">
                  ID da Ferramenta (matt_tool - opcional):
                </label>
                <input
                  type="text"
                  value={mlForm.appId}
                  onChange={(e) => setMlForm((p) => ({ ...p, appId: e.target.value }))}
                  placeholder="Ex: 77625408"
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:border-[#1CCAF2] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#1CCAF2] block mb-1">
                  Cookie de Sessão ML (Gera links meli.la automaticamente):
                </label>
                <input
                  type="password"
                  value={mlForm.cookieString}
                  onChange={(e) => setMlForm((p) => ({ ...p, cookieString: e.target.value }))}
                  placeholder="Cole os cookies da sua conta Mercado Livre ou use a extensão"
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:border-[#1CCAF2] outline-none font-mono"
                />
                <p className="text-[10px] text-[#8EADC7]/70 mt-1">
                  💡 Com a sessão salva, o robô chama a API oficial do Mercado Livre e cria links <code>meli.la/...</code> diretamente!
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveMlDirect}
                disabled={testingMl}
                className="w-full py-2 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] font-bold text-xs hover:opacity-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Salvar Tag do Mercado Livre</span>
              </button>
            </div>

            {/* Teste com Produto Real */}
            <div className="space-y-2 pt-2 border-t border-[#18334D]">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7]">
                Testar Geração com Produto Real:
              </label>
              <input
                type="text"
                value={testProductUrl.mercadolivre}
                onChange={(e) =>
                  setTestProductUrl((p) => ({ ...p, mercadolivre: e.target.value }))
                }
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:border-[#1CCAF2] outline-none"
                placeholder="https://www.mercadolivre.com.br/p/MLB..."
              />
              <button
                onClick={() => handleConvertProduct('mercadolivre')}
                disabled={convertingStore === 'mercadolivre'}
                className="w-full py-2.5 rounded-xl bg-[#0D1B31] border border-[#1CCAF2]/40 text-[#1CCAF2] text-xs font-bold hover:bg-[#1CCAF2]/10 transition-colors flex items-center justify-center gap-2"
              >
                {convertingStore === 'mercadolivre' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Gerar Link & Registrar Evidência</span>
              </button>

              {/* Resultado da conversão ML */}
              {conversionResults.mercadolivre && (
                <div className="p-2.5 rounded-xl bg-[#061225] border border-[#1CCAF2]/30 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-[#4ADE80]">Link Confirmado:</span>
                    <button
                      onClick={() =>
                        copyToClipboard(conversionResults.mercadolivre.affiliateUrl, 'ml_link')
                      }
                      className="text-[#1CCAF2] hover:underline flex items-center gap-1 text-[11px]"
                    >
                      {copiedUrl === 'ml_link' ? (
                        <>
                          <Check className="w-3 h-3 text-[#4ADE80]" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-[11px] text-[#C1D5E8] truncate">
                    {conversionResults.mercadolivre.affiliateUrl}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#18334D] flex items-center gap-2">
            <button
              onClick={handleRefreshMl}
              disabled={testingMl}
              className="flex-1 py-2 rounded-xl bg-[#18334D] hover:bg-[#234768] text-xs font-semibold text-[#F8FBFF] transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingMl ? 'animate-spin' : ''}`} />
              <span>Verificar Conexão</span>
            </button>
            <button
              onClick={() => setShowExtensionModal(true)}
              className="px-3 py-2 rounded-xl bg-[#061225] border border-[#18334D] hover:border-[#1CCAF2] text-xs font-semibold text-[#1CCAF2] transition-colors"
            >
              Instruções
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 2. SHOPEE (OPEN API GRAPHQL COM HMAC SHA-256) */}
        {/* =================================================================== */}
        <div className="bg-[#0D1B31] border border-[#18334D] rounded-2xl p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EE4D2D]/10 border border-[#EE4D2D]/30 flex items-center justify-center font-black text-[#EE4D2D] text-sm">
                  SH
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#F8FBFF]">Shopee</h3>
                  <span className="text-[11px] text-[#8EADC7]">Open API GraphQL Oficial</span>
                </div>
              </div>

              {/* Status Badge */}
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 ${
                  shopeeStore?.connectionStatus === 'conectado'
                    ? 'bg-[#22C55E]/15 text-[#4ADE80] border-[#22C55E]/30'
                    : 'bg-[#F59E0B]/15 text-[#FBBF24] border-[#F59E0B]/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    shopeeStore?.connectionStatus === 'conectado' ? 'bg-[#4ADE80]' : 'bg-[#FBBF24]'
                  }`}
                />
                {shopeeStore?.connectionStatus === 'conectado' ? 'API Conectada' : 'Revisão Manual'}
              </span>
            </div>

            {/* Inputs de Credenciais Seguras */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7] block mb-1">
                  App ID (Shopee Open API):
                </label>
                <input
                  type="text"
                  value={shopeeForm.appId}
                  onChange={(e) => setShopeeForm((p) => ({ ...p, appId: e.target.value }))}
                  placeholder="Ex: 10055555"
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:border-[#1CCAF2] outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7] block mb-1">
                  App Secret (Criptografado AES-256):
                </label>
                <div className="relative">
                  <input
                    type={showSecrets.shopeeSecret ? 'text' : 'password'}
                    value={shopeeForm.appSecret}
                    onChange={(e) =>
                      setShopeeForm((p) => ({ ...p, appSecret: e.target.value }))
                    }
                    placeholder="••••••••••••••••••••••••••••••••"
                    className="w-full bg-[#061225] border border-[#18334D] rounded-xl pl-3 pr-9 py-2 text-xs text-[#F8FBFF] focus:border-[#1CCAF2] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowSecrets((p) => ({ ...p, shopeeSecret: !p.shopeeSecret }))
                    }
                    className="absolute right-3 top-2.5 text-[#8EADC7] hover:text-[#F8FBFF]"
                  >
                    {showSecrets.shopeeSecret ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7] block mb-1">
                  Sub-ID de Rastreio (Opcional):
                </label>
                <input
                  type="text"
                  value={shopeeForm.subId}
                  onChange={(e) => setShopeeForm((p) => ({ ...p, subId: e.target.value }))}
                  placeholder="Ex: radar_promos"
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:border-[#1CCAF2] outline-none"
                />
              </div>
            </div>

            {/* Aviso sobre não substituição com UTM */}
            <p className="text-[11px] text-[#8EADC7]/80">
              🔒 O Radar de Ofertas assina as requisições no servidor via SHA-256 oficial da Shopee Open API (com sincronização automática de relógio UTC) e nunca substitui falhas de API por links montados com UTM.
            </p>

            {/* Resultado do Teste Shopee */}
            {testResults.shopee && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  testResults.shopee.verified
                    ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#86EFAC]'
                    : 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#FDE68A]'
                }`}
              >
                <p className="font-bold">{testResults.shopee.message}</p>
                {testResults.shopee.testGeneratedLink && (
                  <p className="font-mono text-[11px] truncate">
                    {testResults.shopee.testGeneratedLink}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#18334D]">
            <button
              onClick={handleTestShopee}
              disabled={testingShopee}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] font-bold text-xs hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {testingShopee ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Key className="w-3.5 h-3.5" />
              )}
              <span>Testar e Salvar Shopee Open API</span>
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 3. NETSHOES / RAKUTEN ADVERTISING (DEEP LINKS API) */}
        {/* =================================================================== */}
        <div className="bg-[#0D1B31] border border-[#18334D] rounded-2xl p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#592C82]/20 border border-[#592C82]/40 flex items-center justify-center font-black text-[#C084FC] text-sm">
                  NS
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#F8FBFF]">Netshoes / Rakuten</h3>
                  <span className="text-[11px] text-[#8EADC7]">Rakuten Deep Links API</span>
                </div>
              </div>

              {/* Status Badge */}
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 ${
                  netshoesStore?.connectionStatus === 'conectado'
                    ? 'bg-[#22C55E]/15 text-[#4ADE80] border-[#22C55E]/30'
                    : 'bg-[#F59E0B]/15 text-[#FBBF24] border-[#F59E0B]/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    netshoesStore?.connectionStatus === 'conectado'
                      ? 'bg-[#4ADE80]'
                      : 'bg-[#FBBF24]'
                  }`}
                />
                {netshoesStore?.connectionStatus === 'conectado'
                  ? 'Deep Links API Ativa'
                  : 'Revisão Manual'}
              </span>
            </div>

            {/* Inputs de Credenciais Seguras */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7] block mb-1">
                  Token Bearer (Rakuten Developer Portal):
                </label>
                <div className="relative">
                  <input
                    type={showSecrets.rakutenToken ? 'text' : 'password'}
                    value={rakutenForm.token}
                    onChange={(e) => setRakutenForm((p) => ({ ...p, token: e.target.value }))}
                    placeholder="Cole seu Bearer token gerado..."
                    className="w-full bg-[#061225] border border-[#18334D] rounded-xl pl-3 pr-9 py-2 text-xs text-[#F8FBFF] focus:border-[#1CCAF2] outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowSecrets((p) => ({ ...p, rakutenToken: !p.rakutenToken }))
                    }
                    className="absolute right-3 top-2.5 text-[#8EADC7] hover:text-[#F8FBFF]"
                  >
                    {showSecrets.rakutenToken ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7] block mb-1">
                    Advertiser ID (Merchant):
                  </label>
                  <input
                    type="text"
                    value={rakutenForm.advertiserId}
                    onChange={(e) =>
                      setRakutenForm((p) => ({ ...p, advertiserId: e.target.value }))
                    }
                    placeholder="Ex: 43391"
                    className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:border-[#1CCAF2] outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7] block mb-1">
                    Rakuten Site ID:
                  </label>
                  <input
                    type="text"
                    value={rakutenForm.siteId}
                    onChange={(e) => setRakutenForm((p) => ({ ...p, siteId: e.target.value }))}
                    placeholder="Ex: 394821"
                    className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:border-[#1CCAF2] outline-none"
                  />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-[#8EADC7]/80">
              ⚠️ Sem Merchant ID fixo. O token deve ser gerado na aba <em>Applications</em> do painel da Rakuten Advertising.
            </p>

            {/* Resultado do Teste Rakuten */}
            {testResults.netshoes && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  testResults.netshoes.verified
                    ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#86EFAC]'
                    : 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#FDE68A]'
                }`}
              >
                <p className="font-bold">{testResults.netshoes.message}</p>
                {testResults.netshoes.limitationWarning && (
                  <p className="text-[11px]">{testResults.netshoes.limitationWarning}</p>
                )}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#18334D]">
            <button
              onClick={handleTestRakuten}
              disabled={testingRakuten}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] font-bold text-xs hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {testingRakuten ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              <span>Validar Rakuten Deep Links API</span>
            </button>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 4. REGISTROS DE EVIDÊNCIA AUDITÁVEIS POR LINK (SAAS COMPLIANCE) */}
      {/* =================================================================== */}
      <div className="bg-[#0D1B31] border border-[#18334D] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-base text-[#F8FBFF] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#1CCAF2]" />
              <span>Cofre de Evidências por Link</span>
            </h3>
            <p className="text-xs text-[#8EADC7]">
              Cada link gerado possui registro de autoria, origem criptográfica da confirmação e expiração. Alterar a URL invalida aprovações manuais no servidor.
            </p>
          </div>
          <span className="text-xs font-mono text-[#1CCAF2] bg-[#18334D] px-3 py-1 rounded-full self-start sm:self-auto">
            {evidenceList.length} registro(s) auditados
          </span>
        </div>

        {evidenceList.length === 0 ? (
          <div className="p-8 text-center text-[#8EADC7] text-xs space-y-2 border border-dashed border-[#18334D] rounded-xl">
            <Lock className="w-6 h-6 mx-auto text-[#8EADC7]/40" />
            <p>Nenhuma evidência gerada ainda nesta sessão.</p>
            <p className="text-[11px] text-[#8EADC7]/60">
              Faça um teste de conexão ou gere uma conversão assistida para registrar a primeira evidência.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#18334D] text-[#8EADC7] text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Loja</th>
                  <th className="py-2.5 px-3">Origem da Confirmação</th>
                  <th className="py-2.5 px-3">Status do Link</th>
                  <th className="py-2.5 px-3">Auto-Dispatch</th>
                  <th className="py-2.5 px-3">URL Final Gerada</th>
                  <th className="py-2.5 px-3">Gerado Em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#18334D]">
                {evidenceList.map((ev) => (
                  <tr key={ev.id} className="hover:bg-[#18334D]/30 transition-colors">
                    <td className="py-2.5 px-3 font-bold uppercase text-[#F8FBFF]">
                      {ev.storeName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[#1CCAF2]">
                      {ev.confirmationSource}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          ev.verificationStatus === 'verificado'
                            ? 'bg-[#22C55E]/15 text-[#4ADE80]'
                            : 'bg-[#F59E0B]/15 text-[#FBBF24]'
                        }`}
                      >
                        {ev.verificationStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          ev.isAutoDispatchAllowed
                            ? 'bg-[#22C55E]/15 text-[#4ADE80]'
                            : 'bg-[#EF4444]/15 text-[#F87171]'
                        }`}
                      >
                        {ev.isAutoDispatchAllowed ? 'Autorizado' : 'Revisão Manual'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 max-w-[240px] truncate font-mono text-[11px] text-[#8EADC7]">
                      {ev.finalAffiliateUrl}
                    </td>
                    <td className="py-2.5 px-3 text-[#8EADC7] text-[11px]">
                      {new Date(ev.generatedAt).toLocaleTimeString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Instruções da Extensão Chrome */}
      {showExtensionModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowExtensionModal(false)}
        >
          <div
            className="bg-[#0D1B31] border border-[#18334D] rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-[#F8FBFF] flex items-center gap-2">
                  <Download className="w-5 h-5 text-[#1CCAF2]" />
                  <span>Instalação do Conector Chrome (Manifest V3)</span>
                </h3>
                <p className="text-xs text-[#8EADC7] mt-1">
                  Pasta pronta no projeto: <code>C:\projetos\Projeto-afiliados\chrome-extension</code>
                </p>
              </div>
              <button
                onClick={() => setShowExtensionModal(false)}
                className="text-[#8EADC7] hover:text-[#F8FBFF] p-1"
              >
                ✕
              </button>
            </div>

            <ol className="space-y-3 text-xs text-[#C1D5E8] list-decimal list-inside leading-relaxed">
              <li>
                Abra o Google Chrome e digite na barra de endereços: <br />
                <code className="bg-[#061225] px-2 py-1 rounded text-[#1CCAF2] font-mono mt-1 inline-block">
                  chrome://extensions/
                </code>
              </li>
              <li>
                No canto superior direito, ative a opção <strong>"Modo do desenvolvedor"</strong> (Developer mode).
              </li>
              <li>
                Clique no botão <strong>"Carregar sem compactação"</strong> (Load unpacked).
              </li>
              <li>
                Selecione o diretório da extensão: <br />
                <code className="bg-[#061225] px-2 py-1 rounded text-[#1CCAF2] font-mono mt-1 inline-block break-all">
                  C:\projetos\Projeto-afiliados\chrome-extension
                </code>
              </li>
              <li>
                Abra o Mercado Livre com seu login de afiliado, clique no ícone da extensão e confirme a conexão!
              </li>
            </ol>

            <div className="p-3 rounded-xl bg-[#0879DF]/15 border border-[#0879DF]/30 text-xs text-[#93C5FD]">
              🛡️ <strong>Garantia de Privacidade:</strong> O conector não armazena cookies no servidor. Toda geração é acionada pelo usuário diretamente no navegador onde a sessão do Mercado Livre reside.
            </div>

            <button
              onClick={() => setShowExtensionModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#18334D] hover:bg-[#234768] text-xs font-bold text-[#F8FBFF] transition-colors"
            >
              Fechar Instruções
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
