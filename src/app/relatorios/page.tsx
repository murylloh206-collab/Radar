'use client';

import React, { useState } from 'react';
import { BarChart3, TrendingUp, DollarSign, MousePointer, ShoppingBag, ArrowUpRight, AlertCircle, Info } from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';
import { StatusBadge } from '@/components/StatusBadge';

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | 'mes_atual'>('30d');

  const storeReports = [
    {
      store: 'Shopee',
      clicks: 0,
      orders: 0,
      sales: 0.0,
      commission: 0.0,
      color: '#1CCAF2',
      status: 'Aguardando Credenciais de API',
    },
    {
      store: 'Mercado Livre',
      clicks: 0,
      orders: 0,
      sales: 0.0,
      commission: 0.0,
      color: '#F7B84B',
      status: 'Aguardando Credenciais de API',
    },
    {
      store: 'Netshoes (Rakuten)',
      clicks: 0,
      orders: 0,
      sales: 0.0,
      commission: 0.0,
      color: '#9B51E0',
      status: 'Aguardando Credenciais de API',
    },
    {
      store: 'Amazon',
      clicks: 0,
      orders: 0,
      sales: 0.0,
      commission: 0.0,
      color: '#20C997',
      status: 'Não Configurada',
    },
    {
      store: 'Magazine Luiza',
      clicks: 0,
      orders: 0,
      sales: 0.0,
      commission: 0.0,
      color: '#0879DF',
      status: 'Não Configurada',
    },
  ];

  const totalCommission = storeReports.reduce((acc, s) => acc + s.commission, 0);
  const totalSales = storeReports.reduce((acc, s) => acc + s.sales, 0);
  const totalOrders = storeReports.reduce((acc, s) => acc + s.orders, 0);
  const totalClicks = storeReports.reduce((acc, s) => acc + s.clicks, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
            Relatórios de Performance & Comissões
          </h1>
          <p className="text-xs sm:text-sm text-[#8EADC7] mt-0.5">
            Métricas de cliques, pedidos aprovados e comissões oficiais dos programas de afiliados.
          </p>
        </div>

        <div className="flex rounded-xl bg-[#0D1B31] border border-[#18334D] p-1 self-start sm:self-auto">
          {(['7d', '30d', 'mes_atual'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[38px] ${
                period === p ? 'bg-[#1CCAF2] text-[#061225]' : 'text-[#8EADC7] hover:text-[#F8FBFF]'
              }`}
            >
              {p === '7d' ? '7 Dias' : p === '30d' ? '30 Dias' : 'Mês Atual'}
            </button>
          ))}
        </div>
      </div>

      {/* Banner de Transparência Obrigatória */}
      <div className="rounded-2xl bg-[#0D1B31] border border-[#1CCAF2]/30 p-4 sm:p-5 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#1CCAF2] flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h2 className="text-xs sm:text-sm font-bold text-[#F8FBFF]">
            Aguardando Vinculação de Credenciais de Relatórios das Lojas
          </h2>
          <p className="text-xs text-[#8EADC7] leading-relaxed">
            Os números consolidados de cliques, pedidos confirmados e valores faturados em dinheiro exigem que as credenciais oficiais de API (Shopee Open API, Mercado Livre Developer API ou Rakuten Reporting API) estejam preenchidas em Ajustes. Enquanto as chaves não forem inseridas, o painel mantém os contadores zerados em conformidade com o padrão Radar de Ofertas sem exibir dados fictícios.
          </p>
        </div>
      </div>

      {/* Métricas Topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Comissão Estimada"
          value={`R$ ${totalCommission.toFixed(2).replace('.', ',')}`}
          subtitle="Aguardando dados oficiais"
          icon={DollarSign}
          color="#20C997"
        />
        <MetricCard
          title="Volume de Vendas"
          value={`R$ ${totalSales.toFixed(2).replace('.', ',')}`}
          subtitle="Valor bruto gerado"
          icon={TrendingUp}
          color="#1CCAF2"
        />
        <MetricCard
          title="Pedidos Convertidos"
          value={String(totalOrders)}
          subtitle="Compras rastreadas"
          icon={ShoppingBag}
          color="#F7B84B"
        />
        <MetricCard
          title="Cliques Rastreáveis"
          value={String(totalClicks)}
          subtitle="Nos links oficiais"
          icon={MousePointer}
          color="#0879DF"
        />
      </div>

      {/* Tabela de Lojas Responsiva */}
      <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-5">
        <h2 className="text-sm font-bold text-[#F8FBFF] mb-3">Detalhamento por Marketplace</h2>

        <div className="space-y-3">
          {storeReports.map((item) => (
            <div
              key={item.store}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-[#061225] border border-[#18334D] gap-3"
            >
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-[#F8FBFF]">{item.store}</h3>
                  <p className="text-[11px] text-[#8EADC7]">{item.status}</p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-6 text-xs">
                <div>
                  <span className="text-[10px] text-[#8EADC7] block">Cliques</span>
                  <span className="font-bold text-[#F8FBFF]">{item.clicks}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#8EADC7] block">Pedidos</span>
                  <span className="font-bold text-[#F8FBFF]">{item.orders}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#8EADC7] block">Comissão</span>
                  <span className="font-bold text-[#20C997]">
                    R$ {item.commission.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
