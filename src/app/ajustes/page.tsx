'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Settings,
  Smartphone,
  ShieldCheck,
  Tag,
  Key,
  Check,
  RefreshCw,
  Clock,
  Wifi,
  AlertCircle,
  AlertTriangle,
  Database,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { QualityRule, SafeStoreCredential, StoreCredential, StoreName, UserSettings, WhatsAppIntegration } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';

interface TestStoreResult {
  ok: boolean;
  message: string;
  limitationWarning?: string;
  testGeneratedLink?: string;
  lastValidatedAt?: string;
}

export default function AjustesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // WhatsApp
  const [wa, setWa] = useState<WhatsAppIntegration>({
    id: '',
    userId: '',
    instanceName: 'radar_ofertas',
    baseUrl: '',
    apiKey: '',
    status: 'disconnected',
    updatedAt: '',
  });

  // Lojas (SafeStoreCredential com tags e flags seguras)
  const [stores, setStores] = useState<SafeStoreCredential[]>([]);
  // Rascunho de segredos que o usuário está digitando para substituir
  const [secretDrafts, setSecretDrafts] = useState<Record<string, { appSecret?: string; userToken?: string }>>({});
  // Controle de visibilidade de senha
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Testes de conexão de cada loja
  const [testingStore, setTestingStore] = useState<StoreName | null>(null);
  const [testStoreResults, setTestStoreResults] = useState<Record<string, TestStoreResult>>({});

  // Regras
  const [rules, setRules] = useState<QualityRule[]>([]);

  // Geral
  const [settings, setSettings] = useState<UserSettings>({
    id: '',
    userId: '',
    systemName: 'Radar de Ofertas',
    nightPauseEnabled: true,
    nightPauseStart: '22:30:00',
    nightPauseEnd: '07:30:00',
    minSendIntervalSeconds: 60,
    maxDailyMessages: 120,
    watermarkText: '🎯 *Radar de Ofertas* — Os melhores achadinhos',
    updatedAt: '',
  });

  const loadData = async () => {
    try {
      const [resWa, resRules] = await Promise.all([
        fetch('/api/whatsapp/connect'),
        fetch('/api/copier/rules'),
      ]);

      const dataWa = await resWa.json();
      const dataRules = await resRules.json();

      if (resRules.status === 401 || dataRules.code === 'SESSION_EXPIRED') {
        setSessionExpired(true);
      }

      if (dataWa.ok && dataWa.whatsapp) {
        setWa(dataWa.whatsapp);
      }

      if (dataRules.ok) {
        setStores(dataRules.stores || []);
        setRules(dataRules.rules || []);
        if (dataRules.settings) setSettings(dataRules.settings);
      }
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleTestWhatsApp = async () => {
    setTestingWa(true);
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: wa.baseUrl,
          apiKey: wa.apiKey,
          instanceName: wa.instanceName,
          action: 'test_connection',
        }),
      });
      const data = await res.json();
      if (data.ok && data.whatsapp) {
        setWa(data.whatsapp);
        showNotification(
          data.whatsapp.status === 'connected'
            ? 'Instância conectada e operacional!'
            : 'Instância offline ou credenciais incorretas.',
          data.whatsapp.status === 'connected' ? 'success' : 'error'
        );
      } else {
        showNotification(data.error || 'Falha ao conectar com Evolution API.', 'error');
      }
    } catch {
      showNotification('Falha de rede ao comunicar com a Evolution API.', 'error');
    } finally {
      setTestingWa(false);
    }
  };

  const handleTestStoreConnection = async (storeName: StoreName) => {
    setTestingStore(storeName);
    const store = stores.find((s) => s.storeName === storeName);
    const drafts = secretDrafts[storeName] || {};

    try {
      const res = await fetch('/api/copier/affiliates/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName,
          credentials: {
            affiliateTag: store?.affiliateTag || '',
            appId: store?.appId || '',
            appSecret: drafts.appSecret,
            userToken: drafts.userToken,
            isActive: store?.isActive ?? true,
          },
        }),
      });

      const data = await res.json();
      if (res.status === 401 || data.code === 'SESSION_EXPIRED') {
        setSessionExpired(true);
        showNotification('Sua sessão expirou. Faça login para continuar.', 'error');
        return;
      }

      setTestStoreResults((prev) => ({
        ...prev,
        [storeName]: {
          ok: Boolean(data.ok),
          message: data.message || data.error || 'Teste finalizado.',
          limitationWarning: data.limitationWarning,
          testGeneratedLink: data.testGeneratedLink,
          lastValidatedAt: data.lastValidatedAt || new Date().toISOString(),
        },
      }));

      if (data.ok) {
        // Atualiza estado local de validação
        setStores((prev) =>
          prev.map((s) =>
            s.storeName === storeName
              ? {
                  ...s,
                  isValidated: true,
                  lastValidatedAt: data.lastValidatedAt || new Date().toISOString(),
                  validationError: undefined,
                  validationMethod: data.validationMethod,
                }
              : s
          )
        );
        showNotification(`Conexão com ${storeName.toUpperCase()} testada com sucesso!`, 'success');
      } else {
        showNotification(`Teste de ${storeName.toUpperCase()}: ${data.error || data.message}`, 'error');
      }
    } catch {
      showNotification(`Falha de comunicação ao testar ${storeName.toUpperCase()}.`, 'error');
    } finally {
      setTestingStore(null);
    }
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      // 1. Salvar WhatsApp
      await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: wa.baseUrl,
          apiKey: wa.apiKey,
          instanceName: wa.instanceName,
        }),
      });

      // 2. Mesclar rascunhos de segredos com os dados de lojas
      const payloadStores = stores.map((s) => {
        const drafts = secretDrafts[s.storeName] || {};
        return {
          id: s.id,
          storeName: s.storeName,
          affiliateTag: s.affiliateTag,
          appId: s.appId,
          appSecret: drafts.appSecret,
          userToken: drafts.userToken,
          isActive: s.isActive,
        };
      });

      // 3. Salvar Lojas, Regras e Configurações Gerais
      const resRules = await fetch('/api/copier/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stores: payloadStores,
          rules,
          settings,
        }),
      });

      const dataRules = await resRules.json();
      if (dataRules.ok) {
        setStores(dataRules.stores || []);
        setSecretDrafts({});
      }

      setSavedSuccess(true);
      showNotification('Todas as configurações e credenciais foram salvas com sucesso!');
    } catch {
      showNotification('Erro ao persistir configurações.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateStoreField = (storeName: StoreName, field: 'affiliateTag' | 'appId', value: string) => {
    setStores((prev) => {
      const exists = prev.find((s) => s.storeName === storeName);
      if (exists) {
        return prev.map((s) =>
          s.storeName === storeName
            ? {
                ...s,
                [field]: value,
                isConfigured: Boolean(value.trim() || s.appId || s.affiliateTag || s.hasSecret),
                isActive: true,
              }
            : s
        );
      } else {
        return [
          ...prev,
          {
            id: `store_${storeName}`,
            storeName,
            [field]: value,
            isActive: true,
            isConfigured: Boolean(value.trim()),
            isValidated: false,
            hasSecret: false,
            hasToken: false,
          },
        ];
      }
    });
  };

  const updateSecretDraft = (storeName: StoreName, field: 'appSecret' | 'userToken', value: string) => {
    setSecretDrafts((prev) => ({
      ...prev,
      [storeName]: {
        ...prev[storeName],
        [field]: value,
      },
    }));
  };

  const updateRuleField = (storeName: StoreName, field: keyof QualityRule, value: any) => {
    setRules((prev) =>
      prev.map((r) => (r.storeName === storeName ? { ...r, [field]: value } : r))
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <RefreshCw className="w-8 h-8 text-[#1CCAF2] animate-spin" />
        <p className="text-sm font-semibold text-[#8EADC7]">Carregando configurações do Radar...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSaveAll} className="space-y-6 pb-12">
      {/* Banner de Sessão Expirada */}
      {sessionExpired && (
        <div className="p-4 rounded-2xl bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#FBBF24] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl animate-pulse">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">Sua sessão expirou por segurança</p>
              <p className="text-xs text-[#FBBF24]/80">
                Faça login novamente para salvar configurações e testar conexões com autenticação ativa.
              </p>
            </div>
          </div>
          <Link
            href="/login?redirect=/ajustes&expired=true"
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#F59E0B] text-[#061225] font-bold text-xs hover:bg-[#F59E0B]/90 transition-all text-center flex-shrink-0"
          >
            Fazer Login e Retornar
          </Link>
        </div>
      )}

      {/* Banner para o novo módulo Conectar Lojas */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0879DF]/20 via-[#0D1B31] to-[#1CCAF2]/20 border border-[#1CCAF2]/40 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#1CCAF2]/20 border border-[#1CCAF2]/40 flex items-center justify-center text-[#1CCAF2] flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#F8FBFF]">Novo Módulo: Conectar Lojas & Afiliados</h3>
            <p className="text-xs text-[#8EADC7]">
              Conecte Mercado Livre via Extensão Chrome, Shopee Open API e Rakuten Deep Links API com cofre criptografado.
            </p>
          </div>
        </div>
        <Link
          href="/conectar-lojas"
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#1CCAF2] hover:bg-[#38d5f7] text-[#061225] font-bold text-xs transition-colors text-center flex-shrink-0"
        >
          Acessar Conectar Lojas →
        </Link>
      </div>

      {/* Topo / Feedback */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0D1B31] border border-[#18334D] rounded-2xl p-4 sm:p-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-[#1CCAF2]" />
            Configurações do Sistema
          </h1>
          <p className="text-xs sm:text-sm text-[#8EADC7] mt-0.5">
            Credenciais oficiais de afiliados, conexão WhatsApp e filtros de qualidade
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-[46px] px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-[#0879DF] hover:bg-[#0768c0] text-[#F8FBFF] shadow-lg shadow-[#0879DF]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : savedSuccess ? (
            <Check className="w-4 h-4 text-[#20C997]" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span>{saving ? 'Gravando Dados...' : savedSuccess ? 'Salvo com Sucesso!' : 'Salvar Alterações'}</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-[#20C997]/10 border-[#20C997]/40 text-[#20C997]'
              : 'bg-[#F87171]/10 border-[#F87171]/40 text-[#F87171]'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="text-xs sm:text-sm font-semibold">{feedback.text}</span>
        </div>
      )}

      {/* 1. Integrações de Afiliados Oficiais (Destaque Principal) */}
      <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#18334D] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0879DF]/15 border border-[#0879DF]/30 flex items-center justify-center">
              <Key className="w-5 h-5 text-[#1CCAF2]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#F8FBFF]">Integrações de Afiliados Oficiais</h2>
              <p className="text-xs text-[#8EADC7]">
                Seus identificadores reais para conversão de links comprovada. Segredos mantidos estritamente no servidor.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-[#1CCAF2] bg-[#061225] border border-[#18334D] px-3 py-1 rounded-full self-start sm:self-auto">
            Zero links com tag concorrente
          </span>
        </div>

        {/* Cartões Mobile First por Loja */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* 1.1 MERCADO LIVRE */}
          {(() => {
            const mlStore = stores.find((s) => s.storeName === 'mercadolivre');
            const mlDrafts = secretDrafts['mercadolivre'] || {};
            const mlTest = testStoreResults['mercadolivre'];
            const isConfigured = Boolean(mlStore?.isConfigured || mlStore?.affiliateTag || mlStore?.appId);
            const isValidated = Boolean(mlStore?.isValidated);

            return (
              <div className="p-4 sm:p-5 rounded-2xl bg-[#061225] border border-[#18334D] flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  {/* Topo do Card */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#FFE600]/15 border border-[#FFE600]/30 flex items-center justify-center text-xs font-black text-[#FFE600]">
                        ML
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#F8FBFF]">Mercado Livre</h3>
                        <p className="text-[10px] text-[#8EADC7]">Programa de Afiliados Oficial</p>
                      </div>
                    </div>
                    {isValidated ? (
                      <span className="text-[10px] font-bold text-[#20C997] bg-[#20C997]/10 border border-[#20C997]/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Check className="w-3 h-3" /> Validada
                      </span>
                    ) : isConfigured ? (
                      <span className="text-[10px] font-bold text-[#F7B84B] bg-[#F7B84B]/10 border border-[#F7B84B]/30 px-2 py-0.5 rounded-md">
                        Configurada
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-[#8EADC7] bg-[#0D1B31] border border-[#18334D] px-2 py-0.5 rounded-md">
                        Pendente
                      </span>
                    )}
                  </div>

                  {/* Instruções de onde encontrar os dados */}
                  <div className="p-2.5 rounded-xl bg-[#0D1B31] border border-[#18334D] text-[11px] text-[#8EADC7] space-y-1">
                    <p className="font-semibold text-[#F8FBFF] flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-[#1CCAF2]" /> Onde encontrar no painel:
                    </p>
                    <p className="leading-relaxed">
                      No painel <strong>Mercado Livre Afiliados</strong> &gt; &quot;Ferramentas&quot; ou ao gerar qualquer link:
                      copie o <code className="text-[#1CCAF2]">matt_tool</code> (ID da ferramenta) e o <code className="text-[#1CCAF2]">matt_word</code> (sua Tag de campanha).
                    </p>
                  </div>

                  {/* Campos */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-semibold text-[#8EADC7] block mb-1">
                        ID da Ferramenta (<span className="text-[#1CCAF2]">matt_tool</span> / appId) *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 12345678"
                        value={mlStore?.appId || ''}
                        onChange={(e) => updateStoreField('mercadolivre', 'appId', e.target.value)}
                        className="w-full min-h-[42px] bg-[#0D1B31] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-[#8EADC7] block mb-1">
                        Tag de Rastreio (<span className="text-[#1CCAF2]">matt_word</span>) *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: radarofertas"
                        value={mlStore?.affiliateTag || ''}
                        onChange={(e) => updateStoreField('mercadolivre', 'affiliateTag', e.target.value)}
                        className="w-full min-h-[42px] bg-[#0D1B31] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-[#8EADC7] flex items-center gap-1">
                          <Lock className="w-3 h-3 text-[#1CCAF2]" /> Access Token OAuth (Opcional)
                        </label>
                        {mlStore?.hasToken && !mlDrafts.userToken && (
                          <span className="text-[10px] text-[#20C997] font-semibold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Gravado no servidor
                          </span>
                        )}
                      </div>
                      <input
                        type={showSecrets['mercadolivre'] ? 'text' : 'password'}
                        placeholder={mlStore?.hasToken ? '••••••••••••••••••••••••••••' : 'Insira o token para confirmação em tempo real'}
                        value={mlDrafts.userToken || ''}
                        onChange={(e) => updateSecretDraft('mercadolivre', 'userToken', e.target.value)}
                        className="w-full min-h-[42px] bg-[#0D1B31] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                      />
                    </div>
                  </div>

                  {/* Resultado do Teste */}
                  {mlTest && (
                    <div
                      className={`p-3 rounded-xl border text-[11px] space-y-1.5 ${
                        mlTest.ok
                          ? 'bg-[#20C997]/10 border-[#20C997]/30 text-[#20C997]'
                          : 'bg-[#F87171]/10 border-[#F87171]/30 text-[#F87171]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        {mlTest.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                        <span>{mlTest.message}</span>
                      </div>
                      {mlTest.testGeneratedLink && (
                        <div className="text-[10px] text-[#F8FBFF] truncate bg-[#061225] p-1.5 rounded border border-[#18334D]">
                          Link testado: <span className="text-[#1CCAF2]">{mlTest.testGeneratedLink}</span>
                        </div>
                      )}
                      {mlTest.limitationWarning && (
                        <p className="text-[10px] text-[#F7B84B] flex items-start gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#F7B84B] mt-0.5" />
                          <span>{mlTest.limitationWarning}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {mlStore?.lastValidatedAt && !mlTest && (
                    <p className="text-[10px] text-[#8EADC7] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#1CCAF2]" />
                      Última validação: {new Date(mlStore.lastValidatedAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>

                {/* Botão de Teste */}
                <button
                  type="button"
                  disabled={testingStore === 'mercadolivre'}
                  onClick={() => handleTestStoreConnection('mercadolivre')}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold bg-[#0D1B31] border border-[#18334D] text-[#1CCAF2] hover:bg-[#122440] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingStore === 'mercadolivre' ? 'animate-spin' : ''}`} />
                  <span>{testingStore === 'mercadolivre' ? 'Testando Conexão...' : 'Testar Conexão ML'}</span>
                </button>
              </div>
            );
          })()}

          {/* 1.2 SHOPEE */}
          {(() => {
            const shopeeStore = stores.find((s) => s.storeName === 'shopee');
            const shopeeDrafts = secretDrafts['shopee'] || {};
            const shopeeTest = testStoreResults['shopee'];
            const isConfigured = Boolean(shopeeStore?.isConfigured || shopeeStore?.affiliateTag || shopeeStore?.appId);
            const isValidated = Boolean(shopeeStore?.isValidated);

            return (
              <div className="p-4 sm:p-5 rounded-2xl bg-[#061225] border border-[#18334D] flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  {/* Topo do Card */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#EE4D2D]/15 border border-[#EE4D2D]/30 flex items-center justify-center text-xs font-black text-[#EE4D2D]">
                        SH
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#F8FBFF]">Shopee</h3>
                        <p className="text-[10px] text-[#8EADC7]">Shopee Afiliados & Open API</p>
                      </div>
                    </div>
                    {isValidated ? (
                      <span className="text-[10px] font-bold text-[#20C997] bg-[#20C997]/10 border border-[#20C997]/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Check className="w-3 h-3" /> Validada
                      </span>
                    ) : isConfigured ? (
                      <span className="text-[10px] font-bold text-[#F7B84B] bg-[#F7B84B]/10 border border-[#F7B84B]/30 px-2 py-0.5 rounded-md">
                        Configurada
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-[#8EADC7] bg-[#0D1B31] border border-[#18334D] px-2 py-0.5 rounded-md">
                        Pendente
                      </span>
                    )}
                  </div>

                  {/* Instruções */}
                  <div className="p-2.5 rounded-xl bg-[#0D1B31] border border-[#18334D] text-[11px] text-[#8EADC7] space-y-1">
                    <p className="font-semibold text-[#F8FBFF] flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-[#1CCAF2]" /> Onde encontrar no painel:
                    </p>
                    <p className="leading-relaxed">
                      No portal <strong>Shopee Afiliados</strong> &gt; &quot;Links Personalizados&quot;: use seu <strong>Sub-ID</strong>.
                      Para gerar links curtos automáticos <code className="text-[#1CCAF2]">shope.ee</code> com selo confirmado pela API, informe o <strong>App ID</strong> e <strong>App Secret</strong> da Open API Shopee.
                    </p>
                  </div>

                  {/* Campos */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-semibold text-[#8EADC7] block mb-1">
                        Sub-ID / Identificador de Rastreio *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: radarofertas"
                        value={shopeeStore?.affiliateTag || ''}
                        onChange={(e) => updateStoreField('shopee', 'affiliateTag', e.target.value)}
                        className="w-full min-h-[42px] bg-[#0D1B31] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-[#8EADC7] block mb-1">
                        Shopee Open API — App ID (Opcional para links curtos)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 1000123"
                        value={shopeeStore?.appId || ''}
                        onChange={(e) => updateStoreField('shopee', 'appId', e.target.value)}
                        className="w-full min-h-[42px] bg-[#0D1B31] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-[#8EADC7] flex items-center gap-1">
                          <Lock className="w-3 h-3 text-[#1CCAF2]" /> Shopee Open API — App Secret
                        </label>
                        {shopeeStore?.hasSecret && !shopeeDrafts.appSecret && (
                          <span className="text-[10px] text-[#20C997] font-semibold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Gravado no servidor
                          </span>
                        )}
                      </div>
                      <input
                        type={showSecrets['shopee'] ? 'text' : 'password'}
                        placeholder={shopeeStore?.hasSecret ? '••••••••••••••••••••••••••••' : 'Chave secreta para assinatura HMAC SHA-256'}
                        value={shopeeDrafts.appSecret || ''}
                        onChange={(e) => updateSecretDraft('shopee', 'appSecret', e.target.value)}
                        className="w-full min-h-[42px] bg-[#0D1B31] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                      />
                    </div>
                  </div>

                  {/* Resultado do Teste */}
                  {shopeeTest && (
                    <div
                      className={`p-3 rounded-xl border text-[11px] space-y-1.5 ${
                        shopeeTest.ok
                          ? 'bg-[#20C997]/10 border-[#20C997]/30 text-[#20C997]'
                          : 'bg-[#F87171]/10 border-[#F87171]/30 text-[#F87171]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        {shopeeTest.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                        <span>{shopeeTest.message}</span>
                      </div>
                      {shopeeTest.testGeneratedLink && (
                        <div className="text-[10px] text-[#F8FBFF] truncate bg-[#061225] p-1.5 rounded border border-[#18334D]">
                          Link testado: <span className="text-[#1CCAF2]">{shopeeTest.testGeneratedLink}</span>
                        </div>
                      )}
                      {shopeeTest.limitationWarning && (
                        <p className="text-[10px] text-[#F7B84B] flex items-start gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#F7B84B] mt-0.5" />
                          <span>{shopeeTest.limitationWarning}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {shopeeStore?.lastValidatedAt && !shopeeTest && (
                    <p className="text-[10px] text-[#8EADC7] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#1CCAF2]" />
                      Última validação: {new Date(shopeeStore.lastValidatedAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>

                {/* Botão de Teste */}
                <button
                  type="button"
                  disabled={testingStore === 'shopee'}
                  onClick={() => handleTestStoreConnection('shopee')}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold bg-[#0D1B31] border border-[#18334D] text-[#1CCAF2] hover:bg-[#122440] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingStore === 'shopee' ? 'animate-spin' : ''}`} />
                  <span>{testingStore === 'shopee' ? 'Testando Conexão...' : 'Testar Conexão Shopee'}</span>
                </button>
              </div>
            );
          })()}

          {/* 1.3 NETSHOES / RAKUTEN LINKSHARE */}
          {(() => {
            const netshoesStore = stores.find((s) => s.storeName === 'netshoes');
            const netshoesDrafts = secretDrafts['netshoes'] || {};
            const netshoesTest = testStoreResults['netshoes'];
            const isConfigured = Boolean(netshoesStore?.isConfigured || netshoesStore?.affiliateTag || netshoesStore?.appId);
            const isValidated = Boolean(netshoesStore?.isValidated);

            return (
              <div className="p-4 sm:p-5 rounded-2xl bg-[#061225] border border-[#18334D] flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  {/* Topo do Card */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#5F249F]/15 border border-[#5F249F]/30 flex items-center justify-center text-xs font-black text-[#5F249F]">
                        NS
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#F8FBFF]">Netshoes</h3>
                        <p className="text-[10px] text-[#8EADC7]">Rakuten Advertising (LinkShare)</p>
                      </div>
                    </div>
                    {isValidated ? (
                      <span className="text-[10px] font-bold text-[#20C997] bg-[#20C997]/10 border border-[#20C997]/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Check className="w-3 h-3" /> Validada
                      </span>
                    ) : isConfigured ? (
                      <span className="text-[10px] font-bold text-[#F7B84B] bg-[#F7B84B]/10 border border-[#F7B84B]/30 px-2 py-0.5 rounded-md">
                        Configurada
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-[#8EADC7] bg-[#0D1B31] border border-[#18334D] px-2 py-0.5 rounded-md">
                        Pendente
                      </span>
                    )}
                  </div>

                  {/* Instruções */}
                  <div className="p-2.5 rounded-xl bg-[#0D1B31] border border-[#18334D] text-[11px] text-[#8EADC7] space-y-1">
                    <p className="font-semibold text-[#F8FBFF] flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-[#1CCAF2]" /> Onde encontrar no painel:
                    </p>
                    <p className="leading-relaxed">
                      No painel <strong>Rakuten Advertising</strong>: encontre seu <strong>Site ID</strong> (código único de afiliado).
                      No programa de afiliados da <strong>Netshoes</strong>, informe o <strong>Merchant ID</strong> fornecido na aprovação (sem valores fixos).
                    </p>
                  </div>

                  {/* Campos Dinâmicos (Sem Valores Fixos Inventados) */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-semibold text-[#8EADC7] block mb-1">
                        Rakuten Site ID / Token de Afiliado *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: seu_site_id (da sua conta Rakuten)"
                        value={netshoesStore?.affiliateTag || ''}
                        onChange={(e) => updateStoreField('netshoes', 'affiliateTag', e.target.value)}
                        className="w-full min-h-[42px] bg-[#0D1B31] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-[#8EADC7] block mb-1">
                        Merchant ID da Netshoes (MID) *
                      </label>
                      <input
                        type="text"
                        placeholder="Insira o MID do seu programa Netshoes"
                        value={netshoesStore?.appId || ''}
                        onChange={(e) => updateStoreField('netshoes', 'appId', e.target.value)}
                        className="w-full min-h-[42px] bg-[#0D1B31] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-[#8EADC7] flex items-center gap-1">
                          <Lock className="w-3 h-3 text-[#1CCAF2]" /> Web Service Token (Opcional)
                        </label>
                        {netshoesStore?.hasToken && !netshoesDrafts.userToken && (
                          <span className="text-[10px] text-[#20C997] font-semibold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Gravado no servidor
                          </span>
                        )}
                      </div>
                      <input
                        type={showSecrets['netshoes'] ? 'text' : 'password'}
                        placeholder={netshoesStore?.hasToken ? '••••••••••••••••••••••••••••' : 'Token de relatórios da Rakuten API'}
                        value={netshoesDrafts.userToken || ''}
                        onChange={(e) => updateSecretDraft('netshoes', 'userToken', e.target.value)}
                        className="w-full min-h-[42px] bg-[#0D1B31] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                      />
                    </div>
                  </div>

                  {/* Resultado do Teste */}
                  {netshoesTest && (
                    <div
                      className={`p-3 rounded-xl border text-[11px] space-y-1.5 ${
                        netshoesTest.ok
                          ? 'bg-[#20C997]/10 border-[#20C997]/30 text-[#20C997]'
                          : 'bg-[#F87171]/10 border-[#F87171]/30 text-[#F87171]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        {netshoesTest.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                        <span>{netshoesTest.message}</span>
                      </div>
                      {netshoesTest.testGeneratedLink && (
                        <div className="text-[10px] text-[#F8FBFF] truncate bg-[#061225] p-1.5 rounded border border-[#18334D]">
                          Link testado: <span className="text-[#1CCAF2]">{netshoesTest.testGeneratedLink}</span>
                        </div>
                      )}
                      {netshoesTest.limitationWarning && (
                        <p className="text-[10px] text-[#F7B84B] flex items-start gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#F7B84B] mt-0.5" />
                          <span>{netshoesTest.limitationWarning}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {netshoesStore?.lastValidatedAt && !netshoesTest && (
                    <p className="text-[10px] text-[#8EADC7] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#1CCAF2]" />
                      Última validação: {new Date(netshoesStore.lastValidatedAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>

                {/* Botão de Teste */}
                <button
                  type="button"
                  disabled={testingStore === 'netshoes'}
                  onClick={() => handleTestStoreConnection('netshoes')}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold bg-[#0D1B31] border border-[#18334D] text-[#1CCAF2] hover:bg-[#122440] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingStore === 'netshoes' ? 'animate-spin' : ''}`} />
                  <span>{testingStore === 'netshoes' ? 'Testando Conexão...' : 'Testar Conexão Netshoes'}</span>
                </button>
              </div>
            );
          })()}
        </div>

        {/* Lojas Secundárias (Amazon e Magalu) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Amazon */}
          {(() => {
            const amzStore = stores.find((s) => s.storeName === 'amazon');
            return (
              <div className="p-4 rounded-xl bg-[#061225] border border-[#18334D] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#F8FBFF]">Amazon Associados</span>
                  <StatusBadge label="Amazon" variant="neutral" size="sm" />
                </div>
                <div>
                  <label className="text-[11px] text-[#8EADC7] block mb-1">
                    Associate Store Tag (ex: seuid-20)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: radarofertas-20"
                    value={amzStore?.affiliateTag || ''}
                    onChange={(e) => updateStoreField('amazon', 'affiliateTag', e.target.value)}
                    className="w-full min-h-[40px] bg-[#0D1B31] border border-[#18334D] rounded-lg px-3 py-1.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                  />
                </div>
              </div>
            );
          })()}

          {/* Magalu */}
          {(() => {
            const magaluStore = stores.find((s) => s.storeName === 'magalu');
            return (
              <div className="p-4 rounded-xl bg-[#061225] border border-[#18334D] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#F8FBFF]">Magazine Luiza (Parceiro Magalu)</span>
                  <StatusBadge label="Magalu" variant="neutral" size="sm" />
                </div>
                <div>
                  <label className="text-[11px] text-[#8EADC7] block mb-1">
                    ID do Divulgador / Sub-ID
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: radar_magalu"
                    value={magaluStore?.affiliateTag || ''}
                    onChange={(e) => updateStoreField('magalu', 'affiliateTag', e.target.value)}
                    className="w-full min-h-[40px] bg-[#0D1B31] border border-[#18334D] rounded-lg px-3 py-1.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                  />
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 2. Conexão WhatsApp / Evolution API */}
      <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[#18334D] pb-3">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-[#20C997]" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#F8FBFF]">Conexão WhatsApp (Evolution API)</h2>
              <p className="text-xs text-[#8EADC7]">
                Instância dedicada para automação do Radar de Ofertas
              </p>
            </div>
          </div>
          <StatusBadge
            label={wa.status === 'connected' ? 'Conectado' : 'Desconectado'}
            variant={wa.status === 'connected' ? 'success' : 'danger'}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-[#8EADC7] block mb-1.5">Nome da Instância</label>
            <input
              type="text"
              value={wa.instanceName}
              onChange={(e) => setWa({ ...wa, instanceName: e.target.value })}
              className="w-full min-h-[42px] bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#8EADC7] block mb-1.5">URL da Evolution API</label>
            <input
              type="text"
              placeholder="https://sua-evolution-api.com"
              value={wa.baseUrl}
              onChange={(e) => setWa({ ...wa, baseUrl: e.target.value })}
              className="w-full min-h-[42px] bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#8EADC7] block mb-1.5">Chave da API (Global / Instance)</label>
            <input
              type="password"
              placeholder={wa.apiKey ? '••••••••••••••••••••••••••••' : 'Chave não visível por segurança'}
              value={wa.apiKey || ''}
              onChange={(e) => setWa({ ...wa, apiKey: e.target.value })}
              className="w-full min-h-[42px] bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="text-xs text-[#8EADC7] flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-[#1CCAF2]" />
            <span>Última sincronização: {wa.lastPingAt ? new Date(wa.lastPingAt).toLocaleString('pt-BR') : 'Nunca sincronizado'}</span>
          </div>

          <button
            type="button"
            onClick={handleTestWhatsApp}
            disabled={testingWa}
            className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold bg-[#061225] border border-[#18334D] text-[#1CCAF2] hover:bg-[#122440] transition-colors self-start sm:self-auto flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingWa ? 'animate-spin' : ''}`} />
            <span>{testingWa ? 'Testando Conexão...' : 'Testar Conexão WhatsApp'}</span>
          </button>
        </div>
      </div>

      {/* 3. Regras de Qualidade e Prova Social */}
      <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-[#18334D] pb-3">
          <ShieldCheck className="w-5 h-5 text-[#20C997]" />
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#F8FBFF]">
              Critérios de Qualidade & Prova Social por Loja
            </h2>
            <p className="text-xs text-[#8EADC7]">
              Bloqueio obrigatório de produtos sem prova social ou com baixa avaliação
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {(['shopee', 'mercadolivre', 'netshoes', 'amazon', 'magalu'] as StoreName[]).map((st) => {
            const rule = rules.find((r) => r.storeName === st) || {
              id: '',
              userId: '',
              storeName: st,
              minRating: 4.5,
              minReviewsCount: 10,
              minSalesCount: 5,
              minDiscountPct: 10,
              minCommissionRate: 1.0,
              requireSocialProof: true,
              requireInStock: true,
              blockedKeywords: [],
              updatedAt: '',
            };

            return (
              <div
                key={st}
                className="p-4 rounded-xl bg-[#061225] border border-[#18334D] flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="min-w-44">
                  <h3 className="text-xs font-bold text-[#F8FBFF] uppercase tracking-wider">{st}</h3>
                  <label className="flex items-center gap-2 mt-2 text-[11px] text-[#8EADC7] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.requireSocialProof}
                      onChange={(e) => updateRuleField(st, 'requireSocialProof', e.target.checked)}
                      className="rounded border-[#18334D] text-[#1CCAF2] focus:ring-0"
                    />
                    <span>Exigir Prova Social Comprovada</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                  <div>
                    <label className="text-[10px] text-[#8EADC7] block mb-1">Nota Mínima</label>
                    <input
                      type="number"
                      step="0.1"
                      min="3.0"
                      max="5.0"
                      value={rule.minRating}
                      onChange={(e) => updateRuleField(st, 'minRating', Number(e.target.value))}
                      className="w-full min-h-[38px] bg-[#0D1B31] border border-[#18334D] rounded-lg px-2.5 py-1 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#8EADC7] block mb-1">Avaliações Mínimas</label>
                    <input
                      type="number"
                      min="1"
                      max="5000"
                      value={rule.minReviewsCount}
                      onChange={(e) => updateRuleField(st, 'minReviewsCount', Number(e.target.value))}
                      className="w-full min-h-[38px] bg-[#0D1B31] border border-[#18334D] rounded-lg px-2.5 py-1 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#8EADC7] block mb-1">Vendas Mínimas</label>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={rule.minSalesCount}
                      onChange={(e) => updateRuleField(st, 'minSalesCount', Number(e.target.value))}
                      className="w-full min-h-[38px] bg-[#0D1B31] border border-[#18334D] rounded-lg px-2.5 py-1 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#8EADC7] block mb-1">Desconto Mínimo (%)</label>
                    <input
                      type="number"
                      min="5"
                      max="90"
                      value={rule.minDiscountPct}
                      onChange={(e) => updateRuleField(st, 'minDiscountPct', Number(e.target.value))}
                      className="w-full min-h-[38px] bg-[#0D1B31] border border-[#18334D] rounded-lg px-2.5 py-1 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </form>
  );
}
